import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

// Exercise the exact dependency file installed by patch-package, without provider calls.
const source = fs.readFileSync(path.join(process.cwd(), "node_modules/medusa-plugin-razorpay-v2/.medusa/server/src/providers/payment-razorpay/src/core/razorpay-base.js"), "utf8");
const validate = jest.fn(() => true);
const actions = { SUCCESSFUL: "captured", AUTHORIZED: "authorized", NOT_SUPPORTED: "not_supported" };
const statuses = { AUTHORIZED: "authorized", CAPTURED: "captured", REQUIRES_MORE: "requires_more" };
const moduleObject = { exports: {} as any };
vm.runInNewContext(source, {
  exports: moduleObject.exports, module: moduleObject, process: { env: {} },
  require: (name: string) => {
    if (name === "@medusajs/framework/utils") return { AbstractPaymentProvider: class {}, PaymentActions: actions, PaymentSessionStatus: statuses };
    if (name === "razorpay") return { validateWebhookSignature: validate };
    if (name === "../utils/get-smallest-unit") return { getAmountFromSmallestUnit: (value: number) => value / 100, getSmallestUnit: (value: number) => Math.round(value * 100) };
    if (name === "../workflows/update-razorpay-customer-metadata") return {};
    throw new Error(`Unexpected import: ${name}`);
  },
});

