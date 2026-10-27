import type { MedusaRequest } from "@medusajs/framework/http"
import type { ICacheService } from "@medusajs/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { createHash } from "node:crypto"
import { Msg91OtpClient, normalizePhoneNumber } from "./msg91-otp"

type Cart = {
  id: string
  shipping_address?: { phone?: string | null } | null
  shipping_methods?: { data?: { paymentMethod?: string } | null }[]
  payment_collection?: { payment_sessions?: { id: string; provider_id: string; status: string }[] } | null
}

const manualProvider = "pp_system_default"

export function normalizedPhone(value: string): string {
  try {
    return normalizePhoneNumber(value, process.env.MSG91_DEFAULT_COUNTRY_CODE || "91")
  } catch {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Enter a valid checkout phone number")
  }
}

export async function getCheckoutCart(req: MedusaRequest, cartId: string): Promise<Cart> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "shipping_address.phone",
      "shipping_methods.data",
      "payment_collection.payment_sessions.id",
      "payment_collection.payment_sessions.provider_id",
      "payment_collection.payment_sessions.status",
    ],
    filters: { id: cartId },
  } as any)
  const cart = data[0] as Cart | undefined
  if (!cart) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Cart not found")
  }
  return cart
}

export function isCodCart(cart: Cart): boolean {
  const selectedShippingMethod = cart.shipping_methods?.at(-1)
  const selectedMethod = selectedShippingMethod?.data?.paymentMethod
  if (selectedMethod === "COD") return true

  const pendingSessions = cart.payment_collection?.payment_sessions?.filter(
    (session) => session.status === "pending"
  ) || []
  return pendingSessions.length > 0 && pendingSessions.every(
    (session) => session.provider_id === manualProvider
  )
}

export function getCodSession(cart: Cart): { id: string } | undefined {
  return cart.payment_collection?.payment_sessions?.find(
    (session) => session.provider_id === manualProvider && session.status === "pending"
  )
}

export function requireCodPhone(cart: Cart, phoneInput?: string): string {
  if (!isCodCart(cart) || !getCodSession(cart)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Select Cash on Delivery before verifying your phone")
  }
  const phone = normalizedPhone(cart.shipping_address?.phone || "")
  if (phoneInput && phone !== normalizedPhone(phoneInput)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Phone number does not match the delivery address")
  }
  return phone
}

export function checkoutOtpKey(cart: Cart, phone: string, suffix: string): string {
  const sessionId = getCodSession(cart)?.id || "none"
  const digest = createHash("sha256").update(`${cart.id}:${phone}:${sessionId}`).digest("hex")
  return `checkout-phone-otp:${suffix}:${digest}`
}

export function checkoutOtpCache(req: MedusaRequest): ICacheService {
  return req.scope.resolve(Modules.CACHE)
}

export function checkoutOtpClient(): Msg91OtpClient {
  return new Msg91OtpClient({
    authKey: process.env.MSG91_AUTH_KEY || "",
    templateId: process.env.MSG91_OTP_TEMPLATE_ID || "",
    baseUrl: process.env.MSG91_OTP_BASE_URL,
    otpExpiryMinutes: Number(process.env.MSG91_OTP_EXPIRY_MINUTES || 5),
    otpLength: Number(process.env.MSG91_OTP_LENGTH || 6),
  })
}
