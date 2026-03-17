import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { PRODUCT_BUNDLE_MODULE } from "../../../../../modules/product-bundle";
import ProductBundleService from "../../../../../modules/product-bundle/service";
import { Modules } from "@medusajs/framework/utils";
import type { IProductModuleService } from "@medusajs/framework/types";
import { z } from "zod";

const addToCartSchema = z.object({
  cart_id: z.string(),
  quantity: z.number().min(1).default(1),
  selections: z.record(z.array(z.string())).optional(),
  personalized_note: z.string().max(500).optional(),
});

type VariantDisplayDetails = {
  variant_id: string;
  product_title?: string;
  variant_title?: string;
  variant_display_title?: string;
  quantity: number;
};

const getVariantDisplayTitle = (variant: {
  title?: string | null;
  product?: { title?: string | null } | null;
  options?: Array<{ option?: { title?: string | null } | null; value?: string | null }>;
}) => {
  const optionText = (variant.options || [])
    .map((optionValue) => {
      const optionTitle = optionValue.option?.title?.trim();
      const value = optionValue.value?.trim();

      if (optionTitle && value) {
        return `${optionTitle}: ${value}`;
      }

      return value || optionTitle || null;
    })
    .filter(Boolean)
    .join(", ");

  if (optionText) {
    return optionText;
  }

  if (variant.title && variant.product?.title && variant.title !== variant.product.title) {
    return variant.title;
  }

  return undefined;
};

const buildVariantLookup = async (
  productModuleService: IProductModuleService,
  variantIds: string[]
) => {
  const uniqueVariantIds = Array.from(new Set(variantIds.filter(Boolean)));

  if (uniqueVariantIds.length === 0) {
    return new Map<string, VariantDisplayDetails>();
  }

  const [variants] = await productModuleService.listAndCountProductVariants(
    { id: uniqueVariantIds },
    {
      relations: ["product", "options", "options.option"],
    }
  );

  return new Map(
    variants.map((variant) => [
      variant.id,
      {
        variant_id: variant.id,
        product_title: variant.product?.title || undefined,
        variant_title: variant.title || undefined,
        variant_display_title: getVariantDisplayTitle(variant),
        quantity: 1,
      },
    ])
  );
};

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

  const productModuleService: IProductModuleService = req.scope.resolve(Modules.PRODUCT);
  const choiceSlots = bundle.choice_slots || [];
  const selectedChoiceItems = Object.entries(selections).flatMap(([slotId, optionIds]: [string, any]) => {
    const slot = choiceSlots.find((choiceSlot: any) => choiceSlot.id === slotId || choiceSlot.slot_name === slotId);

    return (slot?.options || [])
      .filter((opt: any) => optionIds?.includes(opt.id))
      .map((opt: any) => ({
        slot_id: slot?.id,
        slot_name: slot?.slot_name,
        slot_description: slot?.slot_description,
        option_id: opt.id,
        variant_id: opt.medusa_variant_id,
        quantity: opt.quantity,
      }));
  });

  let variantDisplayLookup = new Map<string, VariantDisplayDetails>();

  try {
    variantDisplayLookup = await buildVariantLookup(
      productModuleService,
      [
        ...(bundle.items?.map((bundleItem: any) => bundleItem.medusa_variant_id) || []),
        ...selectedChoiceItems.map((choiceItem) => choiceItem.variant_id),
      ]
    );
  } catch (error: any) {
    console.error("[Bundle Add to Cart] Error building variant display metadata:", error.message);
  }

  const bundleMetadata: Record<string, unknown> = {
    _bundle_id: bundleId,
    _bundle_title: bundle.title,
    _bundle_price: bundle.bundle_price,
    _bundle_selections: selections,
    _bundle_items: bundle.items?.map((item: any) => {
      const variantDetails = variantDisplayLookup.get(item.medusa_variant_id);

      return {
        variant_id: item.medusa_variant_id,
        quantity: item.quantity,
        product_title: variantDetails?.product_title,
        variant_title: variantDetails?.variant_title,
        variant_display_title: variantDetails?.variant_display_title,
      };
    }) || [],
    _bundle_choice_items: selectedChoiceItems.map((choiceItem) => {
      const variantDetails = variantDisplayLookup.get(choiceItem.variant_id);

      return {
        slot_id: choiceItem.slot_id,
        slot_name: choiceItem.slot_name,
        slot_description: choiceItem.slot_description,
        option_id: choiceItem.option_id,
        variant_id: choiceItem.variant_id,
        quantity: choiceItem.quantity,
        product_title: variantDetails?.product_title,
        variant_title: variantDetails?.variant_title,
        variant_display_title: variantDetails?.variant_display_title,
      };
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
