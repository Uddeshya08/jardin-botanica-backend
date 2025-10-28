import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import axios from "axios";

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const { pincode } = req.query;

  if (!pincode) {
    return res.status(400).json({
      error: "Pincode is required",
    });
  }

  try {
    const baseUrl = process.env.DELHIVERY_BASE_URL || 'https://track.delhivery.com/';
    const response = await axios.get(
      `${baseUrl}c/api/pin-codes/json/`,
      {
        params: { filter_codes: pincode },
        headers: {
          Authorization: `Token ${process.env.DELHIVERY_API_TOKEN}`,
        },
      }
    );

    return res.json(response.data);
  } catch (error: any) {
    console.error("Serviceability check error:", error);
    return res.status(500).json({
      error: "Failed to check delivery serviceability",
      details: error.response?.data || error.message,
    });
  }
}

