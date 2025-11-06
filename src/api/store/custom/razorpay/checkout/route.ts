import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import Razorpay from "razorpay";

/**
 * POST /store/custom/razorpay/checkout
 * Creates a Razorpay order for checkout
 */
interface CheckoutRequest {
  amount: number;
  currency?: string;
  receipt?: string;
  order_id: string;
  customer_name?: string;
  customer_email?: string;
  customer_contact?: string;
  notes?: Record<string, any>;
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const body = req.body as CheckoutRequest;
    const {
      amount,
      currency = "INR",
      receipt,
      order_id, // Medusa order ID
      customer_name,
      customer_email,
      customer_contact,
      notes,
    } = body;

    // Validate required fields
    if (!amount || !order_id) {
      res.status(400).json({
        error: "Amount and order_id are required",
      });
      return;
    }

    // Get Razorpay credentials from environment or config
    const keyId = process.env.RAZORPAY_KEY_ID || "rzp_test_KZp3v4sgtPHTJI";
    const keySecret =
      process.env.RAZORPAY_KEY_SECRET || "6iBecocanXPMuol08SHvt0zZ";

    if (!keyId || !keySecret) {
      res.status(500).json({
        error: "Razorpay credentials not configured",
      });
      return;
    }

    // Initialize Razorpay instance
    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    // Convert amount to paise (Razorpay expects amount in smallest currency unit)
    const amountInPaise = Math.round(amount * 100);

    // Create Razorpay order
    const razorpayOrderOptions: any = {
      amount: amountInPaise,
      currency: currency,
      receipt: receipt || `receipt_${order_id}_${Date.now()}`,
      payment_capture: 1, // Auto capture payment
      notes: {
        medusa_order_id: order_id,
        ...notes,
      },
    };

    // Add customer details if provided
    if (customer_name || customer_email || customer_contact) {
      razorpayOrderOptions.notes = {
        ...razorpayOrderOptions.notes,
        ...(customer_name && { customer_name }),
        ...(customer_email && { customer_email }),
        ...(customer_contact && { customer_contact }),
      };
    }

    const razorpayOrder = await razorpay.orders.create(razorpayOrderOptions);

    // Return order details for frontend
    res.json({
      success: true,
      order: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        amount_display: amount, // Amount in rupees for display
        currency: razorpayOrder.currency,
        receipt: razorpayOrder.receipt,
        status: razorpayOrder.status,
        created_at: razorpayOrder.created_at,
      },
      key_id: keyId, // Frontend needs this to initialize Razorpay checkout
      medusa_order_id: order_id,
    });
  } catch (error: any) {
    console.error("Razorpay checkout error:", error);
    res.status(500).json({
      error: "Failed to create Razorpay order",
      details: error.message || "Unknown error",
    });
  }
}

