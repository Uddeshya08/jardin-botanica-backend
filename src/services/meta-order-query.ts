// Medusa calculates order totals from these relations. Selecting only product_id,
// quantity or shipping data omits prices, taxes and adjustments needed for totals.
// Keep the worker and the read-only readiness check on the same projection.
// query.graph uses relation.*; HTTP API selectors like *relation are not valid here.
export const META_ORDER_FIELDS = [
  "id", "status", "created_at", "total", "currency_code", "email", "customer_id", "metadata",
  "shipping_address.phone", "shipping_address.country_code",
  "items.*", "items.detail.*", "items.tax_lines.*", "items.adjustments.*",
  "shipping_methods.*", "shipping_methods.tax_lines.*", "shipping_methods.adjustments.*",
  "credit_lines.*",
  "payment_collections.status", "payment_collections.captured_amount",
  "payment_collections.completed_at", "payment_collections.payments.provider_id",
];
