import { MedusaError, Modules } from "@medusajs/framework/utils";
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import jwt from "jsonwebtoken";
import { sendEmailUpdateVerification } from "../../../../../services/send-email-update-verification";

type EmailUpdateRequestBody = {
  current_password: string;
  new_email: string;
};

export async function POST(
  req: AuthenticatedMedusaRequest<EmailUpdateRequestBody>,
  res: MedusaResponse
): Promise<void> {
  try {
    const { current_password, new_email } = req.body;

    if (!current_password || !new_email) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Current password and new email are required"
      );
    }

    // 1. Get authenticated customer ID from auth context
    const customerId = req.auth_context?.actor_id;

    if (!customerId) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "Not authenticated"
      );
    }

    // 2. Retrieve customer using Query (docs pattern)
    const query = req.scope.resolve("query");

    const {
      data: [customer],
    } = await query.graph(
      {
        entity: "customer",
        fields: ["id", "email", "first_name", "last_name"],
        filters: {
          id: customerId,
        },
      },
      {
        throwIfKeyNotFound: true,
      }
    );

    if (!customer) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Customer not found");
    }

    if (!customer.email) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Customer email not found"
      );
    }

    // 3. Verify current password using Auth Module's authenticate (docs way)
    const authModuleService = req.scope.resolve(Modules.AUTH);

    const { success } = await authModuleService.authenticate("emailpass", {
      // In docs they also pass url, headers, query, protocol, but body is the key part
      body: {
        email: customer.email,
        password: current_password,
      },
    });

    if (!success) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Current password is incorrect"
      );
    }

    // 4. Check if new email already exists (custom, but uses Query correctly)
    const { data: existingCustomers } = await query.graph({
      entity: "customer",
      fields: ["id", "email"],
      filters: {
        email: new_email,
      },
    });

    if (
      existingCustomers.length > 0 &&
      existingCustomers[0].id !== customerId
    ) {
      throw new MedusaError(
        MedusaError.Types.DUPLICATE_ERROR,
        "Email address is already in use"
      );
    }

    // 5. Generate verification token (custom JWT logic)
    const token = jwt.sign(
      {
        customer_id: customerId,
        new_email,
        type: "email_update",
      },
      process.env.JWT_SECRET || "supersecret",
      { expiresIn: "24h" }
    );

    // 6. Create verification URL (front‑end route that will later call updateProvider)
    const verificationUrl = `${process.env.FRONTEND_URL}/auth/verify-email-update?token=${token}`;

    // 7. Prepare customer name
    const customerName =
      `${customer.first_name || ""} ${customer.last_name || ""}`.trim() ||
      "Customer";

    // 8. Send verification email (custom, outside docs)
    await sendEmailUpdateVerification({
      customer_name: customerName,
      verification_url: verificationUrl,
      current_email: customer.email,
      new_email,
    });

    res.status(200).json({
      success: true,
      message: `Verification email sent to ${new_email}`,
    });
  } catch (error: any) {
    console.error("Email update request error:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to send verification email",
      type: error.type || "UNKNOWN_ERROR",
    });
  }
}
