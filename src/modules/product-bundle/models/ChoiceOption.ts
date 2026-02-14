import { model } from "@medusajs/framework/utils";

export const ChoiceOption = model.define("choice_option", {
  id: model.id().primaryKey(),
  choice_slot_id: model.text(),
  medusa_variant_id: model.text(),
  quantity: model.number().default(1),
  sort_order: model.number().default(0),
});

export default ChoiceOption;
