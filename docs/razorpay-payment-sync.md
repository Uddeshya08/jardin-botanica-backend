# Razorpay payment synchronization fix

## Incident and changes

- A captured Razorpay payment had no payment.notes.session_id. The old handler passed an undefined session ID into Medusa's payment workflow.
- A separate shipping-profile mismatch prevented browser cart completion. Fix the product/shipping-option configuration in Admin; payment synchronization does not remove shipping requirements.
- The provider also interpreted capture-operation idempotency keys as payment-session IDs. These keys can identify captures rather than sessions.
- The exact origin of the observed "Order older than 180 days" response has not been proven. Missing session filters can cause incorrect downstream lookups; the patch prevents forwarding an undefined session ID.

## Behavior

1. Validate the webhook signature before looking up records. Ignore unsupported events without returning a payment action.
2. Fetch the current Razorpay payment/order to handle delayed and out-of-order event snapshots.
3. Resolve a session from validated notes. For legacy orders without notes, query payment sessions by the exact stored data.razorpayOrder.id and Razorpay provider, with a limit of two.
4. Require exactly one mapping and matching provider, order ID, currency and amount. Reject missing, conflicting, ambiguous or canceled mappings.
5. Forward an explicit session ID and amount in major currency units to Medusa's existing payment workflow.
6. Recognize full, unrefunded captured funds without another capture request. For an authorized payment, capture only one matching full payment using the provider's amount in minor units.
7. If provider auto-capture wins a race, read the payment again and accept only verified captured state.
8. Refunded payments are not replayed as successful payments. Failed attempts do not fail a whole session that another attempt can still pay.
9. New orders contain both session_id and medusa_payment_session_id notes. New order amounts preserve fractional major units.

```text
Signed webhook -> current provider state -> verified session mapping
  -> Medusa payment workflow -> cart completion validation -> order
```

Repeated notifications retain the same payment-session identity. Existing Medusa workflows provide payment/cart handling; this patch does not add a new durable webhook inbox, retry queue or exactly-once delivery guarantee. HTTP receipt success is not proof of asynchronous processing success.

## Implementation and tests

- Changes extend patches/medusa-plugin-razorpay-v2+0.1.2.patch; postinstall applies this patch in the production image.
- src/services/__tests__/razorpay-provider.unit.spec.ts executes the patched dependency source with mocked payment and database services.
- Cases cover missing notes, exact legacy lookup, conflicting/ambiguous mappings, currency/amount/provider mismatch, signature rejection, out-of-order and duplicate delivery, refunds, capture races, payment state and new-order notes.
- Automated tests do not call Razorpay or production PostgreSQL. Validate the legacy nested JSON lookup and the complete Medusa workflow in a test deployment before live rollout.

## Deployment and verification

1. Build/deploy the reviewed backend patch through the usual image pipeline. No database migration or new secret is required for this fix.
2. Verify patch-package succeeds during dependency installation and the service is healthy.
3. In Razorpay Test Mode, use a cart with matching product/option shipping profiles. Check checkout and webhook processing with empty payment notes and new order notes.
4. Verify a captured payment updates the intended Medusa collection and completes only its associated cart. Replay a notification and verify no duplicate order/capture.
5. Test a mismatched shipping profile: completion must remain blocked; the operational fix is correct configuration, not bypassing validation.
6. Inspect sanitized "Razorpay webhook mapped" logs and the resulting Medusa payment/order. Full webhook payload logging was removed from this handler.

## Historical orders and external refunds

- This fix does not refund or recover any historical transaction automatically.
- The investigated cart was subsequently completed through the normal Medusa endpoint after its shipping profile was corrected. Do not replay that completed incident as a new order.
- If the merchant refunds the affected payment externally, verify refund state before any recovery/replay. Do not complete the refunded cart as paid or reuse its old payment session for a new purchase.
- A replacement purchase should use a fresh cart/payment session after shipping configuration and deployment have been verified.
- Do not manually edit payment_collection/payment rows to force payment status.

## References

- [Razorpay webhook validation and event ordering](https://razorpay.com/docs/webhooks/validate-test/)
- [Razorpay payment webhooks](https://razorpay.com/docs/webhooks/payments/)
