import { Resend } from "resend";
import { getOrderReference } from "../utils/order-reference";
import { renderOrderConfirmationEmail, type ConfirmationOrder } from "./order-confirmation-template";
import { ORDER_CONFIRMATION_LOGO_BASE64 } from "./order-confirmation-logo";

/**
 * Send separate customer and merchant confirmations. Neither message shares recipients.
 */
export async function sendOrderConfirmationEmail(order: ConfirmationOrder): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set - cannot send order confirmation email");
  const from = process.env.RESEND_FROM_EMAIL || "hello@jardinbotanica.com";
  const customerEmail = order.email?.trim();
  const reference = getOrderReference(order) || order.id;
  const html = renderOrderConfirmationEmail(order);
  const resend = new Resend(apiKey);
  const recipients = [
    ...(customerEmail ? [{ role: "customer", email: customerEmail, subject: "Order Confirmation - " + reference }] : []),
    { role: "merchant", email: "hello@jardinbotanica.com", subject: "New Order - " + reference },
  ];
  if (!customerEmail) console.warn("Customer confirmation skipped: order has no email", { order_id: order.id });

  // Attempt both independently, so one rejected recipient cannot suppress the other.
  const results = await Promise.allSettled(recipients.map(async (recipient) => {
    const result = await resend.emails.send({
      from,
      to: [recipient.email],
      subject: recipient.subject,
      html,
      attachments: [{
        filename: "Jardin_Botanica_Wordmark_Ink.png",
        content: Buffer.from(ORDER_CONFIRMATION_LOGO_BASE64, "base64"),
        contentType: "image/png",
        contentId: "jardin-wordmark",
      }],
    }, { idempotencyKey: "order-confirmation/" + order.id + "/" + recipient.role });
    if (result.error || !result.data?.id) {
      throw new Error("Order confirmation was not accepted for " + recipient.role);
    }
    console.log("Order confirmation accepted by Resend", {
      order_id: order.id, recipient_role: recipient.role, email_id: result.data.id,
    });
  }));
  const failedRoles = results.flatMap((result, index) => result.status === "rejected" ? [recipients[index].role] : []);
  if (failedRoles.length) {
    console.error("Order confirmation delivery attempt failed", { order_id: order.id, recipient_roles: failedRoles });
    throw new Error("Order confirmation failed for: " + failedRoles.join(", "));
  }
}

/**
 * Generate password reset email HTML template
 */
function generatePasswordResetEmailTemplate(customerName: string, resetUrl: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Your Password</title>
    </head>
    <body style="font-family: 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 0;">
        <!-- Header -->
        <div style="background-color: #2c3e50; padding: 30px 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Password Reset Request</h1>
        </div>
        
        <!-- Content -->
        <div style="padding: 30px 20px;">
          <p style="font-size: 16px; margin-bottom: 10px;">Dear ${customerName},</p>
          <p style="font-size: 16px; color: #666; margin-bottom: 20px;">We received a request to reset your password for your Jardin Botanica account. </br>You can set a new password using the link below.</p>
          
          <!-- Reset Button -->
          <div style="text-align: center; margin: 40px 0;">
            <a href="${resetUrl}" style="display: inline-block; background-color: #2c3e50; color: #ffffff; padding: 15px 40px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold;">Reset Password</a>
          </div>
          
          <!-- Security Note -->
          <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #e0e0e0;">
            <p style="color: #666; font-size: 14px; margin-bottom: 10px;"><strong>Important:</strong></p>
            <ul style="color: #666; font-size: 14px; margin: 10px 0; padding-left: 20px;">
              <li>This link will expire in 15 minutes.</li>
              <li>If you didn't make this request, no action is needed. Your account remains secure.</li>
              <li> Jardin Botanica</li>
            </ul>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; border-top: 1px solid #e0e0e0;">
          <p style="margin: 0;">This is an automated email. Please do not reply to this message.</p>
          <p style="margin: 10px 0 0 0;">© Jardin Botanica. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send password reset email to customer
 * @param email - Customer email address
 * @param token - Password reset token
 * @param customerName - Customer's name (optional)
 */
export async function sendPasswordResetEmail(
  email: string,
  token: string,
  customerName: string = "Customer"
): Promise<void> {
  try {
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    const resendApiKey = process.env.RESEND_API_KEY;

    if (!fromEmail) {
      throw new Error("RESEND_FROM_EMAIL is not set — cannot send password reset email");
    }
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not set — cannot send password reset email");
    }

    // Get frontend URL from environment variables
    // STORE_CORS may contain multiple URLs (comma-separated), so we take the first one
    let frontendUrl = process.env.FRONTEND_URL || process.env.STORE_CORS || 'http://localhost:8000';

    // If frontendUrl contains multiple URLs (comma-separated), take the first one
    if (frontendUrl.includes(',')) {
      frontendUrl = frontendUrl.split(',')[0].trim();
    }

    // Get default country code from environment or use 'in' as default
    const defaultCountryCode = process.env.DEFAULT_COUNTRY_CODE || 'in';

    console.log('🌐 Using frontend URL for reset link:', frontendUrl);
    console.log('🌍 Using country code:', defaultCountryCode);

    // Construct reset URL with token and email
    const resetUrl = `${frontendUrl}/${defaultCountryCode}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

    const recipientEmails = [email];

    console.log('📧 Preparing to send password reset email...');
    console.log('From:', fromEmail);
    console.log('To:', recipientEmails);

    const resend = new Resend(resendApiKey);
    
    // Generate email HTML
    const emailHtml = generatePasswordResetEmailTemplate(customerName, resetUrl);
    
    // Send email
    const emailResult = await resend.emails.send({
      from: fromEmail,
      to: recipientEmails,
      subject: 'Reset Your Password - Jardin Botanica',
      html: emailHtml,
    });
    
    // Log detailed response
    console.log('📬 Email API Response:', JSON.stringify(emailResult, null, 2));
    
    if (emailResult.error) {
      console.error('❌ Resend API Error:', emailResult.error);
      
      // If it's a validation error about test mode, log it but don't throw
      const error = emailResult.error as any;
      if (error.statusCode === 403 && error.message?.includes('testing emails')) {
        console.warn('⚠️  Resend test mode restriction: Only your own email can receive emails in test mode');
        console.warn('💡 Solution: Verify a domain at resend.com/domains to send to all recipients');
        return;
      }
      
      throw new Error(`Failed to send email: ${JSON.stringify(emailResult.error)}`);
    }
    
    if (emailResult.data) {
      console.log('✅ Password reset email sent successfully!');
      console.log('Email ID:', emailResult.data.id);
      console.log('Recipients:', recipientEmails.join(', '));
    } else {
      console.warn('⚠️ Unexpected response from Resend API:', emailResult);
    }
  } catch (error: any) {
    console.error("❌ Error sending password reset email:");
    console.error("Error message:", error?.message || error);
    throw error;
  }
}
