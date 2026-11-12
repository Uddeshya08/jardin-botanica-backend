import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createOrderShipmentWorkflow, markOrderFulfillmentAsDeliveredWorkflow } from "@medusajs/medusa/core-flows";
import syncDelhiveryTracking from "../../jobs/delhivery-tracking";
import { DelhiveryApiClient } from "../../modules/delhivery-fulfillment/api-client";
import { getDelhiveryTracking } from "../../utils/delhivery-tracking";

jest.mock("@medusajs/medusa/core-flows", () => ({
  createOrderShipmentWorkflow: jest.fn(),
  markOrderFulfillmentAsDeliveredWorkflow: jest.fn(),
}));
jest.mock("../../modules/delhivery-fulfillment/api-client", () => ({
  DelhiveryApiClient: jest.fn(),
}));

const waybill = "123456789012";
const carrierResponse = (status: string, type: string, date = "2026-11-12T14:10:00") => ({
  ShipmentData: [{ Shipment: { AWB: waybill, Status: {
    Status: status, StatusType: type, StatusDateTime: date,
  } } }],
});

describe("Delhivery fulfillment sync", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env, DELHIVERY_TRACKING_SYNC_ENABLED: "true", DELHIVERY_API_TOKEN: "test" };
  });

  afterEach(() => {
    process.env = env;
    jest.resetAllMocks();
  });

  function setup(status: string, type: string) {
    const order: string[] = [];
    const fulfillment = {
      id: "ful_test", data: { waybill }, metadata: { custom: true },
      labels: [{ id: "ful_label", tracking_number: waybill, tracking_url: "https://example.com/tracking", label_url: "" }],
      items: [{ line_item_id: "ordli_test", quantity: 1 }],
      shipped_at: null as Date | null, delivered_at: null as Date | null,
    };
    const ship = jest.fn(async () => {
      order.push("shipped");
      fulfillment.shipped_at = new Date();
    });
    const deliver = jest.fn(async () => {
      order.push("delivered");
      fulfillment.delivered_at = new Date();
    });
    (createOrderShipmentWorkflow as unknown as jest.Mock).mockReturnValue({ run: ship });
    (markOrderFulfillmentAsDeliveredWorkflow as unknown as jest.Mock).mockReturnValue({ run: deliver });
    const track = jest.fn().mockResolvedValue(carrierResponse(status, type));
    (DelhiveryApiClient as jest.Mock).mockReturnValue({ trackShipment: track });
    const update = jest.fn(async (_id, data) => { fulfillment.metadata = data.metadata; });
    const query = jest.fn(async ({ entity }) => ({
      data: entity === "order_fulfillment" ? [{ order_id: "order_test" }] : [fulfillment],
    }));
    const services = {
      [ContainerRegistrationKeys.QUERY]: { graph: query },
      [ContainerRegistrationKeys.LOGGER]: { error: jest.fn(), warn: jest.fn() },
      [Modules.FULFILLMENT]: { retrieveFulfillment: async () => fulfillment, updateFulfillment: update },
      [Modules.LOCKING]: { execute: async (_key: string, callback: () => Promise<void>) => callback() },
    };
    const container = { resolve: (key: keyof typeof services) => services[key] } as unknown as MedusaContainer;
    return { container, fulfillment, order, ship, deliver, update, track, query };
  }

  it("maps forward scans and rejects a mismatched waybill", () => {
    expect(getDelhiveryTracking(carrierResponse("Manifested", "UD"), waybill)).toMatchObject({
      stage: "Ready to ship", shipped: false, delivered: false,
    });
    expect(getDelhiveryTracking(carrierResponse("Picked Up", "UD"), waybill)).toMatchObject({
      stage: "Picked up", shipped: true, scannedAt: "2026-11-12T08:40:00.000Z",
    });
    expect(getDelhiveryTracking(carrierResponse("Dispatched", "UD"), waybill)).toMatchObject({
      stage: "Out for delivery", shipped: true, delivered: false,
    });
    expect(getDelhiveryTracking(carrierResponse("Delivered", "DL"), "999")).toBeNull();
  });

  it("ships then delivers when the first scan seen is delivered", async () => {
    const fixture = setup("Delivered", "DL");
    await syncDelhiveryTracking(fixture.container);
    expect(fixture.order).toEqual(["shipped", "delivered"]);
    expect(fixture.track).toHaveBeenCalledWith(waybill, 8000);
    expect(fixture.ship).toHaveBeenCalledWith({ input: expect.objectContaining({
      order_id: "order_test", fulfillment_id: "ful_test",
      labels: fixture.fulfillment.labels, no_notification: true,
    }) });
    expect(fixture.update).toHaveBeenCalledWith("ful_test", { metadata: expect.objectContaining({
      custom: true, delhivery_tracking: expect.objectContaining({ stage: "Delivered" }),
    }) });
    await syncDelhiveryTracking(fixture.container);
    expect(fixture.deliver).toHaveBeenCalledTimes(1);
  });

  it("keeps return scans separate from customer delivery", async () => {
    const fixture = setup("Delivered", "RT");
    await syncDelhiveryTracking(fixture.container);
    expect(fixture.ship).not.toHaveBeenCalled();
    expect(fixture.deliver).not.toHaveBeenCalled();
    expect(fixture.update).toHaveBeenCalledWith("ful_test", { metadata: expect.objectContaining({
      delhivery_tracking: expect.objectContaining({ stage: "Return · Delivered", delivered: false, terminal: true }),
    }) });
  });

  it("retries delivery without creating a second shipment after a workflow failure", async () => {
    const fixture = setup("Delivered", "DL");
    fixture.deliver.mockRejectedValueOnce(new Error("temporary failure"));
    await syncDelhiveryTracking(fixture.container);
    await syncDelhiveryTracking(fixture.container);
    expect(fixture.ship).toHaveBeenCalledTimes(1);
    expect(fixture.deliver).toHaveBeenCalledTimes(2);
    expect(fixture.order).toEqual(["shipped", "delivered"]);
  });

  it("keeps newer scans when the carrier returns stale data", async () => {
    const fixture = setup("Manifested", "UD");
    Object.assign(fixture.fulfillment.metadata, {
      delhivery_tracking: getDelhiveryTracking(carrierResponse("In Transit", "UD", "2026-11-12T16:00:00"), waybill),
    });
    await syncDelhiveryTracking(fixture.container);
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.ship).not.toHaveBeenCalled();
  });
});
