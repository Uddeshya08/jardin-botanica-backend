import { model } from "@medusajs/framework/utils";
import { BundleItem } from "./BundleItem";
import { ChoiceSlot } from "./ChoiceSlot";
import { BundleText } from "./BundleText";

export const Bundle = model.define("bundle", {
  id: model.id().primaryKey(),
  title: model.text(),
  description: model.text().nullable(),
  medusa_product_id: model.text().nullable(),
  medusa_variant_id: model.text().nullable(),
  bundle_price: model.number(),
  bundle_image: model.text().nullable(),
  is_active: model.boolean().default(true),
  is_featured: model.boolean().default(false),
  metadata: model.json().nullable(),
  items: model.hasMany(() => BundleItem, { mappedBy: "bundle" }),
  choice_slots: model.hasMany(() => ChoiceSlot, { mappedBy: "bundle" }),
  bundle_texts: model.hasMany(() => BundleText, { mappedBy: "bundle" }),
});

export default Bundle;
