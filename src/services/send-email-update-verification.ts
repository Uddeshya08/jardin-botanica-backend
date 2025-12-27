import { Resend } from "resend";

interface EmailUpdateData {
  customer_name: string;
  verification_url: string;
  current_email: string;
  new_email: string;
}

/**
 * Generate email update verification HTML template
 */
function generateEmailUpdateVerificationTemplate(
  data: EmailUpdateData
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify Your Email Update</title>
    </head>
    <body style="font-family: 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 0;">
        <!-- Header -->
        <div style="background-color: #2c3e50; padding: 30px 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Verify Your Email Update</h1>
        </div>
        
        <!-- Content -->
        <div style="padding: 40px 30px;">
          <p style="font-size: 16px; margin-bottom: 10px;">Hello ${data.customer_name},</p>
          
          <p style="font-size: 16px; color: #666; margin-bottom: 25px; line-height: 1.8;">
            You requested to update your email address from <strong style="color: #2c3e50;">${data.current_email}</strong> 
            to <strong style="color: #2c3e50;">${data.new_email}</strong>.
          </p>

          <p style="font-size: 16px; color: #666; margin-bottom: 30px; line-height: 1.8;">
            To complete this process and secure your account, you'll need to set a new password. 
            Click the button below to verify your new email address and create your new password.
          </p>

          <!-- CTA Button -->
          <div style="text-align: center; margin: 40px 0;">
            <a href="${data.verification_url}" 
               style="display: inline-block; padding: 16px 40px; background-color: #2c3e50; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold; transition: background-color 0.3s;">
              Verify Email & Set Password
            </a>
          </div>

          <!-- Security Notice Box -->
          <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 20px; margin: 30px 0; border-radius: 4px;">
            <h3 style="color: #856404; margin-top: 0; font-size: 16px; margin-bottom: 10px;">⚠️ Important Security Information</h3>
            <ul style="color: #856404; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">
              <li style="margin-bottom: 8px;">This link will expire in <strong>24 hours</strong></li>
              <li style="margin-bottom: 8px;">You'll need to create a new password for security</li>
              <li>If you didn't request this change, please contact support immediately</li>
            </ul>
          </div>

          <!-- Alternative Link -->
          <div style="margin-top: 30px; padding: 20px; background-color: #f8f9fa; border-radius: 6px;">
            <p style="font-size: 14px; color: #666; margin-bottom: 10px;">
              If the button above doesn't work, copy and paste this link into your browser:
            </p>
            <p style="font-size: 13px; color: #2c3e50; word-break: break-all; margin: 0; padding: 10px; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 4px;">
              ${data.verification_url}
            </p>
          </div>

          <!-- Footer Message -->
          <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #e0e0e0;">
            <p style="color: #666; font-size: 15px; margin-bottom: 20px;">
              Thank you for keeping your account secure.
            </p>
            <p style="color: #333; font-size: 15px; margin: 0;">
              Best regards,<br>
              <strong style="color: #2c3e50;">Jardin Botanica Team</strong>
            </p>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; border-top: 1px solid #e0e0e0;">
          <p style="margin: 0 0 10px 0;">This is an automated security email. Please do not reply to this message.</p>
          <p style="margin: 0;">If you didn't request this email update, please secure your account immediately.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send email update verification email
 * @param data - Email update data including customer name, verification URL, and emails
 */
export async function sendEmailUpdateVerification(
  data: EmailUpdateData
): Promise<void> {
  try {
    const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    const isTestMode = fromEmail === "onboarding@resend.dev";

    // In test mode, only send to test email (Resend restriction)
    // In production mode, send to new email address
    const testEmail = "vishalkacha5@gmail.com";
    const recipientEmail = isTestMode ? testEmail : data.new_email;

    if (isTestMode) {
      console.log(
        "⚠️  Test mode detected - sending verification to test email due to Resend restrictions"
      );
      console.log(
        `ℹ️  New email (${data.new_email}) will be skipped in test mode`
      );
      console.log(
        "💡 In production, the verification link will be sent to the new email address"
      );
    }

    console.log("📧 Preparing to send email update verification...");
    console.log("From:", fromEmail);
    console.log("To:", recipientEmail);
    console.log("New Email:", data.new_email);
    console.log("Current Email:", data.current_email);
    console.log(
      "Mode:",
      isTestMode ? "TEST MODE (Resend restrictions apply)" : "PRODUCTION MODE"
    );

    // Initialize Resend client
    const resendApiKey =
      process.env.RESEND_API_KEY || "re_6vVfXKF3_49nTkiv9ehQQ2oxGkoHpw6ah";
    const resend = new Resend(resendApiKey);

    // Generate email HTML
    const emailHtml = generateEmailUpdateVerificationTemplate(data);

    // Send email
    const emailResult = await resend.emails.send({
      from: fromEmail,
      to: recipientEmail,
      subject: "Verify Your Email Update - Action Required",
      html: emailHtml,
    });

    // Log detailed response
    console.log("📬 Email API Response:", JSON.stringify(emailResult, null, 2));

    if (emailResult.error) {
      console.error("❌ Resend API Error:", emailResult.error);

      // If it's a validation error about test mode, log it but don't throw
      const error = emailResult.error as any;
      if (
        error.statusCode === 403 &&
        error.message?.includes("testing emails")
      ) {
        console.warn(
          "⚠️  Resend test mode restriction: Only your own email can receive emails in test mode"
        );
        console.warn(
          "💡 Solution: Verify a domain at resend.com/domains to send to all recipients"
        );
        return;
      }

      throw new Error(
        `Failed to send email: ${JSON.stringify(emailResult.error)}`
      );
    }

    if (emailResult.data) {
      console.log("✅ Email verification sent successfully!");
      console.log("Email ID:", emailResult.data.id);
      console.log("Recipient:", recipientEmail);
      console.log(`✅ Email update verification sent to ${recipientEmail}`);
    } else {
      console.warn("⚠️ Unexpected response from Resend API:", emailResult);
    }
  } catch (error: any) {
    console.error("❌ Error sending email update verification:");
    console.error("Error message:", error?.message || error);
    throw error;
  }
}
