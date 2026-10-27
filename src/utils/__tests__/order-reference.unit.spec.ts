import { formatOrderReference, getOrderReference } from "../order-reference";

describe("order reference", () => {
  it.each([
    [1, "JB-260001"],
    [29, "JB-260029"],
    [101, "JB-2600101"],
  ])("formats existing order number %i", (displayId, expected) => {
    expect(formatOrderReference(displayId)).toBe(expected);
    expect(getOrderReference({ display_id: displayId })).toBe(expected);
  });

  it("prefers the persisted reference", () => {
    expect(getOrderReference({
      display_id: 29,
      metadata: { order_reference: "JB-260029" },
    })).toBe("JB-260029");
  });

  it("derives the correct reference when saved metadata is stale", () => {
    expect(getOrderReference({
      display_id: 29,
      metadata: { order_reference: "JB-260001" },
    })).toBe("JB-260029");
  });
});
