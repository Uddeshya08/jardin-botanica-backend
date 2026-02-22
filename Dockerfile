FROM node:22-alpine AS deps

RUN corepack enable && corepack prepare yarn@4.3.1 --activate

WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn

RUN --mount=type=cache,target=/root/.yarn,sharing=locked \
    yarn install --frozen-lockfile

FROM deps AS builder

COPY . .

RUN yarn medusa build && yarn workspaces focus --production

FROM node:22-alpine AS production

RUN apk add --no-cache curl && \
    addgroup -g 1001 -S medusa && \
    adduser -S medusa -u 1001 -G medusa

WORKDIR /app

COPY --from=builder --chown=medusa:medusa /app/.medusa/server ./
COPY --from=builder --chown=medusa:medusa /app/node_modules ./node_modules
COPY --from=builder --chown=medusa:medusa /app/static ./static
COPY --from=builder --chown=medusa:medusa /app/medusa-config.ts ./medusa-config.ts
COPY --from=builder --chown=medusa:medusa /app/package.json ./package.json

USER medusa

EXPOSE 9000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:9000/health || exit 1

ENV NODE_ENV=production

CMD ["npx", "medusa", "start"]
