import { model } from "@medusajs/framework/utils";
import { Bundle } from "./Bundle";
import { ChoiceOption } from "./ChoiceOption";

export const ChoiceSlot = model.define("choice_slot", {
  id: model.id().primaryKey(),
  slot_name: model.text(),
  slot_description: model.text().nullable(),
  required: model.boolean().default(true),
  min_selections: model.number().default(1),
  max_selections: model.number().default(1),
  sort_order: model.number().default(0),
  bundle: model.belongsTo(() => Bundle, { mappedBy: "choice_slots" }),
  options: model.hasMany(() => ChoiceOption, { mappedBy: "choice_slot" }),
});

export default ChoiceSlot;
