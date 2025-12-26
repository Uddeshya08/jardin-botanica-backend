import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { sendPasswordResetEmail } from "../services/email.service"

/**
 * Subscriber to handle password reset token generation
 * Sends an email with reset link when a customer requests password reset
 */
export default async function passwordResetHandler({
  event: { data },
  container,
}: SubscriberArgs<{
  entity_id: string
  actor_type: string
  token: string
  provider: string
}>) {
  try {
    console.log("🔐 Password reset requested")
    console.log("Event data:", JSON.stringify(data, null, 2))

    const { entity_id, token } = data

    // entity_id is the email address, not the customer ID
    const email = entity_id

    // Get services
    const customerModuleService = container.resolve(Modules.CUSTOMER)
    const authModuleService = container.resolve(Modules.AUTH)

    // Retrieve customer details by email
    let customers = await customerModuleService.listCustomers({
      email: email,
    })

    let customer;
    
    if (!customers || customers.length === 0) {
      console.warn(`⚠️  Customer not found for email: ${email}`)
      console.log(`📝 Creating customer entry for: ${email}`)
      
      // Create customer if doesn't exist (for password reset flow)
      customer = await customerModuleService.createCustomers({
        email: email,
        has_account: true,
      })
      
      console.log(`✅ Customer created with ID: ${customer.id}`)
    } else {
      customer = customers[0]
    }

    // Link auth identity with customer by updating app_metadata
    console.log(`🔗 Linking auth identity to customer ID: ${customer.id}`)
    
    try {
      // List all emailpass auth identities and find the one for this email
      const authIdentities = await authModuleService.listAuthIdentities({})
      
      // Find the auth identity for this email
      const authIdentity = authIdentities.find((identity: any) => 
        (identity.provider === "emailpass" && identity.entity_id === email)
      )
      
      if (authIdentity) {
        await authModuleService.updateAuthIdentities({
          id: authIdentity.id,
          app_metadata: {
            customer_id: customer.id,
          },
        })
        
        console.log(`✅ Auth identity linked with customer_id in app_metadata`)
      } else {
        console.warn(`⚠️  No auth identity found for email: ${email}`)
      }
    } catch (authError: any) {
      console.error(`❌ Error linking auth identity:`, authError?.message || authError)
      // Don't fail the whole process if linking fails
    }

    const customerName = customer.first_name || customer.last_name 
      ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim()
      : "Customer"

    console.log(`📧 Sending password reset email to: ${customer.email}`)
    console.log(`👤 Customer name: ${customerName}`)
    console.log(`🔑 Reset token: ${token.substring(0, 10)}...`)

    // Send password reset email
    await sendPasswordResetEmail(customer.email, token, customerName)

    console.log("✅ Password reset email sent successfully")
  } catch (error: any) {
    console.error("❌ Error in password reset handler:", error)
    console.error("Error details:", error?.message || error)
    // Don't throw - we don't want to fail the reset request if email fails
  }
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
}

