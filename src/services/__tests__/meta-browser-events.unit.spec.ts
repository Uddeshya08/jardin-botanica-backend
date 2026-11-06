jest.mock("../../modules/meta-conversion", () => ({ META_CONVERSION_MODULE: "metaConversion" }));

import { buildMetaBrowserEvent, enqueueMetaBrowserEvent, metaRelayEnabled, processMetaBrowserEvents, validMetaRelaySecret } from "../meta-browser-events";
import { getMetaPixelPurchase } from "../meta-pixel-purchase";
import { hashMetaValue } from "../meta-capi";
import { POST } from "../../api/store/custom/meta/events/route";

const config = { datasetId: "123456789", accessToken: "private-token", version: "v26.0", storefrontUrl: "https://www.jardinbotanica.com" };
const uuid = "c1234567-abcd-4abc-8def-0123456789ab";
const input = (name: "PageView" | "ViewContent" | "AddToCart" = "PageView") => ({
  dataset_id: config.datasetId, event_name: name, event_id: `${name.toLowerCase()}_${uuid}`,
  event_time: Math.floor(Date.now() / 1000), event_source_url: `${config.storefrontUrl}/in?email=private#token`,
  user_data: { client_user_agent: "Browser Test", client_ip_address: "192.0.2.1", fbp: "fb.1.1760000000000.123456789" },
  ...(name !== "PageView" ? { custom_data: { content_type: "product", content_ids: ["prod_candle"],
    num_items: 2, value: 3600, currency: "INR" } } : {}),
});

describe("Paired Meta browser events", () => {
  const env = { ...process.env };
  let rows: any[], service: any, container: any;
  beforeEach(() => {
    process.env.META_CAPI_ENABLED = "true";
    process.env.META_CAPI_BROWSER_EVENTS_ENABLED = "true";
    process.env.META_CAPI_RELAY_SECRET = "s".repeat(64);
    process.env.META_PIXEL_ID = config.datasetId;
    process.env.META_CAPI_ACCESS_TOKEN = config.accessToken;
    delete process.env.META_TEST_EVENT_CODE;
    rows = [];
    service = {
      listMetaBrowserEvents: jest.fn(async (filter) => rows.filter((row) => filter.id ? row.id === filter.id : row.status === filter.status && row.next_attempt_at <= new Date())),
      createMetaBrowserEvents: jest.fn(async (data) => { rows.push({ status: "pending", attempts: 0, ...data }); }),
      updateMetaBrowserEvents: jest.fn(async (data) => { Object.assign(rows.find((row) => row.id === data.id), data); }),
    };
    container = { resolve: (key) => key === "metaConversion" ? service : { info: jest.fn() } };
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => ({ events_received: 1 }) } as Response);
  });
  afterEach(() => { process.env = { ...env }; jest.restoreAllMocks(); });

  it.each(["PageView", "ViewContent", "AddToCart"] as const)("preserves the Pixel event name and ID for %s", (name) => {
    const event = buildMetaBrowserEvent(input(name), config);
    expect(event.event_name).toBe(name);
    expect(event.event_id).toBe(input(name).event_id);
    expect(event.event_source_url).toBe(`${config.storefrontUrl}/in`);
    expect(event.user_data.client_ip_address).toBe("192.0.2.1");
    expect(JSON.stringify(event)).not.toContain("email=private");
  });

  it("refuses changed datasets, mismatched IDs, stale events, foreign URLs and browser-supplied Purchase", () => {
    expect(() => buildMetaBrowserEvent({ ...input(), dataset_id: "999" }, config)).toThrow();
    expect(() => buildMetaBrowserEvent({ ...input(), event_id: `addtocart_${uuid}` }, config)).toThrow();
    expect(() => buildMetaBrowserEvent({ ...input(), event_time: 1 }, config)).toThrow();
    expect(() => buildMetaBrowserEvent({ ...input(), event_source_url: "https://other.example/in" }, config)).toThrow();
    expect(() => buildMetaBrowserEvent({ ...input(), event_name: "Purchase" }, config)).toThrow();
    expect(() => buildMetaBrowserEvent({ ...input(), event_name: "AddToCart", event_id: `addtocart_${uuid}` }, config)).toThrow();
  });

  it("authenticates the relay and remains disabled until explicitly configured", async () => {
    expect(validMetaRelaySecret("s".repeat(64))).toBe(true);
    expect(validMetaRelaySecret("incorrect")).toBe(false);
    delete process.env.META_CAPI_RELAY_SECRET;
    expect(metaRelayEnabled()).toBe(false);
    await processMetaBrowserEvents(container);
    expect(service.listMetaBrowserEvents).not.toHaveBeenCalled();
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await POST({ headers: {}, scope: container, body: input() } as any, res as any);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("deduplicates relay requests and retains event identity across a timeout retry", async () => {
    await enqueueMetaBrowserEvent(container, input());
    await enqueueMetaBrowserEvent(container, input());
    expect(rows).toHaveLength(1);
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("timeout"));
    await processMetaBrowserEvents(container);
    expect(rows[0]).toMatchObject({ status: "pending", attempts: 1 });
    const frozen = JSON.stringify(rows[0].payload);
    rows[0].next_attempt_at = new Date(0);
    await processMetaBrowserEvents(container);
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body);
    expect(JSON.stringify(body.data[0])).toBe(frozen);
    expect(body.test_event_code).toBeUndefined();
    expect(rows[0]).toMatchObject({ status: "sent", payload: null, attempts: 2 });
    await enqueueMetaBrowserEvent(container, input());
    expect(rows).toHaveLength(1);
  });

  it("never promotes server test-mode configuration into paired live events", async () => {
    process.env.META_TEST_EVENT_CODE = "TEST123";
    await expect(enqueueMetaBrowserEvent(container, input())).rejects.toThrow("browser_pairing_live_only");
    expect(rows).toHaveLength(0);
  });

  it("expires payloads and stops permanent failures instead of creating a fresh event", async () => {
    await enqueueMetaBrowserEvent(container, input());
    rows[0].expires_at = new Date(0);
    await processMetaBrowserEvents(container);
    expect(rows[0]).toMatchObject({ status: "failed", payload: null, last_error: "delivery_window_expired" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns 503 for queue storage errors so the same ID can be retried", async () => {
    service.listMetaBrowserEvents.mockRejectedValue(new Error("database unavailable"));
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await POST({ headers: { "x-meta-relay-secret": "s".repeat(64) }, scope: container, body: input() } as any, res as any);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(JSON.stringify(res.json.mock.calls)).not.toContain("database unavailable");
  });
});

