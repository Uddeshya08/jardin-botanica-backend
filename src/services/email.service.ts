import { Resend } from "resend";

interface OrderData {
  id: string;
  display_id?: string | number;
  email?: string | null;
  created_at: string;
  currency_code?: string;
  total?: number | { amount: number };
  items?: Array<{
    id?: string;
    title?: string;
    product_title?: string;
    variant_title?: string;
    subtitle?: string;
    unit_price?: number;
    quantity?: number;
  }>;
  shipping_address?: {
    first_name?: string;
    last_name?: string;
    company?: string;
    address_1?: string;
    address_2?: string;
    city?: string;
    province?: string;
    postal_code?: string;
    country_code?: string;
    phone?: string;
  };
  customer?: {
    first_name?: string;
    last_name?: string;
  };
}

/**
 * Format currency amount
 * Handles both paise and rupees formats
 */
function formatCurrency(amount: number, currencyCode: string = 'INR'): string {
  if (!amount || amount === 0) {
    return currencyCode === 'INR' ? '₹0.00' : `0.00 ${currencyCode}`;
  }
  
  let amountInRupees: number;
  
  // If amount is >= 10000, it's likely in paise (divide by 100)
  // If amount is < 10000, it's likely already in rupees (don't divide)
  if (amount >= 10000) {
    amountInRupees = amount / 100;
  } else {
    amountInRupees = amount;
  }
  
  const formattedAmount = amountInRupees.toFixed(2);
  return currencyCode === 'INR' ? `₹${formattedAmount}` : `${currencyCode} ${formattedAmount}`;
}

/**
 * Get customer name from order data
 */
function getCustomerName(order: OrderData): string {
  let customerName = "Customer";
  const shippingAddress = order.shipping_address;
  
  if (shippingAddress?.first_name) {
    customerName = shippingAddress.first_name;
    if (shippingAddress.last_name) {
      customerName += ` ${shippingAddress.last_name}`;
    }
  } else if (order.customer?.first_name) {
    customerName = order.customer.first_name;
  }
  
  return customerName;
}

/**
 * Calculate order total from order data
 */
function calculateOrderTotal(order: OrderData, currencyCode: string): number {
  let orderTotal = 0;
  
  if (typeof order.total === 'number') {
    orderTotal = order.total;
  } else if (order.total && typeof order.total === 'object' && 'amount' in order.total) {
    orderTotal = order.total.amount;
  } else if (order.items?.length) {
    orderTotal = order.items.reduce((sum: number, item: any) => {
      return sum + ((item.unit_price || 0) * (item.quantity || 1));
    }, 0);
  }
  
  return orderTotal;
}

/**
 * Get recipient emails based on mode (test/production)
 */
function getRecipientEmails(customerEmail: string | undefined, testEmail: string, isTestMode: boolean): string[] {
  if (isTestMode) {
    // In test mode, only send to test email (Resend restriction)
    return [testEmail];
  } else {
    // In production mode (custom domain), send to both customer and test email
    return customerEmail 
      ? [customerEmail, testEmail]
      : [testEmail];
  }
}

/**
 * Generate order confirmation email HTML template
 */
