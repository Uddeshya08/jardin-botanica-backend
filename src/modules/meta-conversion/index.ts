import { Module } from "@medusajs/framework/utils";
import MetaConversionService from "./service";

export const META_CONVERSION_MODULE = "metaConversion";
export default Module(META_CONVERSION_MODULE, { service: MetaConversionService });