describe("Canonical browser Purchase", () => {
  const env = { ...process.env };
  let row: any, order: any, service: any, container: any;
  beforeEach(() => {
    process.env.META_PIXEL_ID = config.datasetId;
    process.env.META_CAPI_ACCESS_TOKEN = config.accessToken;
    process.env.META_CAPI_COD_PURCHASE = "order_placed";
    delete process.env.META_TEST_EVENT_CODE;
    row = { status: "pending", payload: null, test_event_code: null };
    order = { id: "order_test", total: 1900, currency_code: "inr", created_at: new Date(),
      email: "buyer@example.com", shipping_methods: [{ data: { paymentMethod: "COD" } }] };
    service = { listMetaConversionEvents: jest.fn(async () => row ? [row] : []) };
    container = { resolve: (key) => key === "metaConversion" ? service : { graph: async () => ({ data: [order] }) } };
  });
  afterEach(() => { process.env = { ...env }; });

  it("returns the same order event ID, total and currency as CAPI without matching data", async () => {
    const result = await getMetaPixelPurchase(container, order.id, config.datasetId);
    expect(result).toMatchObject({ state: "ready", dataset_id: config.datasetId,
      event_id: "purchase_order_test", custom_data: { value: 1900, currency: "INR" } });
    expect(JSON.stringify(result)).not.toContain("buyer@example.com");
    expect(JSON.stringify(result)).not.toContain(hashMetaValue("buyer@example.com"));
  });

  it("uses the frozen CAPI payload when a request has already been attempted", async () => {
    row.payload = { event_id: "purchase_order_test", event_time: Math.floor(Date.now() / 1000),
      custom_data: { value: 1800, currency: "INR", order_id: "order_test" }, user_data: { em: ["private-hash"] } };
    expect(await getMetaPixelPurchase(container, order.id, config.datasetId)).toMatchObject({
      state: "ready", custom_data: { value: 1800 },
    });
  });

  it("waits for capture and excludes canceled, old, refused and test orders", async () => {
    order.shipping_methods = [];
    order.payment_collections = [{ status: "authorized", captured_amount: 0 }];
    expect(await getMetaPixelPurchase(container, order.id, config.datasetId)).toEqual({ state: "waiting" });
    order.status = "canceled";
    expect(await getMetaPixelPurchase(container, order.id, config.datasetId)).toEqual({ state: "skipped" });
    order.status = "pending"; order.shipping_methods = [{ data: { paymentMethod: "COD" } }];
    row.test_event_code = "TEST123";
    expect(await getMetaPixelPurchase(container, order.id, config.datasetId)).toEqual({ state: "skipped" });
    row.test_event_code = null; order.created_at = new Date(0);
    expect(await getMetaPixelPurchase(container, order.id, config.datasetId)).toEqual({ state: "skipped" });
    order.created_at = new Date(); order.metadata = { meta_capi_consent: false };
    expect(await getMetaPixelPurchase(container, order.id, config.datasetId)).toEqual({ state: "skipped" });
  });

  it("waits for the receipt, rejects changed dataset and never replays skipped history", async () => {
    row = null;
    expect(await getMetaPixelPurchase(container, order.id, config.datasetId)).toEqual({ state: "waiting" });
    expect(await getMetaPixelPurchase(container, order.id, "999")).toEqual({ state: "skipped" });
    row = { status: "skipped" };
    expect(await getMetaPixelPurchase(container, order.id, config.datasetId)).toEqual({ state: "skipped" });
  });
});
