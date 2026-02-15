import { model } from "@medusajs/framework/utils";

export const ChoiceSlot = model.define("choice_slot", {
  id: model.id().primaryKey(),
  bundle_id: model.text(),
  slot_name: model.text(),
  slot_description: model.text().nullable(),
  required: model.boolean().default(true),
  min_selections: model.number().default(1),
  max_selections: model.number().default(1),
  sort_order: model.number().default(0),
});

export default ChoiceSlot;
