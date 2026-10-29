# Meta Conversions API

This first integration sends **Purchase** events from the backend only. No browser Pixel, page views,
cart events, or checkout events are installed. Existing order, fulfillment, payment, email, and
storefront code is unchanged. No dependency installation is needed (Node 22 native fetch).

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
2. Connect your marketing-consent collection to **order metadata** `meta_capi_consent: true`.
   This integration does not assume that newsletter preferences imply marketing tracking consent.
   Without this explicit boolean flag, no customer information is sent. No consent UI is added in this release.
3. Set `META_CAPI_ENABLED=true` and restart the backend. Missing credentials do not block orders;
   the independent tracking subscriber/job logs a sanitized error instead.
4. Ensure a Medusa worker that runs subscribers and scheduled jobs is operating.
5. Place a fresh consented test order with the test code temporarily configured; confirm a fully captured
   prepaid payment results in one Purchase in Test Events. Verify its currency, amount, and event ID.
6. Disable the test code and verify real events appear in the dataset overview (reporting may be delayed).

```text
order.placed → independent subscriber → persistent queue (order ID only)
                                               ↓ each minute
                 order consent + payment eligibility checked
                                               ↓
                     hashed Purchase → Meta dataset /events
                                               ↓
                  acknowledge → mark sent, clear payload
                  transient failure → backoff, same event ID
```

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
commit. If testing before attaching persistent Meta secrets, use an operator session with those
variables already exported and pass only variable names (not literal secret values) to Docker:

```sh
docker exec -e META_PIXEL_ID -e META_CAPI_ACCESS_TOKEN -e META_TEST_EVENT_CODE BACKEND_CONTAINER ./entrypoint.sh node node_modules/@medusajs/cli/cli.js exec ./src/scripts/validate-meta-capi.js send-test expected-dataset-id=YOUR_DATASET_ID
```

Keep `META_CAPI_ENABLED=false` until validation, the database migration, and the consent flow are
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
  hashed; ambiguous international numbers are omitted. Customer ID is also hashed. Names, addresses,
  IPs, browser user agents, tokens, and raw Meta response bodies are not logged or included.
- No `_fbp`, `_fbc`, or browser context is fabricated. Their collection and browser Pixel integration
  are separate future work. Match quality and ad attribution may be lower without them.
- Payloads contain matching hashes only and are deleted from queue rows after sent/skipped/failed.
  Stable receipt rows remain to prevent re-enqueueing. Hashes are still personal data; include this
  table in your retention and customer-erasure procedures.
- Event IDs use `purchase_<order_id>`. The primary key is deterministic per dataset/order. Repeated
  subscriber events do not create additional queue rows. Retries use the same event name/ID for Meta
  deduplication; a future browser Purchase must use that same ID.
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
