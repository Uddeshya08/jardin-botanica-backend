import type { MedusaContainer } from "@medusajs/framework/types";
import { META_CONVERSION_MODULE } from "../modules/meta-conversion";
import type MetaConversionService from "../modules/meta-conversion/service";
import { buildMetaPurchase, getMetaConfig, metaQueueId } from "./meta-capi";
import type { MetaEvent, MetaOrder } from "./meta-capi";
import { META_ORDER_FIELDS } from "./meta-order-query";

export async function getMetaPixelPurchase(container: MedusaContainer, orderId: string, datasetId: string) {
  const config = getMetaConfig();
  if (config.datasetId !== datasetId || config.testEventCode) return { state: "skipped" };
  const { data } = await container.resolve("query").graph({ entity: "order", fields: META_ORDER_FIELDS,
    filters: { id: orderId } });
  if (!data[0]) return { state: "skipped" };
  const decision = buildMetaPurchase(data[0] as unknown as MetaOrder, config);
  if (decision.state !== "ready") return { state: decision.state };
  const service: MetaConversionService = container.resolve(META_CONVERSION_MODULE);
  const [row] = await service.listMetaConversionEvents({ id: metaQueueId(datasetId, orderId) });
  // Wait for the order subscriber. Never turn an old/test/skipped receipt into a live browser Purchase.
  if (!row) return { state: "waiting" };
  if (row.test_event_code || row.status === "skipped" || row.status === "failed") return { state: "skipped" };
  const event = (row.payload as unknown as MetaEvent | null) || decision.event;
  if (event.event_id !== decision.event.event_id || event.event_time < Math.floor(Date.now() / 1000) - 86400) {
    return { state: "skipped" };
  }
  // Matching hashes and order/customer data are never returned to the browser.
  return { state: "ready", dataset_id: datasetId, event_id: event.event_id, custom_data: event.custom_data };
}
