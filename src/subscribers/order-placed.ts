import type { SubscriberConfig, SubscriberArgs } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";
import { sendOrderConfirmationEmail } from "../services/email.service";

export default async function handleOrderPlaced({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = data.id;
  const orderModuleService = container.resolve(Modules.ORDER);
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
  const query = container.resolve("query");

  try {
    // Use query to get order with fulfillments and customer data
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "*",
        "items.*",
        "items.variant.*",
        "shipping_address.*",
        "shipping_methods.*",
        "fulfillments.*",
        "fulfillments.items.*",
        "fulfillments.labels.*",
        "customer.*",
      ],
      filters: { id: orderId },
    });

    const order = orders[0];

    console.log("Order placed:", JSON.stringify(order, null, 2));

    // Check if fulfillments already exist
    if (order.fulfillments && order.fulfillments.length > 0) {
      console.log("Fulfillments already exist:", JSON.stringify(order.fulfillments, null, 2));
      return order.fulfillments[0];
    }

    if (!order.shipping_address) {
      throw new Error("Order has no shipping address");
    }

    if (!order.items || order.items.length === 0) {
      throw new Error("Order has no items");
    }

    if (!order.shipping_methods || order.shipping_methods.length === 0) {
      throw new Error("Order has no shipping methods");
    }

    // Get shipping method data which contains all the info
    const shippingMethod = order.shipping_methods[0];
    const shippingData = shippingMethod.data || {};

    // Prepare delivery address from order shipping address
    const deliveryAddress = {
      first_name: order.shipping_address.first_name || "",
      last_name: order.shipping_address.last_name || "",
      phone: order.shipping_address.phone || "",
      company: order.shipping_address.company || "",
      address_1: order.shipping_address.address_1 || "",
      address_2: order.shipping_address.address_2 || "",
      city: order.shipping_address.city || "",
      province: order.shipping_address.province || "",
      postal_code: order.shipping_address.postal_code || "",
      country_code: order.shipping_address.country_code || "",
    };

    // Prepare fulfillment items with variant data
    const fulfillmentItems = order.items.map((item) => ({
      title: item.variant_title || item.title,
      sku: item.variant_sku || "",
      quantity: item.quantity,
      barcode: item.variant_barcode || "",
      line_item_id: item.id,
    }));

    // Prepare order data for fulfillment provider
    const orderData = {
      id: order.id,
      display_id: order.display_id,
      items: order.items.map((item) => ({
        id: item.id,
        title: item.product_title || item.title,
        subtitle: item.subtitle || item.variant_title || "",
        quantity: item.quantity,
        variant: {
          weight: item.variant?.weight || 0,
          sku: item.variant_sku || "",
        },
      })),
      shipping_address: order.shipping_address,
      shipping_methods: order.shipping_methods,
    };

    // Create fulfillment with the exact format your provider expects
    const fulfillment = await fulfillmentModuleService.createFulfillment({
      location_id: shippingData.location_id || "",
      provider_id: "delhivery_delhivery", // Your actual provider ID
      delivery_address: deliveryAddress,
      items: fulfillmentItems,
      labels: [],
      order: orderData,
      data: shippingData, // Pass the shipping method data directly
    });

    console.log("Fulfillment created:", JSON.stringify(fulfillment, null, 2));

    // Query again to get the complete fulfillment data with all relations
    const { data: updatedOrders } = await query.graph({
      entity: "order",
      fields: [
        "*",
        "fulfillments.*",
        "fulfillments.items.*",
        "fulfillments.labels.*",
        "fulfillments.delivery_address.*",
      ],
      filters: { id: orderId },
    });

    console.log(
      "Updated order with fulfillments:",
      JSON.stringify(updatedOrders[0].fulfillments, null, 2),
    );

    // Send order confirmation email after fulfillment is created
    try {
      await sendOrderConfirmationEmail(order);
    } catch (emailError) {
      // Don't fail the fulfillment if email fails
      console.error("Error sending order confirmation email:", emailError);
    }

    return fulfillment;
  } catch (error) {
    console.error("Error creating fulfillment:", error);
    throw error;
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
};
