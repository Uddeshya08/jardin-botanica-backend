import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types";
import { Container, Heading, Text } from "@medusajs/ui";
import { getOrderReference } from "../../utils/order-reference";

const OrderReferenceWidget = ({ data: order }: DetailWidgetProps<AdminOrder>) => {
  const reference = getOrderReference(order);

  return (
    <Container className="flex items-center justify-between gap-4">
      <Heading level="h2">Jardin Botanica reference</Heading>
      <Text weight="plus">{reference || order.id}</Text>
    </Container>
  );
};

export const config = defineWidgetConfig({ zone: "order.details.after" });

export default OrderReferenceWidget;
