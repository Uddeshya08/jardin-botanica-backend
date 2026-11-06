import type { MedusaContainer } from "@medusajs/framework/types";
import { processMetaBrowserEvents } from "../services/meta-browser-events";

let running = false;
export default async function metaBrowserEvents(container: MedusaContainer): Promise<void> {
  if (running) return;
  running = true;
  try { await processMetaBrowserEvents(container); }
  catch { container.resolve("logger").error("Meta CAPI browser-event job failed; commerce is unaffected"); }
  finally { running = false; }
}

export const config = { name: "meta-browser-events", schedule: "* * * * *" };
