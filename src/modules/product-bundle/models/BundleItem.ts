import { model } from "@medusajs/framework/utils";

export const BundleItem = model.define("bundle_item", {
  id: model.id().primaryKey(),
  bundle_id: model.text(),
  medusa_variant_id: model.text(),
  quantity: model.number().default(1),
  sort_order: model.number().default(0),
});

export default BundleItem;
