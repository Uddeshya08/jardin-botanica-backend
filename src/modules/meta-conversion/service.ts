import { MedusaService } from "@medusajs/framework/utils";
import { MetaConversionEvent } from "./models/meta-conversion-event";

export default class MetaConversionService extends MedusaService({ MetaConversionEvent }) {}
