import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import axios from "axios";

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

  try {
    const baseUrl = process.env.DELHIVERY_BASE_URL || 'https://track.delhivery.com/';
    const response = await axios.get(
      `${baseUrl}c/api/packages/json`,
      {
        params: { waybill: waybill },
        headers: {
          Authorization: `Token ${process.env.DELHIVERY_API_TOKEN}`,
        },
      }
    );

    return res.json(response.data);
  } catch (error: any) {
    console.error("Track shipment error:", error);
    return res.status(500).json({
      error: "Failed to track shipment",
      details: error.response?.data || error.message,
    });
  }
}

