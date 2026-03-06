import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CUSTOMER_PREFERENCES_MODULE } from "../../../../../modules/customer-preferences"

export const GET = async (
    req: AuthenticatedMedusaRequest,
    res: MedusaResponse
) => {
    const customerId = req.auth_context.actor_id

    const customerPreferencesModuleService = req.scope.resolve(
        CUSTOMER_PREFERENCES_MODULE
    )

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
    const customerId = req.auth_context.actor_id
    const { email_updates, newsletter } = req.body as any

    const customerPreferencesModuleService = req.scope.resolve(
        CUSTOMER_PREFERENCES_MODULE
    )

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
