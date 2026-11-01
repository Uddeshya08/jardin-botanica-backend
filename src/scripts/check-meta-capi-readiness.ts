import type { ExecArgs } from "@medusajs/framework/types";
import { META_CONVERSION_MODULE } from "../modules/meta-conversion";
import type MetaConversionService from "../modules/meta-conversion/service";
import { buildMetaPurchase, getMetaConfig, metaEnabled } from "../services/meta-capi";
import type { MetaOrder } from "../services/meta-capi";
import { META_ORDER_FIELDS } from "../services/meta-order-query";

export default async function checkMetaReadiness({ container, args }: ExecArgs): Promise<void> {
  const config = getMetaConfig();
  const service: MetaConversionService = container.resolve(META_CONVERSION_MODULE);
  try {
    await service.listMetaConversionEvents({}, { take: 1, select: ["id"] });
  } catch {
    throw new Error("Meta queue table is unavailable. Apply the module migration before enabling Purchase tracking.");
  }
  console.log(JSON.stringify({
    dataset_id: config.datasetId,
    queue_table_available: true,
    purchase_tracking_enabled: metaEnabled(),
    test_mode_configured: Boolean(config.testEventCode),
    cod_mode: process.env.META_CAPI_COD_PURCHASE === "order_placed" ? "order_placed" : "disabled",
  }, null, 2));

  const orderId = args.find((arg) => arg.startsWith("order="))?.slice(6);
  if (!orderId) {
    console.log("No event sent. Add order=order_ID to inspect a specific order's eligibility without sending it.");
    return;
  }
  const { data } = await container.resolve("query").graph({ entity: "order", fields: META_ORDER_FIELDS,
    filters: { id: orderId } });
  if (!data[0]) throw new Error("Order not found");
  const decision = buildMetaPurchase(data[0] as unknown as MetaOrder, config);
  const rows = await service.listMetaConversionEvents({ order_id: orderId }, { take: 5 });
  console.log(JSON.stringify({ order_id: orderId, eligibility: decision.state,
    order_total: data[0].total ?? null,
    order_currency: data[0].currency_code ?? null,
    ...(decision.state === "ready" ? {
      event_id: decision.event.event_id,
      value: decision.event.custom_data?.value,
      currency: decision.event.custom_data?.currency,
    } : { reason: decision.reason }),
    queue: rows.map((row) => ({ dataset_id: row.dataset_id, status: row.status, attempts: row.attempts, last_error: row.last_error })),
  }, null, 2));
}
