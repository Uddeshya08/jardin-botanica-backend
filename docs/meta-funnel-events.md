# Meta checkout events

- InitiateCheckout: entering checkout with a valid non-empty cart. One event per cart/browser session.
- AddPaymentInfo: successful Continue after shipping/payment-session setup. One event per cart/payment selection/session, including COD.
- Pixel and CAPI share event name and ID. Available real fbp/fbc follow the existing relay. Explicit cookie refusal is respected.
- CAPI uses the existing minute-level browser-event queue; these are relayed browser observations.
- No address, phone or email form values are included in custom_data. Cart totals use Medusa major currency units.
- COD payment selection does not mean cash has been collected.

## Deployment

1. Deploy backend and apply module migrations before frontend.
2. Migration20261106000000 creates meta_browser_event if missing. Migration20261116000000 expands its event-name constraint to the existing three events plus the two checkout events.
3. Existing credentials/dataset and relay secret are reused. No new secret is required.
4. Test successful/failed payment setup, repeat rendering/reloads and Pixel/CAPI event-ID pairing.
5. The current paired-browser relay rejects events when META_TEST_EVENT_CODE is set. Use a dedicated test dataset with matching origins and an empty test code for paired testing.

The new Search, Lead and CompleteRegistration integration remains outside this release. Production migrations are manual in the current Docker startup path.
