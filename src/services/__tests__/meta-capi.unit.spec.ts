import { buildMetaPurchase, getMetaConfig, getMetaDataset, hashMetaValue, metaQueueId, MetaRequestError, sendMetaEvent } from "../meta-capi";
import type { MetaConfig, MetaEvent, MetaOrder } from "../meta-capi";

const config: MetaConfig = { datasetId: "123456789", accessToken: "private-test-token", version: "v26.0", storefrontUrl: "https://www.jardinbotanica.com" };
const order = (): MetaOrder => ({
  id: "order_123", status: "pending", created_at: new Date(Date.now() - 60000), total: 1800,
  currency_code: "inr", email: " Customer@Example.com ", customer_id: "cus_123",
  metadata: { meta_capi_consent: true }, shipping_address: { phone: "09876543210", country_code: "in" },
  payment_collections: [{ status: "completed", captured_amount: 1800, completed_at: new Date(Date.now() - 5000), payments: [{ provider_id: "pp_razorpay_razorpay" }] }],
  items: [{ product_id: "prod_1", quantity: 1 }],
});

describe("Meta CAPI payload and client", () => {
  const originalEnv = { ...process.env };
  afterEach(() => { process.env = { ...originalEnv }; jest.restoreAllMocks(); });

  it("requires configuration without exposing the token", () => {
    delete process.env.META_PIXEL_ID;
    expect(() => getMetaConfig()).toThrow("Configure META_PIXEL_ID");
    process.env.META_PIXEL_ID = config.datasetId;
    process.env.META_CAPI_ACCESS_TOKEN = config.accessToken;
    expect(getMetaConfig().datasetId).toBe(config.datasetId);
  });

  it("hashes normalized identifiers and preserves Medusa major-unit order totals", () => {
    const result = buildMetaPurchase(order(), config);
    expect(result.state).toBe("ready");
    if (result.state !== "ready") throw new Error("expected ready");
    expect(result.event.custom_data).toMatchObject({ value: 1800, currency: "INR", order_id: "order_123" });
    expect(result.event.user_data.em).toEqual([hashMetaValue("customer@example.com")]);
    expect(result.event.user_data.ph).toEqual([hashMetaValue("919876543210")]);
    expect(result.event.event_id).toBe("purchase_order_123");
    expect(JSON.stringify(result.event)).not.toContain("customer@example.com");
    expect(metaQueueId(config.datasetId, "order_123")).toBe(metaQueueId(config.datasetId, "order_123"));
    expect(metaQueueId("another_dataset", "order_123")).not.toBe(metaQueueId(config.datasetId, "order_123"));
  });

  it("never sends without explicit marketing tracking consent", () => {
    expect(buildMetaPurchase({ ...order(), metadata: {} }, config)).toEqual({ state: "skipped", reason: "marketing_consent_missing" });
    expect(buildMetaPurchase({ ...order(), metadata: { meta_capi_consent: "true" } }, config).state).toBe("skipped");
  });

  it("waits for full capture, including every payment collection", () => {
    const value = order();
    value.payment_collections![0].status = "authorized";
    expect(buildMetaPurchase(value, config).state).toBe("waiting");
    value.payment_collections![0].status = "completed";
    value.payment_collections![0].captured_amount = 900;
    expect(buildMetaPurchase(value, config).state).toBe("waiting");
    value.payment_collections!.push({ status: "completed", captured_amount: 900, completed_at: new Date() });
    expect(buildMetaPurchase(value, config).state).toBe("ready");
  });

  it("skips COD by default and allows explicit order-placement tracking", () => {
    delete process.env.META_CAPI_COD_PURCHASE;
    const cod = { ...order(), shipping_methods: [{ data: { paymentMethod: "COD" } }], payment_collections: [] };
    expect(buildMetaPurchase(cod, config)).toEqual({ state: "skipped", reason: "cod_tracking_disabled" });
    process.env.META_CAPI_COD_PURCHASE = "order_placed";
    expect(buildMetaPurchase(cod, config).state).toBe("ready");
    expect(buildMetaPurchase({ ...order(), payment_collections: [{ status: "completed", captured_amount: 1800,
      completed_at: new Date(), payments: [{ provider_id: "pp_system_default" }] }] }, config).state).toBe("ready");
  });

  it("rejects canceled, stale, future, and invalid-value purchases", () => {
    expect(buildMetaPurchase({ ...order(), status: "canceled" }, config).state).toBe("skipped");
    expect(buildMetaPurchase({ ...order(), total: "NaN" }, config).state).toBe("skipped");
    const value = order();
    value.payment_collections![0].completed_at = new Date(Date.now() - 2 * 86400000);
    expect(buildMetaPurchase(value, config).state).toBe("skipped");
    value.payment_collections![0].completed_at = new Date(Date.now() + 60000);
    expect(buildMetaPurchase(value, config).state).toBe("skipped");
  });

  it("posts to the selected dataset with bearer auth and optional test code", async () => {
    const mock = jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => ({ events_received: 1, fbtrace_id: "trace" }) } as Response);
    const event = (buildMetaPurchase(order(), config) as { state: "ready"; event: MetaEvent }).event;
    await sendMetaEvent({ ...config, testEventCode: "TEST123" }, event);
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v26.0/123456789/events");
    expect(url).not.toContain(config.accessToken);
    expect(init?.headers).toMatchObject({ Authorization: `Bearer ${config.accessToken}` });
    expect(JSON.parse(init?.body as string)).toMatchObject({ test_event_code: "TEST123", data: [{ event_id: "purchase_order_123" }] });
  });

  it.each([[429, true], [500, true], [400, false], [401, false]])("classifies HTTP %s safely", async (status, retryable) => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: false, status, json: async () => ({ error: { code: 190, message: config.accessToken } }) } as Response);
    try {
      await sendMetaEvent(config, {} as MetaEvent);
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(MetaRequestError);
      expect((error as MetaRequestError).retryable).toBe(retryable);
      expect((error as Error).message).not.toContain(config.accessToken);
    }
  });

  it("retries network failures and refuses unacknowledged events", async () => {
    const mock = jest.spyOn(global, "fetch").mockRejectedValue(new Error(`network ${config.accessToken}`));
    await expect(sendMetaEvent(config, {} as MetaEvent)).rejects.toThrow("meta_network_or_response_error");
    mock.mockResolvedValue({ ok: true, json: async () => ({ events_received: 0 }) } as Response);
    await expect(sendMetaEvent(config, {} as MetaEvent)).rejects.toThrow("meta_event_not_acknowledged");
  });

  it("checks returned dataset identity", async () => {
    const mock = jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => ({ id: config.datasetId, name: "JB Web Data" }) } as Response);
    await expect(getMetaDataset(config)).resolves.toEqual({ id: config.datasetId, name: "JB Web Data" });
    mock.mockResolvedValue({ ok: true, json: async () => ({ id: "different", name: "Wrong data" }) } as Response);
    await expect(getMetaDataset(config)).rejects.toThrow("meta_dataset_identity_mismatch");
  });
});
