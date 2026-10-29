jest.mock("../../modules/meta-conversion", () => ({ META_CONVERSION_MODULE: "metaConversion" }));

import { enqueueMetaOrder, processMetaConversions } from "../meta-conversion-queue";
import handleOrder from "../../subscribers/meta-order-placed";
import runJob from "../../jobs/meta-conversions";
import validate from "../../scripts/validate-meta-capi";

describe("Meta CAPI queue isolation and retries", () => {
  const originalEnv = { ...process.env };
  let rows: any[];
  let container: any;
  let service: any;
  let query: any;
  let logger: any;

  beforeEach(() => {
    process.env.META_CAPI_ENABLED = "true";
    process.env.META_PIXEL_ID = "123456789";
    process.env.META_CAPI_ACCESS_TOKEN = "test-private-token";
    delete process.env.META_TEST_EVENT_CODE;
    rows = [];
    logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    service = {
      listMetaConversionEvents: jest.fn(async (filter) => rows.filter((r) => filter.id ? r.id === filter.id : r.status === filter.status && r.next_attempt_at <= new Date())),
      createMetaConversionEvents: jest.fn(async (data) => { rows.push({ status: "pending", attempts: 0, ...data }); }),
      updateMetaConversionEvents: jest.fn(async (data) => { Object.assign(rows.find((r) => r.id === data.id), data); }),
    };
    query = { graph: jest.fn(async () => ({ data: [{
      id: "order_1", total: 1800, currency_code: "inr", created_at: new Date(), email: "customer@example.com",
      metadata: { meta_capi_consent: true }, payment_collections: [{ status: "completed", captured_amount: 1800, completed_at: new Date() }],
    }] })) };
    container = { resolve: jest.fn((key) => ({ metaConversion: service, query, logger })[key]) };
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => ({ events_received: 1 }) } as Response);
  });
  afterEach(() => { process.env = { ...originalEnv }; jest.restoreAllMocks(); });

  it("does no work when disabled and deduplicates repeated order events", async () => {
    process.env.META_CAPI_ENABLED = "false";
    await enqueueMetaOrder(container, "order_1");
    await processMetaConversions(container);
    expect(container.resolve).not.toHaveBeenCalled();
    process.env.META_CAPI_ENABLED = "true";
    await enqueueMetaOrder(container, "order_1");
    await enqueueMetaOrder(container, "order_1");
    expect(rows).toHaveLength(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("sends once and clears matching data on acknowledgement", async () => {
    await enqueueMetaOrder(container, "order_1");
    await processMetaConversions(container);
    await processMetaConversions(container);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(rows[0]).toMatchObject({ status: "sent", payload: null, attempts: 1 });
  });

  it("never promotes queued test purchases to live events after configuration changes", async () => {
    process.env.META_TEST_EVENT_CODE = "TEST123";
    await enqueueMetaOrder(container, "order_1");
    delete process.env.META_TEST_EVENT_CODE;
    await processMetaConversions(container);
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).test_event_code).toBe("TEST123");
  });

  it("persists the same event ID, time and amount across transient retries", async () => {
    await enqueueMetaOrder(container, "order_1");
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("network unavailable"));
    await processMetaConversions(container);
    expect(rows[0].status).toBe("pending");
    const payload = JSON.stringify(rows[0].payload);
    expect(rows[0].next_attempt_at.getTime()).toBeGreaterThan(Date.now());
    rows[0].next_attempt_at = new Date(0);
    await processMetaConversions(container);
    const request = (global.fetch as jest.Mock).mock.calls[1][1];
    expect(JSON.stringify(JSON.parse(request.body).data[0])).toBe(payload);
    expect(rows[0]).toMatchObject({ status: "sent", payload: null, attempts: 2 });
  });

  it("stops permanent errors and refuses to redirect pending events to another dataset", async () => {
    await enqueueMetaOrder(container, "order_1");
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { code: 190 } }) });
    await processMetaConversions(container);
    expect(rows[0]).toMatchObject({ status: "failed", payload: null, last_error: "meta_http_400_code_190" });
    rows[0].status = "pending";
    rows[0].next_attempt_at = new Date(0);
    process.env.META_PIXEL_ID = "9999999";
    await processMetaConversions(container);
    expect(rows[0].last_error).toBe("dataset_configuration_changed");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("waits for capture without sending or consuming request retries", async () => {
    await enqueueMetaOrder(container, "order_1");
    query.graph.mockResolvedValue({ data: [{ id: "order_1", total: 1800, currency_code: "inr", metadata: { meta_capi_consent: true }, payment_collections: [] }] });
    await processMetaConversions(container);
    expect(rows[0]).toMatchObject({ status: "pending", attempts: 0, last_error: "payment_not_fully_captured" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("skips absent consent and clears expired payloads", async () => {
    await enqueueMetaOrder(container, "order_1");
    query.graph.mockResolvedValue({ data: [{ id: "order_1", metadata: {} }] });
    await processMetaConversions(container);
    expect(rows[0]).toMatchObject({ status: "skipped", payload: null, last_error: "marketing_consent_missing" });
    rows[0].status = "pending";
    rows[0].expires_at = new Date(0);
    await processMetaConversions(container);
    expect(rows[0]).toMatchObject({ status: "failed", payload: null, last_error: "delivery_window_expired" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("subscriber and scheduler failures never propagate to commerce", async () => {
    service.listMetaConversionEvents.mockRejectedValue(new Error("database unavailable"));
    await expect(handleOrder({ event: { data: { id: "order_1" } }, container } as any)).resolves.toBeUndefined();
    await expect(runJob(container)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it("validation requires an expected dataset and a test code before any POST", async () => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    await expect(validate({ container, args: ["--send-test"] })).rejects.toThrow("Expected dataset ID");
    await expect(validate({ container, args: ["--send-test", "--expected-dataset-id=123456789"] })).rejects.toThrow("META_TEST_EVENT_CODE");
    expect((global.fetch as jest.Mock).mock.calls.every(([, init]) => init.method !== "POST")).toBe(true);
    process.env.META_TEST_EVENT_CODE = "TEST123";
    await validate({ container, args: ["send-test", "expected-dataset-id=123456789"] });
    const post = (global.fetch as jest.Mock).mock.calls.find(([, init]) => init.method === "POST");
    expect(JSON.parse(post[1].body)).toMatchObject({ test_event_code: "TEST123", data: [{ event_name: "CapiConnectionTest" }] });
  });
});
