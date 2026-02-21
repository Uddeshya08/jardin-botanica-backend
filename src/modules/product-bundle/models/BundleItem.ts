import { model } from "@medusajs/framework/utils";
import { Bundle } from "./Bundle";

export const BundleItem = model.define("bundle_item", {
  id: model.id().primaryKey(),
  medusa_variant_id: model.text(),
  quantity: model.number().default(1),
  sort_order: model.number().default(0),
  bundle: model.belongsTo(() => Bundle, { mappedBy: "items" }),
});

export default BundleItem;
