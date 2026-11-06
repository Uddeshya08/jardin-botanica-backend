# Meta Conversions API

PageView, ViewContent, AddToCart and Purchase support paired Pixel/CAPI reports with the same event name, dataset and event ID. Purchase CAPI remains independently driven by order.placed; the browser reads its canonical eligibility and value on confirmation. The backend uses Node 22 native fetch. See the rollout steps below before deploying the new relay.

## Configuration

Set these in the backend hosting secret/environment settings, never in the storefront or Git:

```dotenv
META_CAPI_ENABLED=false
META_PIXEL_ID=<Dataset ID copied from JB Web Data settings>
META_CAPI_ACCESS_TOKEN=<private token generated for that dataset>
META_GRAPH_API_VERSION=v26.0
META_STOREFRONT_URL=https://www.jardinbotanica.com
META_TEST_EVENT_CODE=<code from that same dataset's Test events tab>
META_CAPI_COD_PURCHASE=disabled
```

`META_PIXEL_ID` is the website Dataset/Pixel ID, **not** the ad account, business portfolio, or App ID.
An event is addressed to that dataset, not directly to an ad account. In Business Settings,
check that **JB Web Data → Owner** is the intended business and **Connected assets** includes the
intended ad account. A successful API receipt alone does not establish business ownership or campaign attribution.

The default API version follows Meta's official Node SDK at implementation time. Keep the configured
version maintained before Meta retires it.

## Verify the correct destination before enabling real events

1. Open Events Manager → **JB Web Data → Settings**. Copy its exact Dataset ID.
2. Confirm it matches `META_PIXEL_ID` on your backend. Do not reuse IDs from earlier app/ad-account screens.
3. Open that dataset's **Test events** and set `META_TEST_EVENT_CODE` temporarily.
4. Run from the backend project using its configured environment:

   ```sh
   npx medusa exec ./src/scripts/validate-meta-capi.ts
   npx medusa exec ./src/scripts/validate-meta-capi.ts send-test expected-dataset-id=YOUR_DATASET_ID
   ```

   The first command attempts a read of the dataset ID/name and sends no events. Some tokens can send
   events but lack permission to read asset details; a read failure is not proof that event ingestion fails.
   The second command requires both an explicitly matching ID and a test code. It sends one synthetic
   `CapiConnectionTest` event, not a Purchase, and prints a receipt and unique event ID without the token.
5. In that exact dataset's **Test events**, confirm **CapiConnectionTest**, connection method **Server**,
   and the matching event ID. `events_received: 1` means accepted, not attributed or matched to a person.
6. Check **Diagnostics** for errors. Remove `META_TEST_EVENT_CODE` before normal production tracking.

These commands do not require `META_CAPI_ENABLED=true`; you can validate with commerce tracking disabled.
No production Meta calls were made during implementation. Credentials have not been configured here.

## Enable purchase tracking

1. Deploy the additive module and run `npx medusa db:migrate` through your normal deployment process.
   The migration creates only `meta_conversion_event`. Do not run a migration blindly against a production database.
   The repository's package build/start scripts run migrations, but the Docker entrypoint does not.
   For the current Docker Swarm deployment, follow the container commands below before enabling tracking.
2. Deploy the storefront privacy disclosure describing Meta server-side purchase sharing. Checkout opt-in is not required by this implementation. Existing explicit refusals (`meta_capi_consent: false`) are respected. The merchant remains responsible for applicable privacy requirements.
3. Set `META_CAPI_ENABLED=true` and restart the backend. Missing credentials do not block orders;
   the independent tracking subscriber/job logs a sanitized error instead.
4. Ensure a Medusa worker that runs subscribers and scheduled jobs is operating.
5. Place a fresh test order with the test code temporarily configured; confirm a fully captured
   prepaid payment results in one Purchase in Test Events. Verify its currency, amount, and event ID.
6. Disable the test code and verify real events appear in the dataset overview (reporting may be delayed).

```text
order.placed → independent subscriber → persistent queue (order ID only)
                                               ↓ each minute
                 recorded refusal + payment eligibility checked
                                               ↓
                     hashed Purchase → Meta dataset /events
                                               ↓
                  acknowledge → mark sent, clear payload
                  transient failure → backoff, same event ID
```

## Production live tracking configuration

The production stack enables `META_CAPI_ENABLED=true` and
`META_CAPI_COD_PURCHASE=order_placed`. A COD Purchase represents order placement,
not cash collection or successful delivery. Subsequent cancellations and failed
deliveries do not automatically retract a Purchase already sent.

