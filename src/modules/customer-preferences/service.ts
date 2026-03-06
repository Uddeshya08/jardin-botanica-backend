import { MedusaService } from "@medusajs/framework/utils"
import Preference from "./models/preference"

export default class CustomerPreferencesService extends MedusaService({
    Preference,
}) { }