describe("Razorpay session mapping and captured payment reconciliation", () => {
  let provider: any, order: any, payment: any, session: any;
  const input = () => ({ data: { razorpayOrder: order }, context: { idempotency_key: "capt_other" } });
  const webhook = (event = "payment.captured") => ({ headers: { "x-razorpay-signature": "test" }, rawData: Buffer.from("signed"),
    data: { event, payload: { payment: { entity: { id: "pay_test", order_id: "order_test", notes: [] } } } } });

  beforeEach(() => {
    validate.mockReset().mockReturnValue(true);
    order = { id: "order_test", amount: 180000, amount_paid: 180000, currency: "INR", status: "paid", notes: [] };
    payment = { id: "pay_test", order_id: order.id, amount: 180000, currency: "INR", status: "captured", captured: true, amount_refunded: 0, notes: [] };
    session = { id: "payses_test", provider_id: "pp_razorpay_razorpay", amount: 1800, currency_code: "inr", data: { razorpayOrder: { id: order.id } } };
    provider = Object.create(moduleObject.exports.default.prototype);
    provider.options_ = { webhook_secret: "secret", auto_capture: true };
    provider.logger = { warn: jest.fn(), info: jest.fn() };
    provider.paymentService = { retrievePaymentSession: jest.fn(async () => session), listPaymentSessions: jest.fn(async () => [session]) };
    provider.razorpay_ = {
      orders: { fetch: jest.fn(async () => order), fetchPayments: jest.fn(async () => ({ items: [payment] })), create: jest.fn(async (data) => ({ id: "order_new", ...data })) },
      payments: { fetch: jest.fn(async () => payment), capture: jest.fn(async () => { payment.status = "captured"; payment.captured = true; order.status = "paid"; order.amount_paid = order.amount; return payment; }) },
    };
  });

  it("maps legacy empty payment notes through an exact order lookup", async () => {
    const result = await provider.getWebhookActionAndData(webhook());
    expect(result).toEqual({ action: "captured", data: { session_id: session.id, amount: 1800 } });
    expect(provider.paymentService.listPaymentSessions).toHaveBeenCalledWith({ provider_id: "pp_razorpay_razorpay", data: { razorpayOrder: { id: order.id } } }, { take: 2 });
    expect(provider.paymentService.retrievePaymentSession).not.toHaveBeenCalled();
  });

  it("uses verified order notes for new payments", async () => {
    order.notes = { medusa_payment_session_id: session.id, session_id: session.id };
    await provider.getWebhookActionAndData(webhook());
    expect(provider.paymentService.retrievePaymentSession).toHaveBeenCalledWith(session.id);
    expect(provider.paymentService.listPaymentSessions).not.toHaveBeenCalled();
  });

  it.each([{ matches: [] }, { matches: [{ id: "a" }, { id: "b" }] }])("rejects missing or ambiguous legacy mappings", async ({ matches }) => {
    provider.paymentService.listPaymentSessions.mockResolvedValue(matches);
    await expect(provider.getWebhookActionAndData(webhook())).rejects.toThrow("no unique");
  });

  it.each(["order", "amount", "currency", "provider"])("rejects mismatched %s before commerce processing", async (field) => {
    if (field === "order") session.data.razorpayOrder.id = "order_other";
    if (field === "amount") session.amount = 180;
    if (field === "currency") session.currency_code = "usd";
    if (field === "provider") session.provider_id = "pp_other";
    await expect(provider.getWebhookActionAndData(webhook())).rejects.toThrow("does not match");
  });

  it("rejects conflicting session hints", async () => {
    payment.notes = { session_id: "payses_wrong" };
    order.notes = { medusa_payment_session_id: session.id };
    await expect(provider.getWebhookActionAndData(webhook())).rejects.toThrow("Conflicting");
  });

  it("invalid signatures and irrelevant events never query payment/session records", async () => {
    validate.mockReturnValue(false);
    expect(await provider.getWebhookActionAndData(webhook())).toEqual({ action: "not_supported" });
    validate.mockReturnValue(true);
    expect(await provider.getWebhookActionAndData(webhook("refund.processed"))).toEqual({ action: "not_supported" });
    expect(provider.razorpay_.payments.fetch).not.toHaveBeenCalled();
    expect(provider.paymentService.listPaymentSessions).not.toHaveBeenCalled();
  });

  it("out-of-order and duplicate webhooks retain the same session and canonical captured action", async () => {
    const first = await provider.getWebhookActionAndData(webhook());
    expect(await provider.getWebhookActionAndData(webhook("payment.authorized"))).toEqual(first);
    expect(await provider.getWebhookActionAndData(webhook())).toEqual(first);
    expect(provider.razorpay_.payments.capture).not.toHaveBeenCalled();
  });

  it("does not replay externally refunded payments as successful purchases", async () => {
    payment.amount_refunded = 180000; payment.status = "refunded";
    expect(await provider.getWebhookActionAndData(webhook())).toEqual({ action: "not_supported" });
    await expect(provider.authorizePayment(input())).rejects.toThrow("Refunded");
    await expect(provider.capturePayment(input())).rejects.toThrow("reconciliation");
    expect(provider.razorpay_.payments.capture).not.toHaveBeenCalled();
  });

  it("recognizes already captured funds repeatedly without issuing capture calls or using capt_* as a session", async () => {
    await provider.capturePayment(input());
    await provider.capturePayment(input());
    expect(provider.razorpay_.payments.capture).not.toHaveBeenCalled();
    expect(provider.paymentService.retrievePaymentSession).not.toHaveBeenCalled();
    expect((await provider.authorizePayment(input())).status).toBe("captured");
  });

  it("captures one full authorized payment in paise, without rounding away decimals", async () => {
    order.status = "attempted"; order.amount_paid = 0; order.amount = 180050;
    session.amount = 1800.5; payment.amount = 180050; payment.status = "authorized"; payment.captured = false;
    expect((await provider.authorizePayment(input())).status).toBe("authorized");
    await provider.capturePayment(input());
    expect(provider.razorpay_.payments.capture).toHaveBeenCalledWith(payment.id, 180050, "INR");
  });

  it("concurrent auto-capture is reconciled through a fresh payment read", async () => {
    order.status = "attempted"; order.amount_paid = 0; payment.status = "authorized"; payment.captured = false;
    provider.razorpay_.payments.capture.mockImplementation(async () => {
      payment.status = "captured"; payment.captured = true; order.status = "paid"; order.amount_paid = order.amount;
      throw new Error("Already captured");
    });
    await provider.capturePayment(input());
    expect(provider.razorpay_.payments.capture).toHaveBeenCalledTimes(1);
    expect(provider.razorpay_.payments.fetch).toHaveBeenCalledWith(payment.id);
  });

  it("unpaid and partial payments cannot be reported as captured", async () => {
    payment.amount = 10000; payment.status = "authorized"; payment.captured = false; order.status = "attempted"; order.amount_paid = 0;
    expect((await provider.authorizePayment(input())).status).toBe("requires_more");
    await expect(provider.capturePayment(input())).rejects.toThrow("no unique full");
    await expect(provider.getWebhookActionAndData(webhook())).rejects.toThrow("does not match order");
    expect(provider.razorpay_.payments.capture).not.toHaveBeenCalled();
  });

  it("persists both session note names when creating new orders", async () => {
    provider.getRazorpayOrderCreateRequestBody = jest.fn(() => ({ amount: 180000, currency: "INR" }));
    await provider.initiatePayment({ amount: 1800, currency_code: "inr", context: { idempotency_key: session.id } });
    expect(provider.razorpay_.orders.create).toHaveBeenCalledWith(expect.objectContaining({ notes: { session_id: session.id, medusa_payment_session_id: session.id } }));
  });

  it("refuses canceled sessions, missing operation references and mismatched canonical payment IDs", async () => {
    session.status = "canceled";
    await expect(provider.getWebhookActionAndData(webhook())).rejects.toThrow("does not match");
    await expect(provider.capturePayment({ data: {}, context: { idempotency_key: "capt_wrong" } })).rejects.toThrow("Missing Razorpay order");
    expect(provider.paymentService.retrievePaymentSession).not.toHaveBeenCalled();
    session.status = "pending";
    payment.order_id = "order_other";
    await expect(provider.getWebhookActionAndData(webhook())).rejects.toThrow("does not match order");
  });

  it("failed capture is not acknowledged unless a fresh read confirms full capture", async () => {
    payment.status = "authorized"; payment.captured = false; order.status = "attempted"; order.amount_paid = 0;
    provider.razorpay_.payments.capture.mockRejectedValue(new Error("provider unavailable"));
    await expect(provider.capturePayment(input())).rejects.toThrow("provider unavailable");
  });

  it("does not transmit raw webhook customer data in logs", async () => {
    const event = webhook();
    (event.data.payload.payment.entity as any).email = "private@example.com";
    await provider.getWebhookActionAndData(event);
    expect(JSON.stringify(provider.logger.info.mock.calls)).not.toContain("private@example.com");
  });
});
