import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { DelhiveryApiClient } from "../../../../../modules/delhivery-fulfillment/api-client";

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const { pincode, weight } = req.query;

  if (!pincode || !weight) {
    return res.status(400).json({
      error: "Pincode and weight are required",
    });
  }

  if (!process.env.DELHIVERY_API_TOKEN) {
    return res.status(500).json({
      error: "Delhivery API token not configured",
    });
  }

  try {
    const client = new DelhiveryApiClient();
    const data = await client.calculateShipping(
      pincode as string,
      Number(weight)
    );
    return res.json(data);
  } catch (error: any) {
    console.error("Calculate shipping error:", error);
    return res.status(500).json({
      error: "Failed to calculate shipping",
      details: error.message,
    });
  }
}

