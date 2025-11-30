import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { DelhiveryApiClient } from "../../../../../modules/delhivery-fulfillment/api-client";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { pincode } = req.query;

  if (!pincode) {
    return res.status(400).json({
      error: "Pincode is required",
    });
  }

  if (!process.env.DELHIVERY_API_TOKEN) {
    return res.status(500).json({
      error: "Delhivery API token not configured",
    });
  }

  try {
    const client = new DelhiveryApiClient();
    const data = await client.checkServiceability(pincode as string);
    return res.json(data);
  } catch (error: any) {
    console.error("Serviceability check error:", error);
    return res.status(500).json({
      error: "Failed to check delivery serviceability",
      details: error.message,
    });
  }
}
