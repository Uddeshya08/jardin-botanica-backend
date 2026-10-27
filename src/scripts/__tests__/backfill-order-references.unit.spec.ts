import backfillOrderReferences from "../backfill-order-references";

describe("order reference backfill", () => {
  const orders = {
    listOrders: jest.fn(),
    updateOrders: jest.fn(),
  };
  const container = { resolve: jest.fn().mockReturnValue(orders) };
  const existing = {
    id: "order_1",
    display_id: 29,
    metadata: { source: "checkout" },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.APPLY_ORDER_REFERENCE_BACKFILL;
    orders.listOrders.mockResolvedValue([existing]);
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.APPLY_ORDER_REFERENCE_BACKFILL;
    jest.restoreAllMocks();
  });

  it("previews without changing orders by default", async () => {
    await backfillOrderReferences({ container } as any);
    expect(orders.updateOrders).not.toHaveBeenCalled();
  });

  it("persists the reference without removing other metadata when enabled", async () => {
    process.env.APPLY_ORDER_REFERENCE_BACKFILL = "true";
    await backfillOrderReferences({ container } as any);
    expect(orders.updateOrders).toHaveBeenCalledWith("order_1", {
      metadata: { source: "checkout", order_reference: "JB-260029" },
    });
  });
});
