import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { enqueueMetaBrowserEvent, metaRelayEnabled, validMetaRelaySecret } from "../../../../../services/meta-browser-events";
import { MetaRequestError } from "../../../../../services/meta-capi";
import { z } from "zod";

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  if (!validMetaRelaySecret(req.headers["x-meta-relay-secret"])) {
    res.status(401).json({ message: "Unauthorized" }); return;
  }
  if (!metaRelayEnabled()) { res.status(503).json({ message: "Meta relay disabled" }); return; }
  try {
    await enqueueMetaBrowserEvent(req.scope, req.body);
    res.status(202).json({ queued: true });
  } catch (error) {
    // Do not expose customer data, request bodies, provider bodies or credentials.
    const invalid = error instanceof z.ZodError || (error instanceof MetaRequestError && !error.retryable);
    res.status(invalid ? 400 : 503).json({ message: "Meta event could not be queued" });
  }
}
