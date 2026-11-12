import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types";
import { Badge, Container, Heading, Text } from "@medusajs/ui";
import { DELHIVERY_PROVIDER_ID } from "../../utils/delhivery-tracking";
import type { DelhiveryTracking } from "../../utils/delhivery-tracking";

function DelhiveryTrackingWidget({ data: order }: DetailWidgetProps<AdminOrder>) {
  const shipments = order.fulfillments?.filter(
    (fulfillment) => fulfillment.provider_id === DELHIVERY_PROVIDER_ID && fulfillment.data?.waybill,
  );
  if (!shipments?.length) return null;

  return (
    <Container className="flex flex-col gap-4">
      <Heading level="h2">Delhivery tracking</Heading>
      {shipments.map((fulfillment) => {
        const tracking = fulfillment.metadata?.delhivery_tracking as DelhiveryTracking | undefined;
        const status = fulfillment.canceled_at ? "Canceled" :
          fulfillment.delivered_at ? "Delivered" : tracking?.stage || "Awaiting first scan";
        return (
          <div key={fulfillment.id} className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <Text weight="plus">AWB {String(fulfillment.data?.waybill)}</Text>
              {tracking?.scannedAt && (
                <Text size="small" className="text-ui-fg-subtle">
                  Last carrier scan {new Date(tracking.scannedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST
                </Text>
              )}
            </div>
            <Badge color={fulfillment.delivered_at ? "green" : "grey"}>{status}</Badge>
          </div>
        );
      })}
    </Container>
  );
}

export const config = defineWidgetConfig({ zone: "order.details.after" });
export default DelhiveryTrackingWidget;
