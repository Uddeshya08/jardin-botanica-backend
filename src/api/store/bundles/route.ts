import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { PRODUCT_BUNDLE_MODULE } from "../../../modules/product-bundle";
import ProductBundleService from "../../../modules/product-bundle/service";
import { z } from "zod";

const validateSelectionsSchema = z.record(z.array(z.string()));

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const productBundleService: ProductBundleService = req.scope.resolve(
    PRODUCT_BUNDLE_MODULE
  );

  const { id } = req.params;

  if (id) {
    const bundle = await productBundleService.getBundleWithDetails(id);
    if (!bundle || !bundle.is_active) {
      res.status(404).json({ message: "Bundle not found" });
      return;
    }
    res.json({ bundle });
    return;
  }

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

  const { action } = req.query;

  if (action === "validate") {
    const body = req.body as { bundle_id: string; selections: Record<string, string[]> };
    const { bundle_id, selections } = body;
    const validatedData = validateSelectionsSchema.parse(selections);

    const result = await productBundleService.validateBundleSelections(
      bundle_id,
      validatedData
    );

    res.json(result);
    return;
  }

  res.status(400).json({ message: "Invalid action" });
}
