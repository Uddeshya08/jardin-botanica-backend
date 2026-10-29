import type { MedusaContainer } from "@medusajs/framework/types";
import { META_CONVERSION_MODULE } from "../modules/meta-conversion";
import type MetaConversionService from "../modules/meta-conversion/service";
import { buildMetaPurchase, getMetaConfig, metaEnabled, metaQueueId, MetaRequestError, sendMetaEvent } from "./meta-capi";
import type { MetaEvent, MetaOrder } from "./meta-capi";

export async function enqueueMetaOrder(container: MedusaContainer, orderId: string): Promise<void> {
  if (!metaEnabled()) return;
  const config = getMetaConfig();
  const service: MetaConversionService = container.resolve(META_CONVERSION_MODULE);
  const id = metaQueueId(config.datasetId, orderId);
  const existing = await service.listMetaConversionEvents({ id });
  if (existing.length) return;
  try {
    await service.createMetaConversionEvents({ id, order_id: orderId, dataset_id: config.datasetId,
      test_event_code: config.testEventCode || null,
      next_attempt_at: new Date(), expires_at: new Date(Date.now() + 7 * 86400000) });
  } catch (error) {
    // The deterministic primary key also protects concurrent deliveries of order.placed.
    if (!(await service.listMetaConversionEvents({ id })).length) throw error;
  }
}

export async function processMetaConversions(container: MedusaContainer): Promise<void> {
  if (!metaEnabled()) return;
  const config = getMetaConfig();
  const service: MetaConversionService = container.resolve(META_CONVERSION_MODULE);
  const logger = container.resolve("logger");
  const rows = await service.listMetaConversionEvents({ status: "pending", next_attempt_at: { $lte: new Date() } },
    { take: 20, order: { next_attempt_at: "ASC" } });
  for (const row of rows) {
    if (row.dataset_id !== config.datasetId) {
      // Never send a queued purchase to a different dataset after a config change.
      await service.updateMetaConversionEvents({ id: row.id, status: "failed", payload: null, last_error: "dataset_configuration_changed" });
      continue;
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await service.updateMetaConversionEvents({ id: row.id, status: "failed", payload: null, last_error: "delivery_window_expired" });
      continue;
    }
    const attempt = row.attempts + 1;
    try {
      const query = container.resolve("query");
      const { data } = await query.graph({ entity: "order", fields: [
        "id", "status", "created_at", "total", "currency_code", "email", "customer_id", "metadata",
        "shipping_address.phone", "shipping_address.country_code", "shipping_methods.data",
        "items.product_id", "items.quantity", "payment_collections.status", "payment_collections.captured_amount",
        "payment_collections.completed_at", "payment_collections.payments.provider_id",
      ], filters: { id: row.order_id } });
      if (!data[0]) throw new MetaRequestError(true, "order_not_available");
      const decision = buildMetaPurchase(data[0] as unknown as MetaOrder, config);
      if (decision.state === "skipped") {
        await service.updateMetaConversionEvents({ id: row.id, status: "skipped", payload: null, last_error: decision.reason });
        continue;
      }
      if (decision.state === "waiting") {
        await service.updateMetaConversionEvents({ id: row.id, next_attempt_at: new Date(Date.now() + 60000), last_error: decision.reason });
        continue;
      }
      // Freeze event_time and amount before the first request, including uncertain timeouts.
      const payload = (row.payload as unknown as MetaEvent | null) || decision.event;
      const expiresAt = new Date((payload.event_time + 86400) * 1000);
      if (expiresAt.getTime() <= Date.now()) throw new MetaRequestError(false, "delivery_window_expired");
      await service.updateMetaConversionEvents({ id: row.id, payload: payload as unknown as Record<string, unknown>,
        attempts: attempt, expires_at: expiresAt });
      // A queued test event must never become a production event after a config change.
      await sendMetaEvent({ ...config, testEventCode: row.test_event_code || undefined }, payload);
      // Retain only the ID/receipt state; remove customer matching hashes after delivery.
      await service.updateMetaConversionEvents({ id: row.id, status: "sent", payload: null, last_error: null });
      logger.info(`Meta CAPI: Purchase acknowledged for ${row.order_id}, dataset ${config.datasetId}`);
    } catch (error) {
      const retryable = !(error instanceof MetaRequestError) || error.retryable;
      const failed = !retryable || attempt >= 10;
      await service.updateMetaConversionEvents({ id: row.id, attempts: attempt,
        status: failed ? "failed" : "pending", ...(failed ? { payload: null } : {}),
        next_attempt_at: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(attempt - 1, 6))),
        last_error: error instanceof MetaRequestError ? error.safeCode : "queue_processing_error" });
      logger.warn(`Meta CAPI: ${failed ? "stopped" : "retry scheduled"} for ${row.order_id}; details in meta_conversion_event`);
    }
  }
}
