import type { ExecArgs, IOrderModuleService } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { formatOrderReference, ORDER_REFERENCE_METADATA_KEY } from "../utils/order-reference";

export default async function backfillOrderReferences({ container }: ExecArgs) {
  const orders: IOrderModuleService = container.resolve(Modules.ORDER);
  const apply = process.env.APPLY_ORDER_REFERENCE_BACKFILL === "true";
  const pageSize = 100;
  let inspected = 0;
  let missing = 0;

  for (let skip = 0; ; skip += pageSize) {
    const page = await orders.listOrders({}, { skip, take: pageSize });
    for (const order of page) {
      inspected++;
      const reference = formatOrderReference(order.display_id);
      if (order.metadata?.[ORDER_REFERENCE_METADATA_KEY] === reference) continue;

      missing++;
      if (apply) {
        await orders.updateOrders(order.id, {
          metadata: { ...(order.metadata || {}), [ORDER_REFERENCE_METADATA_KEY]: reference },
        });
      }
    }
    if (page.length < pageSize) break;
  }

  console.log(`${apply ? "Updated" : "Would update"} ${missing} of ${inspected} orders.`);
}