function generateOrderConfirmationEmailTemplate(order: OrderData, customerName: string, orderTotal: number, currencyCode: string): string {
  const shippingAddress = order.shipping_address;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Order Confirmation</title>
    </head>
    <body style="font-family: 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 0;">
        <!-- Header -->
        <div style="background-color: #2c3e50; padding: 30px 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Thank you for your order!</h1>
        </div>
        
        <!-- Content -->
        <div style="padding: 30px 20px;">
          <p style="font-size: 16px; margin-bottom: 10px;">Dear ${customerName},</p>
          <p style="font-size: 16px; color: #666; margin-bottom: 30px;">We're excited to confirm that your order has been placed successfully.</p>
          
          <!-- Order Details Box -->
          <div style="background-color: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #2c3e50;">
            <h2 style="margin-top: 0; color: #2c3e50; font-size: 20px;">Order Details</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #666;"><strong>Order Number:</strong></td>
                <td style="padding: 8px 0; text-align: right; color: #333;"><strong>#${order.display_id || order.id}</strong></td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;"><strong>Order Date:</strong></td>
                <td style="padding: 8px 0; text-align: right; color: #333;">${new Date(order.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;"><strong>Total Amount:</strong></td>
                <td style="padding: 8px 0; text-align: right; color: #2c3e50; font-size: 18px; font-weight: bold;">${formatCurrency(orderTotal, currencyCode)}</td>
              </tr>
            </table>
          </div>

          ${order.items?.length ? `
          <!-- Items Section -->
          <div style="margin: 30px 0;">
            <h3 style="color: #2c3e50; font-size: 18px; margin-bottom: 15px; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px;">Items Ordered</h3>
            <table style="width: 100%; border-collapse: collapse;">
              ${order.items.map((item: any) => {
                const itemTotal = (item.unit_price || 0) * (item.quantity || 1);
                return `
                <tr style="border-bottom: 1px solid #e0e0e0;">
                  <td style="padding: 15px 0; vertical-align: top;">
                    <div style="font-weight: bold; color: #333; margin-bottom: 5px;">${item.product_title || item.title || 'Product'}</div>
                    ${item.variant_title || item.subtitle ? `<div style="color: #666; font-size: 14px; margin-bottom: 5px;">${item.variant_title || item.subtitle}</div>` : ''}
                    <div style="color: #666; font-size: 14px;">Quantity: ${item.quantity || 1}</div>
                  </td>
                  <td style="padding: 15px 0; text-align: right; vertical-align: top; color: #333; font-weight: bold;">
                    ${formatCurrency(itemTotal, currencyCode)}
                  </td>
                </tr>
                `;
              }).join('')}
            </table>
          </div>
          ` : ''}

          ${shippingAddress ? `
          <!-- Shipping Address -->
          <div style="margin: 30px 0; padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
            <h3 style="color: #2c3e50; font-size: 18px; margin-top: 0; margin-bottom: 15px;">Shipping Address</h3>
            <p style="margin: 5px 0; color: #333; line-height: 1.8;">
              ${shippingAddress.first_name || ''}${shippingAddress.last_name ? ` ${shippingAddress.last_name}` : ''}<br>
              ${shippingAddress.company ? `${shippingAddress.company}<br>` : ''}
              ${shippingAddress.address_1 || ''}<br>
              ${shippingAddress.address_2 ? `${shippingAddress.address_2}<br>` : ''}
              ${shippingAddress.city || ''}${shippingAddress.province ? `, ${shippingAddress.province}` : ''} ${shippingAddress.postal_code || ''}<br>
              ${shippingAddress.country_code ? shippingAddress.country_code.toUpperCase() : ''}<br>
              ${shippingAddress.phone ? `<br><strong>Phone:</strong> ${shippingAddress.phone}` : ''}
            </p>
          </div>
          ` : ''}

          <!-- Footer Message -->
          <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #e0e0e0;">
            <p style="color: #666; font-size: 15px; margin-bottom: 10px;">We'll send you another email when your order ships.</p>
            <p style="color: #666; font-size: 15px; margin-bottom: 20px;">Thank you for shopping with us!</p>
            <p style="color: #333; font-size: 15px; margin: 0;">
              Best regards,<br>
              <strong style="color: #2c3e50;">Jardin Botanica Team</strong>
            </p>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; border-top: 1px solid #e0e0e0;">
          <p style="margin: 0;">This is an automated email. Please do not reply to this message.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send order confirmation email to customer
 * @param order - Order data object
 */
export async function sendOrderConfirmationEmail(order: OrderData | any): Promise<void> {
  try {
    // Get customer email from order
    const customerEmail = order.email || null;
    
    // Test email for testing purposes
    const testEmail = "abhishek1561998@gmail.com";
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    
    // Check if we're using test mode (onboarding@resend.dev)
    // In test mode, Resend only allows sending to your own email
    const isTestMode = fromEmail === 'onboarding@resend.dev';
    
    // Get recipient emails based on mode
    const recipientEmails = getRecipientEmails(customerEmail, testEmail, isTestMode);

    if (isTestMode) {
      console.log('⚠️  Test mode detected - only sending to test email due to Resend restrictions');
      if (customerEmail && customerEmail !== testEmail) {
        console.log(`ℹ️  Customer email (${customerEmail}) will be skipped in test mode`);
      }
    }

    if (!customerEmail) {
      console.warn(`No customer email found for order ${order.id}, sending to test email only`);
    }

    // Get customer name
    const customerName = getCustomerName(order);
    
    // Calculate total and format currency
    const currencyCode = order.currency_code?.toUpperCase() || 'INR';
    const orderTotal = calculateOrderTotal(order, currencyCode);
    
    // Initialize Resend client
    const resendApiKey = process.env.RESEND_API_KEY || 're_6vVfXKF3_49nTkiv9ehQQ2oxGkoHpw6ah';
    
    console.log('📧 Preparing to send order confirmation email...');
    console.log('From:', fromEmail);
    console.log('To:', recipientEmails);
    console.log('Order ID:', order.id);
    console.log('Mode:', isTestMode ? 'TEST MODE (Resend restrictions apply)' : 'PRODUCTION MODE');
    
    const resend = new Resend(resendApiKey);

    // Generate email HTML
    const emailHtml = generateOrderConfirmationEmailTemplate(order, customerName, orderTotal, currencyCode);

    // Send email
    const emailResult = await resend.emails.send({
      from: fromEmail,
      to: recipientEmails,
      subject: `Order Confirmation - Order #${order.display_id || order.id}`,
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
      console.log('✅ Email sent successfully!');
      console.log('Email ID:', emailResult.data.id);
      console.log('Recipients:', recipientEmails.join(', '));
      console.log(`✅ Order confirmation email sent to ${recipientEmails.join(', ')} for order ${order.id}`);
    } else {
      console.warn('⚠️ Unexpected response from Resend API:', emailResult);
    }
  } catch (error: any) {
    console.error("❌ Error sending order confirmation email:");
    console.error("Error message:", error?.message || error);
    throw error;
  }
}
