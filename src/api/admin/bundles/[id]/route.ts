import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { PRODUCT_BUNDLE_MODULE } from "../../../../modules/product-bundle";
import ProductBundleService from "../../../../modules/product-bundle/service";
import { z } from "zod";

const updateBundleSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  medusa_product_id: z.string().optional(),
  medusa_variant_id: z.string().optional(),
  bundle_price: z.number().optional(),
  bundle_image: z.string().optional(),
  is_active: z.boolean().optional(),
  is_featured: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
  items: z
    .array(
      z.object({
        medusa_variant_id: z.string(),
        quantity: z.number().default(1),
        sort_order: z.number().optional(),
      })
    )
    .optional(),
  choice_slots: z
    .array(
      z.object({
        slot_name: z.string(),
        slot_description: z.string().optional(),
        required: z.boolean().default(true),
        min_selections: z.number().default(1),
        max_selections: z.number().default(1),
        sort_order: z.number().optional(),
        options: z.array(
          z.object({
            medusa_variant_id: z.string(),
            quantity: z.number().default(1),
            sort_order: z.number().optional(),
          })
        ),
      })
    )
    .optional(),
});

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const productBundleService: ProductBundleService = req.scope.resolve(
    PRODUCT_BUNDLE_MODULE
  );

  const { id } = req.params;
  const bundle = await productBundleService.getBundleWithDetails(id);
  
  if (!bundle) {
    res.status(404).json({ message: "Bundle not found" });
    return;
  }
  
  res.json({ bundle });
}

export async function PATCH(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const productBundleService: ProductBundleService = req.scope.resolve(
    PRODUCT_BUNDLE_MODULE
  );

  const { id } = req.params;
  const validatedData = updateBundleSchema.parse(req.body);

  const bundle = await productBundleService.updateBundle(id, validatedData);

  res.json({ bundle });
}

export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const productBundleService: ProductBundleService = req.scope.resolve(
    PRODUCT_BUNDLE_MODULE
  );

  const { id } = req.params;
  await productBundleService.deleteBundles(id);

  res.status(200).json({ message: "Bundle deleted successfully" });
}