The stack requires only the external `META_PIXEL_ID` and `META_CAPI_ACCESS_TOKEN`
secrets. It leaves `META_TEST_EVENT_CODE` empty and does not mount the test-code
secret. Keep the existing test secret in Swarm for future validation if needed;
do not delete credentials to switch reporting modes.

To apply these settings directly to the current service after validation:

```sh
docker service update \
  --env-add META_CAPI_ENABLED=true \
  --env-add META_CAPI_COD_PURCHASE=order_placed \
  --env-add META_TEST_EVENT_CODE= \
  --secret-rm META_TEST_EVENT_CODE_v2 \
  jd-backend_api
```

This rolls the backend service. Check service convergence and `/health`.
New orders use live mode. Existing queued events retain their original test code;
removing the secret does not convert queued test events into live events. Orders
already skipped because COD was disabled are not automatically replayed.

## Production Docker Swarm deployment and validation

Pushing backend `main` triggers `.github/workflows/ci.yml`: typecheck, Docker image build/push,
then stack deployment. Leave tracking disabled for that first deployment. This adds a module; it does
not automatically install the queue table in the current Docker startup path.

On the production Swarm node, identify the running container after the new image is healthy:

```sh
docker ps --filter label=com.docker.swarm.service.name=jd-backend_api --format '{{.ID}} {{.Image}} {{.Status}}'
```

Replace `BACKEND_CONTAINER` in the commands below with that container ID. The entrypoint wrapper
loads the same existing mounted secrets as the server. Compiled production scripts use `.js`, not `.ts`.

```sh
# Apply pending migrations during the normal deployment maintenance step before enabling tracking.
docker exec BACKEND_CONTAINER ./entrypoint.sh node node_modules/@medusajs/cli/cli.js db:migrate

# Show identity only. No event is sent.
docker exec BACKEND_CONTAINER ./entrypoint.sh node node_modules/@medusajs/cli/cli.js exec ./src/scripts/validate-meta-capi.js

# One synthetic event, kept in the selected dataset's Test Events.
docker exec BACKEND_CONTAINER ./entrypoint.sh node node_modules/@medusajs/cli/cli.js exec ./src/scripts/validate-meta-capi.js send-test expected-dataset-id=YOUR_DATASET_ID
```

The Meta variables must be present inside the container. Creating Docker secrets alone is insufficient:
they must also be attached to the service. Do not add required external Meta secrets to `docker-stack.yml`
until they exist, as that would fail the entire stack deployment. Credentials are not supplied by this
integration. If testing before attaching persistent Meta secrets, use an operator session with those
variables already exported and pass only variable names (not literal secret values) to Docker:

```sh
docker exec -e META_PIXEL_ID -e META_CAPI_ACCESS_TOKEN -e META_TEST_EVENT_CODE BACKEND_CONTAINER ./entrypoint.sh node node_modules/@medusajs/cli/cli.js exec ./src/scripts/validate-meta-capi.js send-test expected-dataset-id=YOUR_DATASET_ID
```

Keep `META_CAPI_ENABLED=false` until validation, the database migration, and privacy disclosure deployment are
complete. Check `/health` and the service logs following deployment. Confirm the test event in
**JB Web Data**, verify its Dataset ID and owner, and compare the returned unique event ID.

## Behavior and limits

- Disabled by default. No Meta calls are made from checkout, payment capture, or fulfillment workflows.
- Prepaid Purchase waits for all payment collections to complete with the full order amount captured.
  Captured-payment completion time supplies `event_time`; authorization alone is not a Purchase.
- COD/manual payments are excluded by default. Set `META_CAPI_COD_PURCHASE=order_placed` only if that is
  your agreed conversion definition. Delivery-based COD needs the separate Delhivery status integration.
- Order total includes whatever Medusa includes in its calculated total, including shipping and tax.
  Medusa v2 major currency units are sent unchanged: INR 1800 stays 1800, not 18.
- Email is trimmed/lowercased and SHA-256 hashed. Phones are normalized to international digits and
  hashed; ambiguous international numbers are omitted. Customer ID is also hashed. First/last names, city, state, postal code and country are also normalized and hashed for matching. Stored customer profile metadata `gender` and `date_of_birth` is included only when present and valid; no demographic values are inferred and no new form fields are added. Street addresses, IPs, browser user agents, tokens, and raw Meta response bodies are not included in Purchase payloads or logs.
- No `_fbp`, `_fbc`, or browser context is fabricated. Their collection and browser Pixel integration
  are forwarded only when actually available for paired page/product/cart events. ParamBuilder is not installed. Server Purchase does not yet capture shopper browser context.
