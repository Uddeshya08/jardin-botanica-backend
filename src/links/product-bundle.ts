import ProductBundleModule from "../modules/product-bundle";
import ProductModule from "@medusajs/medusa/product";
import { defineLink } from "@medusajs/framework/utils";

export default defineLink(
  ProductModule.linkable.product,
  ProductBundleModule.linkable.bundle
);
