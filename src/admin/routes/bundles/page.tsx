import { defineRouteConfig } from "@medusajs/admin-sdk";
import { useState, useEffect } from "react";
import { 
  Container, 
  Heading, 
  Text, 
  Button, 
  Input, 
  Label,
  Badge,
  Table,
  Textarea
} from "@medusajs/ui";
import { Plus, Pencil, Trash } from "@medusajs/icons";

interface Bundle {
  id: string;
  title: string;
  description?: string;
  bundle_price: number;
  is_active: boolean;
  is_featured: boolean;
  medusa_variant_id?: string;
  items?: any[];
  bundle_texts?: any[];
  choice_slots?: any[];
}

interface BundleItem {
  medusa_variant_id: string;
  quantity: number;
  sort_order: number;
}

interface ChoiceSlot {
  slot_name: string;
  slot_description?: string;
  required: boolean;
  min_selections: number;
  max_selections: number;
  sort_order: number;
  options: any[];
}

interface BundleTextEntry {
  text: string;
  sort_order: number;
}

const BundlesPage = () => {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingBundle, setEditingBundle] = useState<Bundle | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    bundle_price: 0,
    is_active: true,
    is_featured: false,
    medusa_variant_id: "",
    items: [] as BundleItem[],
    bundle_texts: [] as BundleTextEntry[],
    choice_slots: [] as ChoiceSlot[],
  });

  useEffect(() => {
    fetchBundles();
    fetchProducts();
  }, []);

  const fetchBundles = async () => {
    try {
      const response = await fetch("/admin/bundles", { credentials: "include" });
      const data = await response.json();
      setBundles(data.bundles || []);
    } catch (error) {
      console.error("Error fetching bundles:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const limit = 100;
      let offset = 0;
      let totalCount = Number.MAX_SAFE_INTEGER;
      const dedupedVariants = new Map<string, { id: string; title: string; productTitle: string }>();

      while (offset < totalCount) {
        const query = new URLSearchParams({
          limit: String(limit),
          offset: String(offset),
          fields: "id,title,product_id,product.title",
        });

        const response = await fetch(`/admin/product-variants?${query.toString()}`, {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch variants (${response.status})`);
        }

        const data = await response.json();
        const variants = data?.variants || [];
        totalCount = Number(data?.count || 0);

        for (const variant of variants) {
          if (!variant?.id) continue;
          const productTitle = variant?.product?.title || "Unknown Product";
          const variantTitle = variant?.title || productTitle || "Untitled Variant";

          dedupedVariants.set(variant.id, {
            id: variant.id,
            title: variantTitle,
            productTitle,
          });
        }

        if (variants.length === 0) {
          break;
        }

        offset += limit;
      }

      const allVariants = Array.from(dedupedVariants.values());
      console.log("All variants:", allVariants);
      setProducts(allVariants);
    } catch (error) {
      console.error("Error fetching products:", error);
      setProducts([]);
    }
  };

  const handleOpenCreate = () => {
    if (products.length === 0) {
      fetchProducts();
    }
    setEditingBundle(null);
    setFormData({
      title: "",
      description: "",
      bundle_price: 0,
      is_active: true,
      is_featured: false,
      medusa_variant_id: "",
      items: [],
      bundle_texts: [],
      choice_slots: [],
    });
    setShowForm(true);
  };

  const handleOpenEdit = (bundle: Bundle) => {
    setEditingBundle(bundle);
    setFormData({
      title: bundle.title,
      description: bundle.description || "",
      bundle_price: bundle.bundle_price,
      is_active: bundle.is_active,
      is_featured: bundle.is_featured || false,
      medusa_variant_id: bundle.medusa_variant_id || "",
      items: bundle.items?.map((item: any) => ({
        medusa_variant_id: item.medusa_variant_id,
        quantity: item.quantity,
        sort_order: item.sort_order,
      })) || [],
      bundle_texts: bundle.bundle_texts?.map((entry: any) => ({
        text: entry.text || "",
        sort_order: entry.sort_order ?? 0,
      })) || [],
      choice_slots: bundle.choice_slots?.map((slot: any) => ({
        slot_name: slot.slot_name,
        slot_description: slot.slot_description || "",
        required: slot.required,
        min_selections: slot.min_selections,
        max_selections: slot.max_selections,
        sort_order: slot.sort_order,
        options: slot.options?.map((opt: any) => ({
          medusa_variant_id: opt.medusa_variant_id,
          quantity: opt.quantity,
          sort_order: opt.sort_order,
        })) || [],
      })) || [],
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this bundle?")) return;
    try {
      const response = await fetch(`/admin/bundles/${id}`, { method: "DELETE", credentials: "include" });

      if (!response.ok) {
        let message = "Failed to delete bundle";
        try {
          const error = await response.json();
          message = error?.message || message;
        } catch {}
        alert(message);
        return;
      }

      fetchBundles();
    } catch (error) {
      console.error("Error deleting bundle:", error);
      alert("Error deleting bundle");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingBundle ? `/admin/bundles/${editingBundle.id}` : "/admin/bundles";
    const method = editingBundle ? "PATCH" : "POST";
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(formData),
      });
      
      if (!response.ok) {
        const error = await response.json();
        alert("Error: " + (error.message || JSON.stringify(error)));
        return;
      }
      
      setShowForm(false);
      fetchBundles();
    } catch (error) {
      console.error("Error saving bundle:", error);
      alert("Error saving bundle: " + error);
    }
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { medusa_variant_id: "", quantity: 1, sort_order: formData.items.length }],
    });
  };

  const removeItem = (index: number) => {
    setFormData({ ...formData, items: formData.items.filter((_, i) => i !== index) });
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...formData.items];
    (newItems[index] as any)[field] = value;
    setFormData({ ...formData, items: newItems });
  };

  const addChoiceSlot = () => {
    setFormData({
      ...formData,
      choice_slots: [...formData.choice_slots, {
        slot_name: "",
        slot_description: "",
        required: true,
        min_selections: 1,
        max_selections: 1,
        sort_order: formData.choice_slots.length,
        options: [],
      }],
    });
  };

  const addBundleText = () => {
    setFormData({
      ...formData,
      bundle_texts: [...formData.bundle_texts, { text: "", sort_order: formData.bundle_texts.length }],
    });
  };

  const updateBundleText = (index: number, value: string) => {
    const newTexts = [...formData.bundle_texts];
    newTexts[index] = { ...newTexts[index], text: value };
    setFormData({ ...formData, bundle_texts: newTexts });
  };

  const removeBundleText = (index: number) => {
    const newTexts = formData.bundle_texts
      .filter((_, i) => i !== index)
      .map((entry, i) => ({ ...entry, sort_order: i }));
    setFormData({ ...formData, bundle_texts: newTexts });
  };

  const removeChoiceSlot = (index: number) => {
    setFormData({ ...formData, choice_slots: formData.choice_slots.filter((_, i) => i !== index) });
  };

  const updateChoiceSlot = (index: number, field: string, value: any) => {
    const newSlots = [...formData.choice_slots];
    (newSlots[index] as any)[field] = value;
    setFormData({ ...formData, choice_slots: newSlots });
  };

  const addOptionToSlot = (slotIndex: number) => {
    const newSlots = [...formData.choice_slots];
    newSlots[slotIndex].options = [...(newSlots[slotIndex].options || []), { medusa_variant_id: "", quantity: 1, sort_order: 0 }];
    setFormData({ ...formData, choice_slots: newSlots });
  };

  const updateOption = (slotIndex: number, optionIndex: number, field: string, value: any) => {
    const newSlots = [...formData.choice_slots];
    (newSlots[slotIndex].options as any)[optionIndex][field] = value;
    setFormData({ ...formData, choice_slots: newSlots });
  };

  const removeOption = (slotIndex: number, optionIndex: number) => {
    const newSlots = [...formData.choice_slots];
    newSlots[slotIndex].options = newSlots[slotIndex].options?.filter((_: any, i: number) => i !== optionIndex);
    setFormData({ ...formData, choice_slots: newSlots });
  };

  if (loading) return <Container><Text>Loading...</Text></Container>;

  return (
    <Container>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <Heading level="h1">Product Bundles</Heading>
          <Text>Manage your product bundles with fixed and choice items</Text>
        </div>
        <Button onClick={handleOpenCreate}>
          <Plus /> Create Bundle
        </Button>
      </div>

      {bundles.length === 0 ? (
        <Container>
          <Text>No bundles yet. Create your first bundle to get started.</Text>
        </Container>
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
                  <div style={{ display: "flex", gap: "8px" }}>
                    <Button variant="secondary" onClick={() => handleOpenEdit(bundle)}>
                      <Pencil /> Edit
                    </Button>
                    <Button variant="secondary" onClick={() => handleDelete(bundle.id)}>
                      <Trash />
                    </Button>
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}

      {showForm && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, padding: "20px"
        }}>
          <div style={{
            backgroundColor: "#1a1a1a", borderRadius: "8px", padding: "32px",
            maxWidth: "800px", width: "100%", maxHeight: "90vh", overflowY: "auto",
            border: "1px solid #404040"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <Heading level="h2">{editingBundle ? "Edit Bundle" : "Create Bundle"}</Heading>
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                <span style={{ fontSize: "18px", cursor: "pointer" }}>×</span>
              </Button>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div>
                  <Label style={{ display: "block", marginBottom: "8px", color: "#e5e5e5" }}>Title *</Label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g., Summer Skincare Set"
                    required
                    style={{ width: "100%", backgroundColor: "#2a2a2a", color: "#ffffff", borderColor: "#404040" }}
                  />
                </div>

                <div>
                  <Label style={{ display: "block", marginBottom: "8px", color: "#e5e5e5" }}>Description</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe your bundle..."
                    style={{ width: "100%", backgroundColor: "#2a2a2a", color: "#ffffff", borderColor: "#404040" }}
                  />
                </div>

                <div>
                  <Label style={{ display: "block", marginBottom: "8px", color: "#e5e5e5" }}>Bundle Price (₹) *</Label>
                  <Input
                    type="number"
                    value={formData.bundle_price || ""}
                    onChange={(e) => setFormData({ ...formData, bundle_price: Number(e.target.value) || 0 })}
                    placeholder="0"
                    required
                    style={{ width: "200px", backgroundColor: "#2a2a2a", color: "#ffffff", borderColor: "#404040" }}
                  />
                </div>

                <div>
                  <Label style={{ display: "block", marginBottom: "8px", color: "#e5e5e5" }}>Linked Product Variant *</Label>
                  <select
                    value={formData.medusa_variant_id}
                    onChange={(e) => setFormData({ ...formData, medusa_variant_id: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      backgroundColor: "#2a2a2a",
                      color: "#ffffff",
                      border: "1px solid #404040",
                      borderRadius: "6px",
                      fontSize: "14px"
                    }}
                    required
                  >
                    <option value="" style={{ color: "#888" }}>Select a product variant...</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id} style={{ color: "#fff", backgroundColor: "#2a2a2a" }}>
                        {product.productTitle} - {product.title}
                      </option>
                    ))}
                  </select>
                  <Text size="small" style={{ color: "#888", marginTop: "4px" }}>
                    This variant will be used when adding the bundle to cart
                  </Text>
                </div>

                <div style={{ display: "flex", gap: "24px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: "#e5e5e5" }}>
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    />
                    <Text style={{ color: "#e5e5e5" }}>Active (visible in store)</Text>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: "#e5e5e5" }}>
                    <input
                      type="checkbox"
                      checked={formData.is_featured}
                      onChange={(e) => setFormData({ ...formData, is_featured: e.target.checked })}
                    />
                    <Text style={{ color: "#e5e5e5" }}>Featured (show on homepage)</Text>
                  </label>
                </div>

                <hr style={{ border: "none", borderTop: "1px solid #404040" }} />

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <Heading level="h3">Fixed Items (always included)</Heading>
                    <Button type="button" variant="secondary" onClick={() => { if (products.length === 0) fetchProducts(); addItem(); }}>
                      <Plus /> Add Item
                    </Button>
                  </div>
                  
                  {products.length === 0 ? (
                    <Text style={{ color: "#ff6b6b" }}>
                      No products/variants found. Please create products in Medusa first.
                    </Text>
                  ) : formData.items.length === 0 ? (
                    <Text style={{ color: "#888" }}>
                      No fixed items. Click "Add Item" to add products that are always included.
                    </Text>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {formData.items.map((item, index) => (
                        <div key={index} style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                          <div style={{ flex: 1 }}>
                            <select
                              value={item.medusa_variant_id}
                              onChange={(e) => updateItem(index, "medusa_variant_id", e.target.value)}
                              style={{
                                width: "100%",
                                padding: "8px 12px",
                                backgroundColor: "#2a2a2a",
                                color: "#ffffff",
                                border: "1px solid #404040",
                                borderRadius: "6px",
                                fontSize: "14px"
                              }}
                            >
                              <option value="" style={{ color: "#888" }}>Select a variant...</option>
                              {products.map((product) => (
                                <option key={product.id} value={product.id} style={{ color: "#fff", backgroundColor: "#2a2a2a" }}>
                                  {product.productTitle} - {product.title}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div style={{ width: "100px" }}>
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateItem(index, "quantity", Number(e.target.value))}
                              placeholder="Qty"
                              style={{ backgroundColor: "#2a2a2a", color: "#ffffff", borderColor: "#404040" }}
                            />
                          </div>
                          <Button type="button" variant="secondary" onClick={() => removeItem(index)}>
                            <span style={{ fontSize: "18px", cursor: "pointer" }}>×</span>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <hr style={{ border: "none", borderTop: "1px solid #404040" }} />

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <Heading level="h3">Bundle Texts (display-only)</Heading>
                    <Button type="button" variant="secondary" onClick={addBundleText}>
                      <Plus /> Add Text
                    </Button>
                  </div>
                  {formData.bundle_texts.length === 0 ? (
                    <Text style={{ color: "#888" }}>
                      No bundle texts added. Add display text entries for storefront UI.
                    </Text>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {formData.bundle_texts.map((entry, index) => (
                        <div key={index} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                          <div style={{ flex: 1 }}>
                            <Textarea
                              value={entry.text}
                              onChange={(e) => updateBundleText(index, e.target.value.slice(0, 300))}
                              placeholder="Enter bundle display text..."
                              style={{ width: "100%", backgroundColor: "#2a2a2a", color: "#ffffff", borderColor: "#404040" }}
                            />
                            <Text size="small" style={{ color: "#888", marginTop: "4px" }}>
                              {entry.text.length}/300
                            </Text>
                          </div>
                          <Button type="button" variant="secondary" onClick={() => removeBundleText(index)}>
                            <span style={{ fontSize: "18px", cursor: "pointer" }}>×</span>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <hr style={{ border: "none", borderTop: "1px solid #404040" }} />

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <Heading level="h3">Choice Slots (optional selections)</Heading>
                    <Button type="button" variant="secondary" onClick={() => { if (products.length === 0) fetchProducts(); addChoiceSlot(); }}>
                      <Plus /> Add Slot
                    </Button>
                  </div>
                  
                  {products.length === 0 ? (
                    <Text style={{ color: "#ff6b6b" }}>
                      No products/variants found. Please create products in Medusa first.
                    </Text>
                  ) : formData.choice_slots.length === 0 ? (
                    <Text style={{ color: "#888" }}>
                      No choice slots. Add a slot if you want customers to pick from options.
                    </Text>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      {formData.choice_slots.map((slot, slotIndex) => (
                        <div key={slotIndex} style={{ 
                          border: "2px solid #0066cc", borderRadius: "8px", padding: "16px",
                          backgroundColor: "#2a2a2a"
                        }}>
                          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
                            <Input
                              value={slot.slot_name}
                              onChange={(e) => updateChoiceSlot(slotIndex, "slot_name", e.target.value)}
                              placeholder="Slot name (e.g., Choose your free sample)"
                              style={{ flex: 1, backgroundColor: "#2a2a2a", color: "#ffffff", borderColor: "#404040" }}
                            />
                            <Button type="button" variant="secondary" onClick={() => removeChoiceSlot(slotIndex)}>
                              <span style={{ fontSize: "18px", cursor: "pointer" }}>×</span>
                            </Button>
                          </div>
                          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
                            <Input
                              value={slot.slot_description || ""}
                              onChange={(e) => updateChoiceSlot(slotIndex, "slot_description", e.target.value)}
                              placeholder="Description (optional)"
                              style={{ flex: 1, backgroundColor: "#2a2a2a", color: "#ffffff", borderColor: "#404040" }}
                            />
                            <Input
                              type="number"
                              min="1"
                              value={slot.min_selections}
                              onChange={(e) => updateChoiceSlot(slotIndex, "min_selections", Number(e.target.value))}
                              placeholder="Min"
                              style={{ width: "80px", backgroundColor: "#2a2a2a", color: "#ffffff", borderColor: "#404040" }}
                            />
                            <Input
                              type="number"
                              min="1"
                              value={slot.max_selections}
                              onChange={(e) => updateChoiceSlot(slotIndex, "max_selections", Number(e.target.value))}
                              placeholder="Max"
                              style={{ width: "80px", backgroundColor: "#2a2a2a", color: "#ffffff", borderColor: "#404040" }}
                            />
                          </div>
                          
                          <div style={{ marginLeft: "16px", paddingLeft: "16px", borderLeft: "2px solid #0066cc" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                              <Text style={{ fontWeight: "500", color: "#e5e5e5" }}>Options (products to choose from)</Text>
                              <Button type="button" variant="secondary" onClick={() => addOptionToSlot(slotIndex)}>
                                <Plus /> Add Option
                              </Button>
                            </div>
                            {slot.options?.map((option, optIndex) => (
                              <div key={optIndex} style={{ display: "flex", gap: "12px", marginBottom: "8px" }}>
                                <div style={{ flex: 1 }}>
                                  <select
                                    value={option.medusa_variant_id}
                                    onChange={(e) => updateOption(slotIndex, optIndex, "medusa_variant_id", e.target.value)}
                                    style={{
                                      width: "100%",
                                      padding: "8px 12px",
                                      backgroundColor: "#2a2a2a",
                                      color: "#ffffff",
                                      border: "1px solid #404040",
                                      borderRadius: "6px",
                                      fontSize: "14px"
                                    }}
                                  >
                                    <option value="" style={{ color: "#888" }}>Select a variant...</option>
                                    {products.map((product) => (
                                      <option key={product.id} value={product.id} style={{ color: "#fff", backgroundColor: "#2a2a2a" }}>
                                        {product.productTitle} - {product.title}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <Input
                                  type="number"
                                  min="1"
                                  value={option.quantity}
                                  onChange={(e) => updateOption(slotIndex, optIndex, "quantity", Number(e.target.value))}
                                  placeholder="Qty"
                                  style={{ width: "80px", backgroundColor: "#2a2a2a", color: "#ffffff", borderColor: "#404040" }}
                                />
                                <Button type="button" variant="secondary" onClick={() => removeOption(slotIndex, optIndex)}>
                                  <span style={{ fontSize: "18px", cursor: "pointer" }}>×</span>
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px", paddingTop: "16px", borderTop: "1px solid #404040" }}>
                <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingBundle ? "Update Bundle" : "Create Bundle"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Container>
  );
};

export const config = defineRouteConfig({
  label: "Bundles",
});

export default BundlesPage;
