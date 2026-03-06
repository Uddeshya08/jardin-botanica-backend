import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CUSTOMER_PREFERENCES_MODULE } from "../../../../../modules/customer-preferences"
import CustomerPreferencesService from "../../../../../modules/customer-preferences/service"
import { z } from "zod"

const customerPreferencesSchema = z.object({
    email_updates: z.boolean().optional(),
    newsletter: z.boolean().optional(),
})

export const GET = async (
    req: AuthenticatedMedusaRequest,
    res: MedusaResponse
) => {
    const customerId = req.auth_context?.actor_id

    if (!customerId) {
        return res.status(401).json({
            message: "Not authenticated",
        })
    }

    const customerPreferencesModuleService = req.scope.resolve(
        CUSTOMER_PREFERENCES_MODULE
    ) as CustomerPreferencesService

    const [preferences] = await customerPreferencesModuleService.listPreferences({
        customer_id: customerId,
    })

    // If no preferences exist, return defaults
    if (!preferences) {
        return res.json({
            preference: {
                customer_id: customerId,
                email_updates: false,
                newsletter: false,
            }
        })
    }

    res.json({ preference: preferences })
}

export const POST = async (
    req: AuthenticatedMedusaRequest,
    res: MedusaResponse
) => {
    const customerId = req.auth_context?.actor_id

    if (!customerId) {
        return res.status(401).json({
            message: "Not authenticated",
        })
    }

    const validationResult = customerPreferencesSchema.safeParse(req.body)

    if (!validationResult.success) {
        return res.status(400).json({
            message: "Invalid request body",
            errors: validationResult.error.flatten(),
        })
    }

    const { email_updates, newsletter } = validationResult.data

    const customerPreferencesModuleService = req.scope.resolve(
        CUSTOMER_PREFERENCES_MODULE
    ) as CustomerPreferencesService

    const [existingPreference] = await customerPreferencesModuleService.listPreferences({
        customer_id: customerId,
    })

    let preference
    if (existingPreference) {
        preference = await customerPreferencesModuleService.updatePreferences({
            id: existingPreference.id,
            email_updates: email_updates ?? existingPreference.email_updates,
            newsletter: newsletter ?? existingPreference.newsletter,
        })
    } else {
        preference = await customerPreferencesModuleService.createPreferences({
            customer_id: customerId,
            email_updates: email_updates ?? false,
            newsletter: newsletter ?? false,
        })
    }

    res.json({ preference })
}
