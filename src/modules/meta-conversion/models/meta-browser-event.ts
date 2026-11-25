import { model } from "@medusajs/framework/utils";
import { META_BROWSER_EVENT_NAMES } from "../../../services/meta-event-names";

export const MetaBrowserEvent = model.define("meta_browser_event", {
  id: model.id().primaryKey(),
  dataset_id: model.text(),
  event_id: model.text(),
  event_name: model.enum([...META_BROWSER_EVENT_NAMES]),
  status: model.enum(["pending", "sent", "failed"]).default("pending"),
  payload: model.json().nullable(),
  attempts: model.number().default(0),
  next_attempt_at: model.dateTime(),
  expires_at: model.dateTime(),
  last_error: model.text().nullable(),
});
