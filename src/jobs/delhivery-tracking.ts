import type { FulfillmentDTO, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createOrderShipmentWorkflow, markOrderFulfillmentAsDeliveredWorkflow } from "@medusajs/medusa/core-flows";
import { DelhiveryApiClient } from "../modules/delhivery-fulfillment/api-client";
import { DELHIVERY_PROVIDER_ID, getDelhiveryTracking } from "../utils/delhivery-tracking";
import type { DelhiveryTracking } from "../utils/delhivery-tracking";

const batchSize = 25;
const concurrency = 4;
let cursor: string | undefined;
let running = false;

function previousScan(fulfillment: Pick<FulfillmentDTO, "metadata">): DelhiveryTracking | undefined {
  return fulfillment.metadata?.delhivery_tracking as DelhiveryTracking | undefined;
}

async function syncFulfillment(container: MedusaContainer, candidate: FulfillmentDTO, client: DelhiveryApiClient) {
  const waybill = String(candidate.data?.waybill ?? "");
  const lastScan = previousScan(candidate);
  if (!/^\d{1,32}$/.test(waybill) || (lastScan?.terminal && !lastScan.delivered)) return;
  const scan = getDelhiveryTracking(await client.trackShipment(waybill, 8000), waybill);
  if (!scan) return;

  const locking = container.resolve(Modules.LOCKING);
  await locking.execute(`delhivery-tracking:${candidate.id}`, async () => {
    const service = container.resolve(Modules.FULFILLMENT);
    const current = await service.retrieveFulfillment(candidate.id, { relations: ["items", "labels"] });
    if (current.canceled_at || current.delivered_at || String(current.data?.waybill ?? "") !== waybill) return;
    const previous = previousScan(current);
    if (previous?.scannedAt && previous.scannedAt > scan.scannedAt) return;
    if (previous?.terminal && !previous.delivered) return;

    let orderId: string | undefined;
    if ((scan.shipped && !current.shipped_at) || scan.delivered) {
      const query = container.resolve(ContainerRegistrationKeys.QUERY);
      const { data: links } = await query.graph({
        entity: "order_fulfillment",
        fields: ["order_id"],
        filters: { fulfillment_id: current.id },
      });
      orderId = links[0]?.order_id;
      if (!orderId) return;
    }

    if (scan.shipped && !current.shipped_at && orderId) {
      // Core workflow derives kit quantities from the stored fulfillment items.
      const items = new Map<string, FulfillmentDTO["items"][number]>();
      for (const item of current.items) if (item.line_item_id && !items.has(item.line_item_id)) items.set(item.line_item_id, item);
      if (!items.size) throw new Error("Delhivery fulfillment has no order items");
      await createOrderShipmentWorkflow(container).run({
        input: {
          order_id: orderId,
          fulfillment_id: current.id,
          items: Array.from(items, ([id, item]) => ({ id, quantity: item.quantity })),
          labels: current.labels.map(({ id, tracking_number, tracking_url, label_url }) => ({
            id, tracking_number, tracking_url, label_url,
          })),
          no_notification: true,
        },
      });
    }

    if (previous?.scannedAt !== scan.scannedAt || previous?.status !== scan.status || previous?.stage !== scan.stage ||
        previous?.terminal !== scan.terminal || previous?.delivered !== scan.delivered) {
      await service.updateFulfillment(current.id, {
        metadata: { ...current.metadata, delhivery_tracking: scan },
      });
    }

    if (scan.delivered && orderId) {
      await markOrderFulfillmentAsDeliveredWorkflow(container).run({
        input: { orderId, fulfillmentId: current.id },
      });
    }
  });
}

export default async function syncDelhiveryTracking(container: MedusaContainer): Promise<void> {
  if (running || process.env.DELHIVERY_TRACKING_SYNC_ENABLED !== "true" || !process.env.DELHIVERY_API_TOKEN?.trim()) return;
  running = true;
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const { data } = await query.graph({
      entity: "fulfillment",
      fields: ["id", "data", "metadata"],
      filters: {
        provider_id: DELHIVERY_PROVIDER_ID,
        requires_shipping: true,
        delivered_at: null,
        canceled_at: null,
        ...(cursor ? { id: { $gt: cursor } } : {}),
      },
      pagination: { take: batchSize, order: { id: "ASC" } },
    });
    const candidates = data as FulfillmentDTO[];
    const client = new DelhiveryApiClient();
    for (let i = 0; i < candidates.length; i += concurrency) {
      await Promise.all(candidates.slice(i, i + concurrency).map(async (candidate) => {
        try {
          await syncFulfillment(container, candidate, client);
        } catch {
          logger.warn(`Delhivery tracking sync failed for fulfillment ${candidate.id}; will retry in a later cycle`);
        }
      }));
    }
    cursor = candidates.length === batchSize ? candidates.at(-1)?.id : undefined;
  } catch {
    logger.error("Delhivery tracking job could not load fulfillments");
  } finally {
    running = false;
  }
}

export const config = { name: "delhivery-tracking", schedule: "0 * * * *" };
