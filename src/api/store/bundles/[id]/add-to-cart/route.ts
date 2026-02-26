import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { PRODUCT_BUNDLE_MODULE } from "../../../../../modules/product-bundle";
import ProductBundleService from "../../../../../modules/product-bundle/service";
import { Modules } from "@medusajs/framework/utils";
import { z } from "zod";

const addToCartSchema = z.object({
  cart_id: z.string(),
  quantity: z.number().min(1).default(1),
  selections: z.record(z.array(z.string())).optional(),
  personalized_note: z.string().max(500).optional(),
});

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  console.log("[Bundle Add to Cart] Request body:", req.body);
  
  const productBundleService: ProductBundleService = req.scope.resolve(
    PRODUCT_BUNDLE_MODULE
  );

  const { id: bundleId } = req.params;
  console.log("[Bundle Add to Cart] Bundle ID:", bundleId);

  let validatedData;
  try {
    validatedData = addToCartSchema.parse(req.body);
  } catch (e: any) {
    console.error("[Bundle Add to Cart] Validation error:", e.errors);
    res.status(400).json({ message: "Validation error", errors: e.errors });
    return;
  }
  
  const { cart_id, quantity, selections = {}, personalized_note } = validatedData;
  console.log("[Bundle Add to Cart] Parsed data:", { cart_id, quantity, selections, personalized_note });

  const bundle = await productBundleService.getBundleWithDetails(bundleId);
  console.log("[Bundle Add to Cart] Bundle:", bundle);

  if (!bundle) {
    res.status(404).json({ message: "Bundle not found" });
    return;
  }

  if (!bundle.is_active) {
    res.status(400).json({ message: "Bundle is inactive" });
    return;
  }

  if (!bundle.medusa_variant_id) {
    console.error("[Bundle Add to Cart] Bundle has no medusa_variant_id");
    res.status(400).json({ message: "Bundle has no linked product variant" });
    return;
  }

  // Skip validation if no choice slots required
  const hasChoiceSlots = bundle.choice_slots && bundle.choice_slots.length > 0;
  if (hasChoiceSlots) {
    const validation = await productBundleService.validateBundleSelections(bundleId, selections);
    console.log("[Bundle Add to Cart] Validation result:", validation);
    
    if (!validation.valid) {
      res.status(400).json({ message: "Invalid selections", errors: validation.errors });
      return;
    }
  }

  let variantIds: string[] = [];
  let quantities: Record<string, number> = {};

  try {
    const result = await productBundleService.getBundleVariantIds(bundleId, selections);
    variantIds = result.variantIds;
    quantities = result.quantities;
    console.log("[Bundle Add to Cart] Variant IDs:", variantIds);
    console.log("[Bundle Add to Cart] Quantities:", quantities);
  } catch (e: any) {
    console.error("[Bundle Add to Cart] Error getting variant IDs:", e.message);
    res.status(400).json({ message: "Error processing bundle items", error: e.message });
    return;
  }

  // Inventory check - make it optional and graceful
  try {
    const inventoryService = req.scope.resolve(Modules.INVENTORY);
    
    const inventoryItems = await inventoryService.listInventoryItems({}, {});
    console.log("[Bundle Add to Cart] Inventory items count:", inventoryItems.length);

    for (const variantId of variantIds) {
      const requiredQty = (quantities[variantId] || 1) * quantity;
      
      const variantInventoryItem = inventoryItems.find((item: any) => item?.metadata?.variantId === variantId);

      if (!variantInventoryItem) {
        console.log("[Bundle Add to Cart] No inventory item for variant:", variantId, "- skipping inventory check");
        continue;
      }

      const levels = await inventoryService.listInventoryLevels(
        { inventory_item_id: variantInventoryItem.id },
        {}
      );

      const totalAvailable = levels.reduce(
        (sum: number, level: any) => sum + Number(level.available_quantity || 0),
        0
      );

      console.log("[Bundle Add to Cart] Variant:", variantId, "Required:", requiredQty, "Available:", totalAvailable);

      if (totalAvailable < requiredQty) {
        res.status(400).json({ 
          message: `Insufficient inventory`,
          variant_id: variantId,
          required: requiredQty,
          available: totalAvailable
        });
        return;
      }
    }
  } catch (e: any) {
    console.log("[Bundle Add to Cart] Inventory check skipped:", e.message);
  }

  // Cart operations
  const cartModuleService: any = req.scope.resolve(Modules.CART);
  
  let cart;
  try {
    cart = await cartModuleService.retrieveCart(cart_id, {
      relations: ["items"],
    });
    console.log("[Bundle Add to Cart] Cart retrieved:", cart?.id);
  } catch (e: any) {
    console.error("[Bundle Add to Cart] Error retrieving cart:", e.message);
    res.status(404).json({ message: "Cart not found", error: e.message });
    return;
  }

  if (!cart) {
    res.status(404).json({ message: "Cart not found" });
    return;
  }

  const bundleMetadata: Record<string, unknown> = {
    _bundle_id: bundleId,
    _bundle_title: bundle.title,
    _bundle_price: bundle.bundle_price,
    _bundle_selections: selections,
    _bundle_items: bundle.items?.map((item: any) => ({
      variant_id: item.medusa_variant_id,
      quantity: item.quantity,
    })) || [],
    _bundle_choice_items: Object.entries(selections).flatMap(([slotId, optionIds]: [string, any]) => {
      const slot = bundle.choice_slots?.find((s: any) => s.id === slotId);
      return (slot?.options || [])
        .filter((opt: any) => optionIds?.includes(opt.id))
        .map((opt: any) => ({
          variant_id: opt.medusa_variant_id,
          quantity: opt.quantity,
        }));
    }),
  };

  if (personalized_note !== undefined) {
    bundleMetadata._bundle_personalized_note = personalized_note;
  }

  const bundleLineItemData: any = {
    cart_id: cart_id,
    variant_id: bundle.medusa_variant_id,
    title: bundle.title,
    quantity: quantity,
    unit_price: bundle.bundle_price,
    metadata: bundleMetadata,
  };

  console.log("[Bundle Add to Cart] Line item data:", bundleLineItemData);

  const existingItem = cart.items?.find(
    (item: any) => item.variant_id === bundle.medusa_variant_id && 
    item.metadata?._bundle_id === bundleId
  );

  let lineItem;
  try {
    if (existingItem) {
      console.log("[Bundle Add to Cart] Updating existing item:", existingItem.id);
      const updatedMetadata = {
        ...(existingItem.metadata || {}),
        ...bundleMetadata,
      };
      lineItem = await cartModuleService.updateLineItems(existingItem.id, {
        quantity: Number(existingItem.quantity) + quantity,
        metadata: updatedMetadata,
      });
    } else {
      console.log("[Bundle Add to Cart] Creating new line item");
      lineItem = await cartModuleService.addLineItems(bundleLineItemData);
    }
  } catch (e: any) {
    console.error("[Bundle Add to Cart] Error adding to cart:", e.message);
    res.status(400).json({ message: "Error adding to cart", error: e.message });
    return;
  }

  console.log("[Bundle Add to Cart] Success! Line item:", lineItem);

  res.json({ 
    line_item: lineItem,
    message: "Bundle added to cart successfully"
  });
}
