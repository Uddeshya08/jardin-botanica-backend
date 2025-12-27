import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import jwt from "jsonwebtoken";

type EmailVerificationRequestBody = {
  token: string;
  new_password: string;
};

export async function POST(
  req: MedusaRequest<EmailVerificationRequestBody>,
  res: MedusaResponse
): Promise<void> {
  try {
    const { token, new_password } = req.body;

    if (!token || !new_password) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Token and new password are required"
      );
    }

    // 1. Verify and decode JWT token
    let decoded: any;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || "supersecret");
    } catch {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Invalid or expired token"
      );
    }

    const { customer_id, new_email } = decoded;
    const query = req.scope.resolve("query");
    console.log("🔄 Email update requested");
    console.log("customer", customer_id, "new_email", new_email);

    // 2. Fetch the customer with current email
    const {
      data: [customer],
    } = await query.graph({
      entity: "customer",
      fields: ["id", "email"],
      filters: { id: customer_id },
    });

    if (!customer) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Customer not found");
    }

    const authModuleService = req.scope.resolve(Modules.AUTH);

    if (!customer.email) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Customer does not have an email"
      );
    }

    // 3. Find and delete the old auth provider identity
    try {
      const providerIdentities = await authModuleService.listProviderIdentities(
        {
          entity_id: customer.email,
          provider: "emailpass",
        }
      );

      if (providerIdentities && providerIdentities.length > 0) {
        const identityIds = providerIdentities.map((identity) => identity.id);
        await authModuleService.deleteProviderIdentities(identityIds);
        console.log(
          `🗑️  Deleted ${identityIds.length} old provider identities`
        );
      }
    } catch (e) {
      console.log("⚠️  Could not delete old provider identities:", e);
    }

    // 4. Register new auth identity with new email and password
    const authResponse = await authModuleService.register("emailpass", {
      body: {
        email: new_email,
        password: new_password,
      },
    });

    console.log("📝 Auth registration response:", authResponse);

    if (!authResponse.success || !authResponse.authIdentity) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        authResponse.error || "Failed to register new credentials"
      );
    }

    // 5. Link auth identity with customer by updating app_metadata
    console.log(`🔗 Linking auth identity to customer ID: ${customer_id}`);

    try {
      // Find the newly created auth identity
      const authIdentities = await authModuleService.listAuthIdentities({});

      if (
        !authIdentities ||
        authIdentities.length === 0 ||
        !authResponse.authIdentity?.id
      ) {
        throw new Error("No auth identities found");
      }

      const authIdentity = authIdentities.find(
        (identity: any) => identity.id === authResponse.authIdentity?.id
      );

      if (authIdentity) {
        await authModuleService.updateAuthIdentities({
          id: authIdentity.id,
          app_metadata: {
            customer_id: customer_id,
          },
        });

        console.log(`✅ Auth identity linked with customer_id in app_metadata`);
      } else {
        console.warn(
          `⚠️  No auth identity found for ID: ${authResponse.authIdentity.id}`
        );
      }
    } catch (authError: any) {
      console.error(
        `❌ Error linking auth identity:`,
        authError?.message || authError
      );
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Failed to link auth identity with customer"
      );
    }

    // 6. Update the Customer record with new email
    const customerModuleService = req.scope.resolve(Modules.CUSTOMER);
    await customerModuleService.updateCustomers(customer_id, {
      email: new_email,
    });

    console.log(`✅ Customer email updated successfully to: ${new_email}`);

    res.status(200).json({
      success: true,
      message:
        "Email and password updated successfully. You can now login with your new email.",
      new_email,
    });
  } catch (error: any) {
    console.error("❌ Error in email verification:", error);
    console.error("Error details:", error?.message || error);
    const statusCode = error.statusCode || 500;
    const message = error.message || "Verification failed";
    res.status(statusCode).json({
      success: false,
      message,
    });
  }
}
