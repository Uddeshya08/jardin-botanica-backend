import type { 
  MedusaRequest, 
  MedusaResponse,
} from "@medusajs/framework/http"

export const POST = async (
  req: MedusaRequest,
  res: MedusaResponse
) => {
  const event = req.body

  console.log("Received Contentful webhook:", {
    topic: event.sys?.type,
    contentType: event.sys?.contentType?.sys?.id,
    environment: event.sys?.environment?.sys?.id,
    entityId: event.sys?.id,
  })

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

