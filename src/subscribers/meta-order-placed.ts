import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { enqueueMetaOrder } from "../services/meta-conversion-queue";

export default async function metaOrderPlaced({ event: { data }, container }: SubscriberArgs<{ id: string }>): Promise<void> {
  // Independent subscriber: never change fulfillment, payment, email, or order state.
  try {
    await enqueueMetaOrder(container, data.id);
  } catch {
    container.resolve("logger").error("Meta CAPI: could not queue order; order processing is unaffected");
  }
}

export const config: SubscriberConfig = { event: "order.placed" };
