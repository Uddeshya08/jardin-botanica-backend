import { createOrderFulfillmentWorkflow } from "@medusajs/medusa/core-flows";
import { sendOrderConfirmationEmail } from "../email.service";
import handleOrderPlaced from "../../subscribers/order-placed";

jest.mock("@medusajs/medusa/core-flows", () => ({ createOrderFulfillmentWorkflow: jest.fn() }));
jest.mock("../email.service", () => ({ sendOrderConfirmationEmail: jest.fn() }));

describe("placed order confirmation and fulfillment", () => {
  let container: any, run: jest.Mock;
  const order = { id: "order_test", display_id: 57, email: "customer@example.com", items: [{ id: "item_1", quantity: 1 }] };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    (sendOrderConfirmationEmail as jest.Mock).mockResolvedValue(undefined);
    run = jest.fn().mockResolvedValue({ result: { id: "ful_test" }, errors: [] });
    (createOrderFulfillmentWorkflow as unknown as jest.Mock).mockReturnValue({ run });
    container = { resolve: (key: string) => key === "query"
      ? { graph: async () => ({ data: [{ ...order }] }) }
      : { updateOrders: jest.fn() } };
  });
  afterEach(() => jest.restoreAllMocks());

  it("attempts confirmations even if shipment creation fails", async () => {
    run.mockRejectedValue(new Error("courier unavailable"));
    await expect(handleOrderPlaced({ event: { data: { id: order.id } }, container } as any)).rejects.toThrow("courier unavailable");
    expect(sendOrderConfirmationEmail).toHaveBeenCalledWith(expect.objectContaining({ id: order.id }));
    expect((sendOrderConfirmationEmail as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(run.mock.invocationCallOrder[0]);
  });

  it("does not prevent fulfillment when one or both confirmation sends fail", async () => {
    (sendOrderConfirmationEmail as jest.Mock).mockRejectedValue(new Error("Order confirmation failed for: merchant"));
    await handleOrderPlaced({ event: { data: { id: order.id } }, container } as any);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
