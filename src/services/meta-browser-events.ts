import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import type { MedusaContainer } from "@medusajs/framework/types";
import { META_CONVERSION_MODULE } from "../modules/meta-conversion";
import type MetaConversionService from "../modules/meta-conversion/service";
import { getMetaConfig, hashMetaValue, metaEnabled, MetaRequestError, sendMetaEvent } from "./meta-capi";
import type { MetaConfig, MetaEvent } from "./meta-capi";

export function metaRelayEnabled(): boolean {
  return metaEnabled() && process.env.META_CAPI_BROWSER_EVENTS_ENABLED === "true" &&
    (process.env.META_CAPI_RELAY_SECRET?.trim().length || 0) >= 32;
}

export function validMetaRelaySecret(supplied: unknown): boolean {
  const expected = process.env.META_CAPI_RELAY_SECRET?.trim();
  if (!expected || expected.length < 32 || typeof supplied !== "string") return false;
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

const productData = z.object({
  content_type: z.literal("product"),
  content_ids: z.array(z.string().regex(/^prod_[a-zA-Z0-9]+$/)).min(1).max(20),
  contents: z.array(z.object({ id: z.string().regex(/^prod_[a-zA-Z0-9]+$/), quantity: z.number().int().positive().max(1000) })).max(20).optional(),
  num_items: z.number().int().positive().max(1000),
  value: z.number().finite().nonnegative().max(100000000).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
});

export const metaBrowserInput = z.object({
  dataset_id: z.string().regex(/^\d+$/),
  event_name: z.enum(["PageView", "ViewContent", "AddToCart"]),
  event_id: z.string().regex(/^(pageview|viewcontent|addtocart)_[a-f0-9-]{36}$/),
  event_time: z.number().int(),
  event_source_url: z.string().url().max(2048),
  custom_data: productData.optional(),
  user_data: z.object({
    client_user_agent: z.string().min(1).max(1024),
    client_ip_address: z.string().max(64).optional(),
    fbp: z.string().regex(/^fb\.\d+\.\d{13}\.\d+$/).max(256).optional(),
    fbc: z.string().regex(/^fb\.\d+\.\d{13}\.[a-zA-Z0-9_.-]+$/).max(512).optional(),
  }),
});

export function buildMetaBrowserEvent(input: unknown, config: MetaConfig): MetaEvent {
  const data = metaBrowserInput.parse(input);
  if (data.dataset_id !== config.datasetId) throw new MetaRequestError(false, "dataset_mismatch");
  if (!data.event_id.startsWith(`${data.event_name.toLowerCase()}_`)) throw new MetaRequestError(false, "event_id_mismatch");
  const now = Math.floor(Date.now() / 1000);
  if (data.event_time > now + 60 || data.event_time < now - 300) throw new MetaRequestError(false, "event_time_invalid");
  const source = new URL(data.event_source_url), store = new URL(config.storefrontUrl);
  if (source.origin !== store.origin) throw new MetaRequestError(false, "source_origin_invalid");
  if (data.event_name !== "PageView" && !data.custom_data) throw new MetaRequestError(false, "product_data_missing");
  if (data.custom_data && ((data.custom_data.value === undefined) !== (data.custom_data.currency === undefined))) {
    throw new MetaRequestError(false, "value_currency_mismatch");
  }
  // Avoid transmitting arbitrary query strings, fragments or URL credentials.
  source.search = ""; source.hash = ""; source.username = ""; source.password = "";
  const { client_ip_address: ip, ...userData } = data.user_data;
  return {
    event_name: data.event_name, event_id: data.event_id, event_time: Math.min(data.event_time, now),
    action_source: "website", event_source_url: source.href,
    user_data: { ...userData, ...(ip && isIP(ip) ? { client_ip_address: ip } : {}) },
    ...(data.custom_data ? { custom_data: data.custom_data } : {}),
  };
}

export async function enqueueMetaBrowserEvent(container: MedusaContainer, input: unknown): Promise<void> {
  const config = getMetaConfig();
  // Browser events are live. Do not pair a live Pixel event with a server test event.
  if (config.testEventCode) throw new MetaRequestError(false, "browser_pairing_live_only");
  const event = buildMetaBrowserEvent(input, config);
  const service: MetaConversionService = container.resolve(META_CONVERSION_MODULE);
  const id = `mbe_${hashMetaValue(`${config.datasetId}:${event.event_name}:${event.event_id}`)}`;
  if ((await service.listMetaBrowserEvents({ id })).length) return;
  try {
    await service.createMetaBrowserEvents({ id, dataset_id: config.datasetId,
      event_id: event.event_id, event_name: event.event_name as "PageView" | "ViewContent" | "AddToCart",
      payload: event as unknown as Record<string, unknown>, next_attempt_at: new Date(),
      expires_at: new Date((event.event_time + 86400) * 1000) });
  } catch (error) {
    if (!(await service.listMetaBrowserEvents({ id })).length) throw error;
  }
}

export async function processMetaBrowserEvents(container: MedusaContainer): Promise<void> {
  if (!metaRelayEnabled()) return;
  const config = getMetaConfig();
  const service: MetaConversionService = container.resolve(META_CONVERSION_MODULE);
  const rows = await service.listMetaBrowserEvents({ status: "pending", next_attempt_at: { $lte: new Date() } },
    { take: 50, order: { next_attempt_at: "ASC" } });
  for (const row of rows) {
    const attempt = row.attempts + 1;
    try {
      if (row.dataset_id !== config.datasetId) throw new MetaRequestError(false, "dataset_configuration_changed");
      if (new Date(row.expires_at).getTime() <= Date.now()) throw new MetaRequestError(false, "delivery_window_expired");
      if (!row.payload) throw new MetaRequestError(false, "event_payload_missing");
      await service.updateMetaBrowserEvents({ id: row.id, attempts: attempt });
      await sendMetaEvent({ ...config, testEventCode: undefined }, row.payload as unknown as MetaEvent);
      await service.updateMetaBrowserEvents({ id: row.id, status: "sent", payload: null, last_error: null });
      container.resolve("logger").info(`Meta CAPI: ${row.event_name} acknowledged; event ${row.event_id}`);
    } catch (error) {
      const retryable = !(error instanceof MetaRequestError) || error.retryable;
      const failed = !retryable || attempt >= 10;
      await service.updateMetaBrowserEvents({ id: row.id, attempts: attempt,
        status: failed ? "failed" : "pending", ...(failed ? { payload: null } : {}),
        next_attempt_at: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(attempt - 1, 6))),
        last_error: error instanceof MetaRequestError ? error.safeCode : "browser_event_delivery_error" });
    }
  }
}
