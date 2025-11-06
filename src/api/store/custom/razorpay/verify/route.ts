import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import crypto from "crypto";

/**
 * POST /store/custom/razorpay/verify
 * Verifies Razorpay payment signature
 */
interface VerifyRequest {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const body = req.body as VerifyRequest;
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = body;

    // Validate required fields
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      res.status(400).json({
        error: "razorpay_order_id, razorpay_payment_id, and razorpay_signature are required",
      });
      return;
    }

    // Get Razorpay key secret
    const keySecret =
      process.env.RAZORPAY_KEY_SECRET || "6iBecocanXPMuol08SHvt0zZ";

    if (!keySecret) {
      res.status(500).json({
        error: "Razorpay key secret not configured",
      });
      return;
    }

    // Generate signature
    const signatureBody = `${razorpay_order_id}|${razorpay_payment_id}`;
    const generatedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(signatureBody)
      .digest("hex");

    // Verify signature
    const isSignatureValid =
      generatedSignature === razorpay_signature;

    if (isSignatureValid) {
      res.json({
        success: true,
        verified: true,
        message: "Payment signature verified successfully",
        payment_id: razorpay_payment_id,
        order_id: razorpay_order_id,
      });
    } else {
      res.status(400).json({
        success: false,
        verified: false,
        error: "Invalid payment signature",
      });
    }
  } catch (error: any) {
    console.error("Razorpay verification error:", error);
    res.status(500).json({
      error: "Failed to verify payment",
      details: error.message || "Unknown error",
    });
  }
}

