export const ORDER_REFERENCE_METADATA_KEY = "order_reference";

export function formatOrderReference(displayId: number): string {
  return `JB-2600${String(displayId).padStart(2, "0")}`;
}

export function getOrderReference(order: {
  display_id?: number | string | null;
  metadata?: Record<string, unknown> | null;
}): string | null {
  const displayId = Number(order.display_id);
  if (!Number.isInteger(displayId) || displayId <= 0) {
    return null;
  }

  const expected = formatOrderReference(displayId);
  const saved = order.metadata?.[ORDER_REFERENCE_METADATA_KEY];
  if (saved === expected) {
    return saved;
  }
  return expected;
}
