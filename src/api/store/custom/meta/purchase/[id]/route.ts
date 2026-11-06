import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { metaRelayEnabled, validMetaRelaySecret } from "../../../../../../services/meta-browser-events";
import { getMetaPixelPurchase } from "../../../../../../services/meta-pixel-purchase";

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  if (!validMetaRelaySecret(req.headers["x-meta-relay-secret"])) {
    res.status(401).json({ message: "Unauthorized" }); return;
  }
  if (!metaRelayEnabled()) { res.json({ state: "skipped" }); return; }
  const dataset = req.query.dataset_id;
  if (!/^order_[a-zA-Z0-9]+$/.test(req.params.id) || typeof dataset !== "string" || !/^\d+$/.test(dataset)) {
    res.status(400).json({ message: "Invalid request" }); return;
  }
  try { res.json(await getMetaPixelPurchase(req.scope, req.params.id, dataset)); }
  catch { res.status(503).json({ state: "unavailable" }); }
}
