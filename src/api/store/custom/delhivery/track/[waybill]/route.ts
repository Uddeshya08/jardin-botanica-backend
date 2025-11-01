import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { DelhiveryApiClient } from "../../../../../../modules/delhivery-fulfillment/api-client";

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const { waybill } = req.params;

  if (!waybill) {
    return res.status(400).json({
      error: "Waybill is required",
    });
  }

  if (!process.env.DELHIVERY_API_TOKEN) {
    return res.status(500).json({
      error: "Delhivery API token not configured",
    });
  }

  try {
    const client = new DelhiveryApiClient();
    const data = await client.trackShipment(waybill);
    return res.json(data);
  } catch (error: any) {
    console.error("Track shipment error:", error);
    return res.status(500).json({
      error: "Failed to track shipment",
      details: error.message,
    });
  }
}

