import ProductBundleService from "./service";
import { Module } from "@medusajs/framework/utils";

export const PRODUCT_BUNDLE_MODULE = "productBundleModule";

export default Module(PRODUCT_BUNDLE_MODULE, {
  service: ProductBundleService,
});
