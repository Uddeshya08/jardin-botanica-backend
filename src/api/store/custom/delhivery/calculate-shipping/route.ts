import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import axios from "axios";

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

  try {
    const baseUrl = process.env.DELHIVERY_BASE_URL || 'https://track.delhivery.com/';
    const response = await axios.get(
      `${baseUrl}c/api/kinko/v1/invoice/charges`,
      {
        params: {
          filter_codes: pincode,
          weight: weight,
        },
        headers: {
          Authorization: `Token ${process.env.DELHIVERY_API_TOKEN}`,
        },
      }
    );

    return res.json(response.data);
  } catch (error: any) {
    console.error("Calculate shipping error:", error);
    return res.status(500).json({
      error: "Failed to calculate shipping",
      details: error.response?.data || error.message,
    });
  }
}

