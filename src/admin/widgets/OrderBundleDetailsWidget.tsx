import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { DetailWidgetProps } from "@medusajs/framework/types";
import { AdminOrder } from "@medusajs/framework/types";
import { 
  Container, 
  Heading, 
  Text, 
  Badge,
  Table
} from "@medusajs/ui";

interface BundleMetadata {
  _bundle_id: string;
  _bundle_title: string;
  _bundle_price: number;
  _bundle_selections?: Record<string, string[]>;
  _bundle_items?: Array<{
    variant_id: string;
    quantity: number;
  }>;
  _bundle_choice_items?: Array<{
    variant_id: string;
    quantity: number;
  }>;
}

const OrderBundleDetailsWidget = ({ data: order }: DetailWidgetProps<AdminOrder>) => {
  const bundleItems = order.items?.filter(
    (item) => item.metadata?._bundle_id
  ) || [];

  if (bundleItems.length === 0) {
    return null;
  }

  return (
    <Container>
      <div style={{ marginBottom: "16px" }}>
        <Heading level="h2">Gift Sets</Heading>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {bundleItems.map((item, index) => {
          const bundleMeta = item.metadata as unknown as BundleMetadata;
          
          return (
            <div 
              key={index}
              style={{ 
                border: "1px solid #e5e5e5", 
                borderRadius: "8px", 
                padding: "16px",
                backgroundColor: "#fafafa"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div>
                  <Text style={{ fontWeight: "600", fontSize: "16px" }}>
                    {bundleMeta._bundle_title || item.title}
                  </Text>
                  <Text style={{ color: "#666", fontSize: "14px" }}>
                    Quantity: {item.quantity}
                  </Text>
                </div>
                <Badge>₹{(bundleMeta._bundle_price || item.unit_price) * item.quantity}</Badge>
              </div>

              {bundleMeta._bundle_items && bundleMeta._bundle_items.length > 0 && (
                <div style={{ marginBottom: "12px" }}>
                  <Text style={{ fontWeight: "500", marginBottom: "8px", display: "block" }}>
                    Item's Inside:
                  </Text>
                  <Table>
                    <Table.Header>
                      <Table.Row>
                        <Table.HeaderCell>Variant ID</Table.HeaderCell>
                        <Table.HeaderCell>Quantity</Table.HeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {bundleMeta._bundle_items.map((bundleItem, idx) => (
                        <Table.Row key={idx}>
                          <Table.Cell>
                            <Text style={{ fontFamily: "monospace", fontSize: "12px" }}>
                              {bundleItem.variant_id}
                            </Text>
                          </Table.Cell>
                          <Table.Cell>{bundleItem.quantity * item.quantity}</Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table>
                </div>
              )}

              {bundleMeta._bundle_choice_items && bundleMeta._bundle_choice_items.length > 0 && (
                <div>
                  <Text style={{ fontWeight: "500", marginBottom: "8px", display: "block" }}>
                    User's Choice:
                  </Text>
                  <Table>
                    <Table.Header>
                      <Table.Row>
                        <Table.HeaderCell>Variant ID</Table.HeaderCell>
                        <Table.HeaderCell>Quantity</Table.HeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {bundleMeta._bundle_choice_items.map((choiceItem, idx) => (
                        <Table.Row key={idx}>
                          <Table.Cell>
                            <Text style={{ fontFamily: "monospace", fontSize: "12px" }}>
                              {choiceItem.variant_id}
                            </Text>
                          </Table.Cell>
                          <Table.Cell>{choiceItem.quantity * item.quantity}</Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "order.details.after",
});

export default OrderBundleDetailsWidget;
