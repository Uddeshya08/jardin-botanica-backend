import CustomerPreferencesService from "./service"
import { Module } from "@medusajs/framework/utils"

export const CUSTOMER_PREFERENCES_MODULE = "customerPreferencesModule"

export default Module(CUSTOMER_PREFERENCES_MODULE, {
    service: CustomerPreferencesService,
})
