import type { 
  MedusaRequest, 
  MedusaResponse,
} from "@medusajs/framework/http"

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

export const POST = async (
  req: MedusaRequest,
  res: MedusaResponse
) => {
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
  } catch (error) {
    console.error("Error processing Contentful webhook:", error)
    res.status(500).json({ 
      message: "Error processing webhook",
      error: error.message 
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

