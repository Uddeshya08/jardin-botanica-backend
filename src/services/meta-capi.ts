import { createHash } from "node:crypto";

export type MetaConfig = {
  datasetId: string;
  accessToken: string;
  version: string;
  storefrontUrl: string;
  testEventCode?: string;
};

export type MetaEvent = {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: "website";
  event_source_url: string;
  user_data: Record<string, string[]>;
  custom_data?: Record<string, unknown>;
};

export type MetaOrder = {
  id: string;
  status?: string;
  created_at: string | Date;
  total: number | string;
  currency_code: string;
  email?: string | null;
  customer_id?: string | null;
  metadata?: Record<string, unknown> | null;
  shipping_address?: { phone?: string | null; country_code?: string | null } | null;
  shipping_methods?: { data?: Record<string, unknown> | null }[];
  payment_collections?: {
    status: string;
    captured_amount?: number | string;
    completed_at?: string | Date | null;
    payments?: { provider_id: string }[];
  }[];
  items?: { product_id?: string | null; quantity: number }[];
};

export function hashMetaValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function metaEnabled(): boolean {
  return process.env.META_CAPI_ENABLED === "true";
}

export function getMetaConfig(): MetaConfig {
  const datasetId = process.env.META_PIXEL_ID?.trim() || "";
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN?.trim() || "";
  const version = process.env.META_GRAPH_API_VERSION || "v26.0";
  const storefrontUrl = process.env.META_STOREFRONT_URL || "https://www.jardinbotanica.com";
  if (!/^\d+$/.test(datasetId) || !accessToken) {
    throw new Error("Configure META_PIXEL_ID and META_CAPI_ACCESS_TOKEN on the backend");
  }
  if (!/^v\d+\.0$/.test(version) || new URL(storefrontUrl).protocol !== "https:") {
    throw new Error("Invalid Meta API version or HTTPS storefront URL");
  }
  return { datasetId, accessToken, version, storefrontUrl,
    testEventCode: process.env.META_TEST_EVENT_CODE?.trim() || undefined };
}

// A stable ID is reused across retries and can be shared with a future browser Pixel.
export function metaPurchaseId(orderId: string): string {
  return `purchase_${orderId}`;
}

export function metaQueueId(datasetId: string, orderId: string): string {
  return `mce_${hashMetaValue(`${datasetId}:${metaPurchaseId(orderId)}`)}`;
}

export type PurchaseDecision =
  | { state: "ready"; event: MetaEvent }
  | { state: "waiting"; reason: string }
  | { state: "skipped"; reason: string };

