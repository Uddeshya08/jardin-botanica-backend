import type { 
  MedusaRequest, 
  MedusaResponse,
} from "@medusajs/framework/http"
import crypto from "crypto"

type ContentfulWebhookEvent = {
  sys?: {
    type?: string
    id?: string
    contentType?: {
      sys?: {
        id?: string
      }
    }
    environment?: {
      sys?: {
        id?: string
      }
    }
  }
}

/**
 * Verifies Contentful webhook signature using HMAC-SHA256
 * @param secret - The webhook signing secret from Contentful
 * @param signature - The X-Contentful-Signature header value
 * @param signedHeaders - The X-Contentful-Signed-Headers header value
 * @param timestamp - The X-Contentful-Timestamp header value
 * @param body - The raw request body as string
 * @returns true if signature is valid, false otherwise
 */
function verifyContentfulSignature(
  secret: string,
  signature: string,
  signedHeaders: string,
  timestamp: string,
  body: string
): boolean {
  if (!secret || !signature || !signedHeaders || !timestamp) {
    return false
  }

  try {
    // Build the string to sign
    const stringToSign = `${timestamp}\n${signedHeaders}\n${body}`
    
    // Create HMAC-SHA256 signature
    const hmac = crypto.createHmac("sha256", secret)
    hmac.update(stringToSign)
    const calculatedSignature = hmac.digest("hex")
    
    // Compare signatures using constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(calculatedSignature, "hex"),
      Buffer.from(signature, "hex")
    )
  } catch (error) {
    console.error("Error verifying Contentful signature:", error)
    return false
  }
}

export const POST = async (
  req: MedusaRequest,
  res: MedusaResponse
) => {
  const webhookSecret = process.env.CONTENTFUL_WEBHOOK_SECRET

  // Verify webhook secret is configured
  if (!webhookSecret) {
    console.error("CONTENTFUL_WEBHOOK_SECRET is not configured")
    return res.status(500).json({ 
      message: "Webhook secret not configured",
      error: "CONTENTFUL_WEBHOOK_SECRET environment variable is required" 
    })
  }

  // Extract signature headers
  const signature = req.headers["x-contentful-signature"] as string
  const signedHeaders = req.headers["x-contentful-signed-headers"] as string
  const timestamp = req.headers["x-contentful-timestamp"] as string

  // Verify signature headers are present
  if (!signature || !signedHeaders || !timestamp) {
    console.error("Missing Contentful signature headers")
    return res.status(403).json({ 
      message: "Unauthorized",
      error: "Missing required signature headers" 
    })
  }

  // Get raw body for signature verification
  const rawBody = typeof req.body === "string" 
    ? req.body 
    : JSON.stringify(req.body)

  // Verify signature
  const isValid = verifyContentfulSignature(
    webhookSecret,
    signature,
    signedHeaders,
    timestamp,
    rawBody
  )

  if (!isValid) {
    console.error("Invalid Contentful webhook signature")
    return res.status(403).json({ 
      message: "Unauthorized",
      error: "Invalid webhook signature" 
    })
  }

  const event = req.body as ContentfulWebhookEvent

  try {
    // The medusa-plugin-contentful handles the sync automatically
    // This endpoint just needs to receive and acknowledge the webhook
    
    // You can add custom logic here if needed
    // For example: invalidate cache, trigger notifications, etc.

    res.status(200).json({ 
      message: "Webhook received successfully",
      received: true 
    })
  } catch (error: any) {
    console.error("Error processing Contentful webhook:", error)
    res.status(500).json({ 
      message: "Error processing webhook"
    })
  }
}

export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse
) => {
  // Health check endpoint for the webhook
  res.status(200).json({ 
    message: "Contentful webhook endpoint is active",
    status: "ok" 
  })
}

