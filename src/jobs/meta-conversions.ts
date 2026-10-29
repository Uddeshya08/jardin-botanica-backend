import type { MedusaContainer } from "@medusajs/framework/types";
import { processMetaConversions } from "../services/meta-conversion-queue";

let running = false;

export default async function metaConversions(container: MedusaContainer): Promise<void> {
  if (running) return;
  running = true;
  try {
    await processMetaConversions(container);
  } catch {
    container.resolve("logger").error("Meta CAPI background job failed; commerce operations are unaffected");
  } finally {
    running = false;
  }
}

export const config = { name: "meta-conversions", schedule: "* * * * *" };