export function buildMetaPurchase(order: MetaOrder, config: MetaConfig): PurchaseDecision {
  if (order.status === "canceled") return { state: "skipped", reason: "order_canceled" };
  // This explicit order metadata flag must come from the store's marketing-consent flow.
  if (order.metadata?.meta_capi_consent !== true) {
    return { state: "skipped", reason: "marketing_consent_missing" };
  }
  const collections = order.payment_collections || [];
  const cod = order.shipping_methods?.at(-1)?.data?.paymentMethod === "COD" ||
    collections.some((collection) => collection.payments?.some((p) => p.provider_id === "pp_system_default"));
  const total = Number(order.total);
  if (!Number.isFinite(total) || total <= 0 || !/^[a-z]{3}$/i.test(order.currency_code)) {
    return { state: "skipped", reason: "invalid_order_amount_or_currency" };
  }
  let purchaseTime = new Date(order.created_at).getTime();
  if (cod) {
    if (process.env.META_CAPI_COD_PURCHASE !== "order_placed") {
      return { state: "skipped", reason: "cod_tracking_disabled" };
    }
  } else {
    const captured = collections.reduce((sum, collection) => sum + Number(collection.captured_amount || 0), 0);
    if (!collections.length || collections.some((c) => c.status !== "completed") || captured + 0.000001 < total) {
      return { state: "waiting", reason: "payment_not_fully_captured" };
    }
    const completed = collections.map((c) => c.completed_at ? new Date(c.completed_at).getTime() : NaN);
    if (completed.some((time) => !Number.isFinite(time))) {
      return { state: "waiting", reason: "payment_completion_time_missing" };
    }
    purchaseTime = Math.max(...completed);
  }
  const eventTime = Math.floor(purchaseTime / 1000);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(eventTime) || eventTime > now || eventTime < now - 86400) {
    return { state: "skipped", reason: "purchase_outside_24_hour_delivery_window" };
  }
  const userData: Record<string, string[]> = {};
  const email = order.email?.trim().toLowerCase();
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) userData.em = [hashMetaValue(email)];
  // Only add a country prefix when it is unambiguous for this India storefront.
  let phone = order.shipping_address?.phone?.replace(/\D/g, "") || "";
  if (order.shipping_address?.country_code?.toLowerCase() === "in") {
    if (/^0[6-9]\d{9}$/.test(phone)) phone = phone.slice(1);
    if (/^[6-9]\d{9}$/.test(phone)) phone = `91${phone}`;
    if (!/^91[6-9]\d{9}$/.test(phone)) phone = "";
  } else if (!order.shipping_address?.phone?.startsWith("+") || !/^\d{8,15}$/.test(phone)) {
    phone = "";
  }
  if (phone) userData.ph = [hashMetaValue(phone)];
  if (order.customer_id) userData.external_id = [hashMetaValue(order.customer_id)];
  if (!Object.keys(userData).length) return { state: "skipped", reason: "no_customer_match_identifiers" };
  return { state: "ready", event: {
    event_name: "Purchase", event_time: eventTime, event_id: metaPurchaseId(order.id),
    action_source: "website", event_source_url: new URL("/in", config.storefrontUrl).href,
    user_data: userData,
    custom_data: {
      // Medusa v2 amounts are already in major currency units. Do not divide by 100.
      value: total, currency: order.currency_code.toUpperCase(), order_id: order.id,
      content_type: "product", content_ids: [...new Set(order.items?.map((i) => i.product_id).filter(Boolean))],
      num_items: order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0,
    },
  } };
}

export class MetaRequestError extends Error {
  constructor(public readonly retryable: boolean, public readonly safeCode: string) {
    super(safeCode);
  }
}

async function metaRequest(config: MetaConfig, path: string, init?: RequestInit): Promise<Record<string, any>> {
  try {
    const response = await fetch(`https://graph.facebook.com/${config.version}/${path}`, {
      ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.accessToken}` },
      signal: AbortSignal.timeout(5000),
    });
    const body = await response.json();
    if (!response.ok || body.error) {
      throw new MetaRequestError(response.status === 429 || response.status >= 500 || body.error?.is_transient === true,
        `meta_http_${response.status}_code_${Number(body.error?.code) || 0}`);
    }
    return body;
  } catch (error) {
    if (error instanceof MetaRequestError) throw error;
    // Never expose provider response bodies, token-bearing request details, or customer data.
    throw new MetaRequestError(true, "meta_network_or_response_error");
  }
}

export async function sendMetaEvent(config: MetaConfig, event: MetaEvent): Promise<{ events_received: number; fbtrace_id?: string }> {
  const response = await metaRequest(config, `${config.datasetId}/events`, {
    method: "POST", body: JSON.stringify({ data: [event], ...(config.testEventCode ? { test_event_code: config.testEventCode } : {}) }),
  });
  if (response.events_received !== 1) throw new MetaRequestError(true, "meta_event_not_acknowledged");
  return { events_received: 1, fbtrace_id: response.fbtrace_id };
}

export async function getMetaDataset(config: MetaConfig): Promise<{ id: string; name: string }> {
  const response = await metaRequest(config, `${config.datasetId}?fields=id,name`);
  if (String(response.id) !== config.datasetId || typeof response.name !== "string") {
    throw new MetaRequestError(false, "meta_dataset_identity_mismatch");
  }
  return { id: String(response.id), name: response.name };
}
