import { MedusaService } from "@medusajs/framework/utils";
import { MetaConversionEvent } from "./models/meta-conversion-event";
import { MetaBrowserEvent } from "./models/meta-browser-event";

export default class MetaConversionService extends MedusaService({ MetaConversionEvent, MetaBrowserEvent }) {}
