jest.mock("@medusajs/framework/utils", () => ({
  AbstractFulfillmentProviderService: class {},
}));
jest.mock("../api-client", () => ({ DelhiveryApiClient: jest.fn() }));

import DelhiveryFulfillmentProviderService from "../service";

describe("fixed COD handling fee", () => {
  const service = Object.create(DelhiveryFulfillmentProviderService.prototype);
  const client = {
    calculateShippingCost: jest.fn(),
    checkServiceability: jest.fn(),
  };
  const context = {
    shipping_address: { postal_code: "462044" },
    from_location: { address: { postal_code: "462024" } },
    items: [{ variant: { weight: 200 }, quantity: 1 }],
  };

  beforeEach(() => {
    client.calculateShippingCost.mockClear();
    service.client_ = client;
    client.calculateShippingCost.mockResolvedValue([{ total_amount: 39.07 }]);
    client.checkServiceability.mockResolvedValue({
      delivery_codes: [{ postal_code: { pre_paid: "Y", cod: "Y" } }],
    });
  });

  it("adds exactly 100 to delivery for COD and removes it when switching to prepaid", async () => {
    for (const [paymentMethod, amount] of [["COD", 139.07], ["COD", 139.07], ["PREPAID", 39.07]] as const) {
      const price = await service.calculatePrice(
        { shipping_mode: "Surface" }, { paymentMethod, cod_fee: 999 }, context,
      );
      expect(price.calculated_amount).toBe(amount);
      expect(client.calculateShippingCost).toHaveBeenLastCalledWith(
        expect.objectContaining({ paymentType: "Pre-paid" }),
      );
    }
  });

  it.each(["COD", "PREPAID"])("records the authoritative fee for %s", async (paymentMethod) => {
    const data = await service.validateFulfillmentData(
      { shipping_mode: "Surface" }, { paymentMethod, cod_fee: 999 }, context,
    );
    expect(data.cod_fee).toBe(paymentMethod === "COD" ? 100 : 0);
  });

  it("allows the last cart item to be removed without requesting a shipping price", async () => {
    const price = await service.calculatePrice(
      { shipping_mode: "Surface" },
      { paymentMethod: "PREPAID" },
      { ...context, items: [] },
    );

    expect(price).toEqual({
      calculated_amount: 0,
      is_calculated_price_tax_inclusive: false,
    });
    expect(client.calculateShippingCost).not.toHaveBeenCalled();
  });
});
