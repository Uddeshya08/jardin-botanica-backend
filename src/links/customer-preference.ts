import CustomerPreferencesModule from "../modules/customer-preferences"
import CustomerModule from "@medusajs/medusa/customer"
import { defineLink } from "@medusajs/framework/utils"

export default defineLink(
    CustomerModule.linkable.customer,
    CustomerPreferencesModule.linkable.preference
)