- Purchase payloads contain matching hashes and are deleted from queue rows after sent/skipped/failed. The separate browser-event queue temporarily contains real browser/network context and clears its payload after sent/failed.
  Stable receipt rows remain to prevent re-enqueueing. Hashes are still personal data; include this
  table in your retention and customer-erasure procedures.
- Event IDs use `purchase_<order_id>`. The primary key is deterministic per dataset/order. Repeated
  subscriber events do not create additional queue rows. Retries use the same event name/ID for Meta
  deduplication; the browser Purchase uses that same ID.
- Polls at most 20 pending rows per minute. Ten failed attempts maximum with exponential backoff,
  capped at one hour. Network timeout is five seconds. Pending payment can wait up to seven days;
  ready events are sent/retried only within 24 hours of purchase time, keeping retries within Meta's
  duplicate-event window. Older events require investigation, not automatic timestamp rewriting.
- Queue delivery is at least once. Run one scheduler worker for this job; simultaneous workers may
  attempt the same stable-ID event, for which Meta deduplication is the last line of defense.
  A process-local guard prevents overlapping cron runs within that worker. Test-event codes are
  pinned when queued so removing test configuration cannot turn pending test orders into live events.
- No historical backfill is performed. If the queue insert fails, it is logged and does not affect the
  order. Such orders need explicit review/re-enqueue; this is not an exactly-once transaction with order creation.
- To stop sending immediately, set `META_CAPI_ENABLED=false` and restart the worker/backend.

Inspect queue state through your database tooling without exposing payloads:

```sql
select order_id, dataset_id, status, attempts, last_error, next_attempt_at
from meta_conversion_event
where deleted_at is null
order by created_at desc;
```

## References

- [Meta CAPI usage](https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api/)
- [Official Meta event request implementation](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/objects/serverside/event-request.js)
- [Official Meta user-data implementation](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/objects/serverside/user-data.js)

## Browser product and cart events

Set `NEXT_PUBLIC_META_PIXEL_ID=1489706953077337` in the storefront hosting/build
settings before building. This is a public identifier and must match backend
`META_PIXEL_ID`. Do not put the CAPI access token in frontend environment variables.
An empty/invalid public Pixel ID disables browser tracking. Paired CAPI forwarding requires the browser-event queue migration and relay credentials described below. No dependency installation is needed.

- `ViewContent` fires once per product-page visit, with the product ID and available
  calculated price/currency. React effect replay and variant rerenders do not add views.
- `AddToCart` fires after a successful cart mutation, including quick-add, product,
  recommendations, sticky cart and gift-set flows. Quantity replacement sends only
  positive increases; failed additions, unchanged quantities, and decreases do not send.
- Both events use product IDs, matching Purchase content IDs, and Medusa major currency
  units. Page/product/cart events each receive a unique ID shared by Pixel and CAPI. Purchase uses purchase_<order_id> on both paths.
- A recorded cookie-banner rejection suppresses browser events. Browser blockers can
  prevent browser events. JavaScript forwards corresponding events to a durable backend queue through a first-party relay. Existing fbc/fbp cookies are forwarded for these server counterparts, but are never fabricated. ParamBuilder is not installed.
- Validate with Meta Test Events browser testing tools or Meta Pixel Helper, using a
  test product view, successful add, failed add and a quantity decrease. Browser event
  test tooling is separate from backend `META_TEST_EVENT_CODE`.

Purchase user-data API keys: `fn`, `ln`, `ct`, `st`, `zp` (postal code), `country`,
`ge` (gender) and `db` (date of birth). All supplied matching values are normalized
and SHA-256 hashed. No raw names/locations/demographics are logged.
## Paired event rollout (2026-11-06)

The code is dormant unless the relay is configured. **Create the external Docker
secret before deploying the updated stack**, which now requires it:

1. Generate one random 32+ character credential in a password manager. Keep it
   available to paste into both Docker and Vercel. It is not a Meta access token.
2. On the Swarm manager, check whether the secret already exists. Existing Docker
   secrets are immutable; rotate a wrong value rather than deleting a live secret.

   ```sh
   docker secret inspect META_CAPI_RELAY_SECRET --format '{{.Spec.Name}}'
   # Only if missing:
   read -r -s -p 'Relay credential: ' meta_relay_secret
   printf '%s' "$meta_relay_secret" | docker secret create META_CAPI_RELAY_SECRET -
   unset meta_relay_secret
   ```

3. Deploy backend code. The stack persists `META_CAPI_BROWSER_EVENTS_ENABLED=true`
   and attaches the secret. Apply the additive migration `Migration20261106000000`
   to create `meta_browser_event`. Original Purchase queue behavior is unchanged.
   The new browser job may log an unavailable-table error until migration finishes.
   The frontend should not receive its relay credential until migration is complete.
