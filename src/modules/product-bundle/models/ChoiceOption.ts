import { model } from "@medusajs/framework/utils";
import { ChoiceSlot } from "./ChoiceSlot";

export const ChoiceOption = model.define("choice_option", {
  id: model.id().primaryKey(),
  medusa_variant_id: model.text(),
  quantity: model.number().default(1),
  sort_order: model.number().default(0),
  choice_slot: model.belongsTo(() => ChoiceSlot, { mappedBy: "options" }),
});

export default ChoiceOption;
