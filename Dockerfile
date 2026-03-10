# Medusa v2 Production Dockerfile
# Based on official Medusa documentation: https://docs.medusajs.com/learn/deployment/general

# =============================================================================
# STAGE 1: Dependencies
# =============================================================================
FROM node:22-alpine AS deps

# Enable Corepack for Yarn 4
RUN corepack enable && corepack prepare yarn@4.3.1 --activate

WORKDIR /app

# Copy package files for layer caching
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn

# Install all dependencies (including devDependencies for build)
RUN yarn install --immutable

# =============================================================================
# STAGE 2: Builder
# =============================================================================
FROM deps AS builder

WORKDIR /app

# Copy source code
COPY . .

# Build application (outputs to .medusa/server/)
# This creates a standalone production build
RUN yarn medusa build

# Install production dependencies in the build directory
WORKDIR /app/.medusa/server
RUN yarn install --production --frozen-lockfile

# =============================================================================
# STAGE 3: Production
# =============================================================================
FROM node:22-alpine AS production

# Install curl for healthchecks
RUN apk add --no-cache curl

# Create non-root user
RUN addgroup -g 1001 -S medusa && \
    adduser -S medusa -u 1001 -G medusa

# Set production environment BEFORE any operations
# This prevents ts-node from loading
ENV NODE_ENV=production
ENV PORT=9000

# Set working directory to the built application
WORKDIR /app

# Copy the entire built application from builder
COPY --from=builder --chown=medusa:medusa /app/.medusa/server ./

# Copy static assets if they exist (for admin dashboard)
COPY --from=builder --chown=medusa:medusa /app/static ./static 2>/dev/null || true

# Copy entrypoint script
COPY --chown=medusa:medusa entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Switch to non-root user
USER medusa

# Expose port
EXPOSE 9000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:9000/health || exit 1

# Start the application via entrypoint
CMD ["./entrypoint.sh"]
