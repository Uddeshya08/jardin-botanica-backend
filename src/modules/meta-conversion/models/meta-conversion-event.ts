import { model } from "@medusajs/framework/utils";

export const MetaConversionEvent = model.define("meta_conversion_event", {
  id: model.id().primaryKey(),
  order_id: model.text(),
  dataset_id: model.text(),
  test_event_code: model.text().nullable(),
  status: model.enum(["pending", "sent", "skipped", "failed"]).default("pending"),
  payload: model.json().nullable(),
  attempts: model.number().default(0),
  next_attempt_at: model.dateTime(),
  expires_at: model.dateTime(),
  last_error: model.text().nullable(),
});
