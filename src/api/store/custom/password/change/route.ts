import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"

type PasswordChangeRequestBody = {
  current_password: string
  new_password: string
}

export async function POST(
  req: AuthenticatedMedusaRequest<PasswordChangeRequestBody>,
  res: MedusaResponse
): Promise<void> {
  try {
    const { current_password, new_password } = req.body

    if (!current_password || !new_password) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Current password and new password are required"
      )
    }

    if (new_password.length < 8) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "New password must be at least 8 characters long"
      )
    }

    const customerId = req.auth_context?.actor_id

    if (!customerId) {
      throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Not authenticated")
    }

    const query = req.scope.resolve("query")

    const {
      data: [customer],
    } = await query.graph(
      {
        entity: "customer",
        fields: ["id", "email"],
        filters: {
          id: customerId,
        },
      },
      {
        throwIfKeyNotFound: true,
      }
    )

    if (!customer) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Customer not found")
    }

    if (!customer.email) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Customer email not found")
    }

    const authModuleService = req.scope.resolve(Modules.AUTH)

    const { success } = await authModuleService.authenticate("emailpass", {
      body: {
        email: customer.email,
        password: current_password,
      },
    })

    if (!success) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Current password is incorrect")
    }

    const providerIdentities = await authModuleService.listProviderIdentities({
      entity_id: customer.email,
      provider: "emailpass",
    })

    if (providerIdentities && providerIdentities.length > 0) {
      const identityIds = providerIdentities.map((identity) => identity.id)
      await authModuleService.deleteProviderIdentities(identityIds)
      console.log(`🗑️  Deleted ${identityIds.length} old provider identities`)
    }

    const authResponse = await authModuleService.register("emailpass", {
      body: {
        email: customer.email,
        password: new_password,
      },
    })

    console.log("📝 Auth registration response:", authResponse)

    if (!authResponse.success || !authResponse.authIdentity) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        authResponse.error || "Failed to register new credentials"
      )
    }

    try {
      const authIdentities = await authModuleService.listAuthIdentities({})

      if (!authIdentities || authIdentities.length === 0 || !authResponse.authIdentity?.id) {
        throw new Error("No auth identities found")
      }

      const authIdentity = authIdentities.find(
        (identity: any) => identity.id === authResponse.authIdentity?.id
      )

      if (authIdentity) {
        await authModuleService.updateAuthIdentities({
          id: authIdentity.id,
          app_metadata: {
            customer_id: customerId,
          },
        })

        console.log(`✅ Auth identity linked with customer_id in app_metadata`)
      } else {
        console.warn(`⚠️  No auth identity found for ID: ${authResponse.authIdentity.id}`)
      }
    } catch (authError: any) {
      console.error(`❌ Error linking auth identity:`, authError?.message || authError)
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Failed to link auth identity with customer"
      )
    }

    console.log(`✅ Password changed successfully for customer: ${customerId}`)

    res.status(200).json({
      success: true,
      message: "Password updated successfully",
    })
  } catch (error: any) {
    console.error("Password change error:", error)
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to update password",
      type: error.type || "UNKNOWN_ERROR",
    })
  }
}