4. For this installation's non-SSL PostgreSQL server, use the previously validated
   process-only SSL override (replace BACKEND_CONTAINER with the new container ID):

   ```sh
   docker exec BACKEND_CONTAINER ./entrypoint.sh node -e '
   const { spawnSync } = require("node:child_process");
   const u = new URL(process.env.DATABASE_URL);
   u.searchParams.set("ssl_mode", "disable");
   u.searchParams.set("sslmode", "disable");
   const result = spawnSync(process.execPath, [
     "node_modules/@medusajs/cli/cli.js", "db:migrate"
   ], { stdio: "inherit", env: { ...process.env, DATABASE_URL: u.toString(), PGSSLMODE: "disable" } });
   process.exit(result.status ?? 1);
   '
   ```

5. In Vercel **Production**, set server-only `META_CAPI_RELAY_SECRET` to the same
   credential. Keep `NEXT_PUBLIC_META_PIXEL_ID=1489706953077337` and the production
   backend URLs configured. Redeploy the frontend. Never prefix the relay credential
   or Meta access token with NEXT_PUBLIC_. No Meta access token belongs in Vercel.
6. Run the readiness script and confirm `browser_pairing_enabled: true` and
   `browser_queue_table_available: true`. Both workers must run on the backend.

### Identity and delivery rules

- A PageView, ViewContent or AddToCart generates one UUID in the browser. The exact
  name and ID are supplied to Pixel `eventID` and server `event_id`. A first-party
  `/api/meta/events` route authenticates the call to the backend with the relay
  credential. It uses HTTP browser context, not client-submitted IP or user agent.
- Repeat admission and delivery attempts retain the same event identity. Browser
  transport retries once; the persistent browser queue retries up to ten attempts
  within 24 hours. Sent/failed payloads are cleared. Stable receipt IDs remain.
- Page/product/cart events require JavaScript. A blocked Meta script can still leave
  the first-party relay working, but JavaScript blockers, network failures and closing
  a page can prevent both paths. The noscript PageView is browser-only.
- The separate browser queue processes up to 50 rows per minute. Purchase retains
  its independent queue and scheduler, preventing page views from taking its slots.
  Use one scheduler instance. Delivery is at least once, not exactly once.
- Browser Purchase does not enqueue or resend CAPI Purchase. It requests a read-only
  server plan after order confirmation, waits up to about one minute for capture/
  subscriber readiness, and uses `purchase_<order_id>` with the canonical CAPI
  value/currency. COD follows the existing order_placed rule; prepaid requires full
  capture. Browser events do not carry names, email addresses or matching hashes.
- A per-tab receipt suppresses repeat browser Purchases on reload; stable IDs let
  Meta recognize repeats across tabs as well. Orders outside the 24-hour eligibility
  window and old skipped/failed/test receipts never become new browser Purchases.
- Matching dataset IDs are enforced. Canceled orders and recorded refusals are
  excluded. Cookie rejection suppresses browser events and derived page/product/cart
  server reports; existing independent Purchase consent behavior is unchanged.
- This paired page/product/cart relay is **live mode only**. It refuses new events
  while META_TEST_EVENT_CODE is set. Queued live events remain live if configuration
  later changes. Browser Purchase is suppressed for server test-mode configuration
  and pinned test receipts. Do not attach a test code during this live rollout.
- Preview origins are excluded from the relay. Rate limiting is per Vercel instance
  (120 requests per IP per minute, bounded memory); it is not a distributed anti-bot
  system. Backend relay authentication, schema checks and size limits supplement it.
- New browser events collect available real IP/user-agent and existing fbc/fbp;
  include the new queue in retention and customer-erasure procedures. They do not
  change the existing hashed matching fields on independent CAPI Purchase.

### Verification without replaying customer orders

Use a fresh page view and successful add. In browser DevTools, compare the Pixel
request's event ID with the JSON `event_id` sent to `/api/meta/events`. In the
backend queue/logs, confirm the identical name/ID is acknowledged. Do not reset
sent receipts to test deduplication.

For a fresh eligible order, the browser plan and existing CAPI queue must both use
`purchase_<order_id>` with the same dataset. Verify Meta's event details show Browser
and Server sources and inspect deduplication diagnostics after processing. Receiving
two reports is expected; mismatched IDs/names/datasets would prevent pairing.

Inspect receipt state without printing payloads:

```sql
select event_name, event_id, dataset_id, status, attempts, last_error
from meta_browser_event
where deleted_at is null
order by created_at desc
limit 20;
```