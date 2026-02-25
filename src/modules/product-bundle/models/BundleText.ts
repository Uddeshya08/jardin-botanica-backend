import { model } from "@medusajs/framework/utils";
import { Bundle } from "./Bundle";

export const BundleText = model.define("bundle_text", {
  id: model.id().primaryKey(),
  text: model.text(),
  sort_order: model.number().default(0),
  bundle: model.belongsTo(() => Bundle, { mappedBy: "bundle_texts" }),
});

export default BundleText;
