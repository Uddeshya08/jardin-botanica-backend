import { model } from "@medusajs/framework/utils";

export const MetaBrowserEvent = model.define("meta_browser_event", {
  id: model.id().primaryKey(),
  dataset_id: model.text(),
  event_id: model.text(),
  event_name: model.enum(["PageView", "ViewContent", "AddToCart"]),
  status: model.enum(["pending", "sent", "failed"]).default("pending"),
  payload: model.json().nullable(),
  attempts: model.number().default(0),
  next_attempt_at: model.dateTime(),
  expires_at: model.dateTime(),
  last_error: model.text().nullable(),
});
