import type { SubscriberConfig, SubscriberArgs } from "@medusajs/framework";
import { createOrderFulfillmentWorkflow } from "@medusajs/medusa/core-flows";
import { sendOrderConfirmationEmail } from "../services/email.service";

export default async function handleOrderPlaced({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = data.id;

  try {
    const query = container.resolve("query");

    // Get order with all necessary data
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "*",
        "items.*",
        "items.variant.*",
        "items.product.*",
        "shipping_address.*",
        "billing_address.*",
        "customer.*",
        "shipping_methods.*",
      ],
      filters: { id: orderId },
    });

    const order = orders[0];

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    if (!order.items || order.items.length === 0) {
      throw new Error(`Order ${orderId} has no items`);
    }

    // Build items to fulfill
    const itemsToFulfill = order.items.filter((item): item is NonNullable<typeof item> => item !== null).map((item) => ({
      id: item.id,
      quantity: item.quantity,
    }));

    // Create fulfillment using core workflow
    const { result, errors } = await createOrderFulfillmentWorkflow(container).run({
      input: {
        order_id: orderId,
        items: itemsToFulfill,
      },
    });

    if (errors && errors.length > 0) {
      console.error("Fulfillment workflow errors:", errors);
      throw new Error(`Failed to create fulfillment: ${errors[0].error.message}`);
    }

    console.log("Fulfillment created successfully:", {
      fulfillment_id: result.id,
      order_id: orderId,
    });

    // Send order confirmation email
    try {
      await sendOrderConfirmationEmail(order);
      console.log("Order confirmation email sent successfully for order:", orderId);
    } catch (emailError) {
      console.error("Error sending order confirmation email:", {
        order_id: orderId,
        error: emailError.message,
      });
      // Don't throw - we don't want email failures to mark the fulfillment as failed
    }

    return {
      success: true,
      fulfillment_id: result.id,
      order_id: orderId,
    };
  } catch (error) {
    console.error("Error in order.placed subscriber:", {
      order_id: orderId,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
};
