import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { useState, useEffect } from "react";
import { 
  Container, 
  Heading, 
  Text, 
  Button, 
  Badge,
  Table
} from "@medusajs/ui";
import { Plus, Pencil, Trash } from "@medusajs/icons";

interface Bundle {
  id: string;
  title: string;
  description?: string;
  bundle_price: number;
  is_active: boolean;
  items?: any[];
  choice_slots?: any[];
}

const BundleList = () => {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBundles();
  }, []);

  const fetchBundles = async () => {
    try {
      const response = await fetch("/admin/bundles", {
        credentials: "include",
      });
      const data = await response.json();
      setBundles(data.bundles || []);
    } catch (error) {
      console.error("Error fetching bundles:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this bundle?")) return;
    
    try {
      await fetch(`/admin/bundles/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      fetchBundles();
    } catch (error) {
      console.error("Error deleting bundle:", error);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <Container className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Heading level="h1">Product Bundles</Heading>
          <Text className="text-gray-500">Manage your product bundles with fixed and choice items</Text>
        </div>
        <Button onClick={() => window.location.href = "/app/bundles"}>
          <Plus /> Manage Bundles
        </Button>
      </div>

      {bundles.length === 0 ? (
        <div className="p-6 text-center border rounded">
          <Text>No bundles yet. Create your first bundle to get started.</Text>
        </div>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Title</Table.HeaderCell>
              <Table.HeaderCell>Price</Table.HeaderCell>
              <Table.HeaderCell>Items</Table.HeaderCell>
              <Table.HeaderCell>Choice Slots</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Actions</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {bundles.map((bundle) => (
              <Table.Row key={bundle.id}>
                <Table.Cell>{bundle.title}</Table.Cell>
                <Table.Cell>₹{bundle.bundle_price}</Table.Cell>
                <Table.Cell>{bundle.items?.length || 0}</Table.Cell>
                <Table.Cell>{bundle.choice_slots?.length || 0}</Table.Cell>
                <Table.Cell>
                  <Badge color={bundle.is_active ? "green" : "red"}>
                    {bundle.is_active ? "Active" : "Inactive"}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="small" onClick={() => window.location.href = `/app/bundles/${bundle.id}`}>
                      <Pencil /> Edit
                    </Button>
                    <Button variant="danger" size="small" onClick={() => handleDelete(bundle.id)}>
                      <Trash />
                    </Button>
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "product.list.after",
});

export default BundleList;
