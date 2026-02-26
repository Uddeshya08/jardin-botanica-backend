import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { PRODUCT_BUNDLE_MODULE } from "../../../modules/product-bundle";
import ProductBundleService from "../../../modules/product-bundle/service";
import { z } from "zod";

const createBundleSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  medusa_product_id: z.string().optional(),
  medusa_variant_id: z.string().optional(),
  bundle_price: z.number(),
  bundle_image: z.string().optional(),
  is_active: z.boolean().default(true),
  is_featured: z.boolean().default(false),
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
  bundle_texts: z
    .array(
      z.object({
        text: z.string().max(300),
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

  const bundles = await productBundleService.listBundlesWithDetails();
  res.json({ bundles });
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const productBundleService: ProductBundleService = req.scope.resolve(
    PRODUCT_BUNDLE_MODULE
  );

  const validatedData = createBundleSchema.parse(req.body);
  const bundle = await productBundleService.createBundle(validatedData);

  res.status(201).json({ bundle });
}
