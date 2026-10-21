import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"
import { checkoutOtpCache, checkoutOtpClient, checkoutOtpKey, getCheckoutCart, requireCodPhone } from "../../../../../../services/checkout-phone-otp"

const schema = z.object({
  cart_id: z.string().min(1),
  phone: z.string().min(8).max(30),
  otp: z.string().regex(/^\d{4,9}$/),
})

export async function POST(req: MedusaRequest<z.infer<typeof schema>>, res: MedusaResponse): Promise<void> {
  const { cart_id, phone: phoneInput, otp } = schema.parse(req.body)
  const cart = await getCheckoutCart(req, cart_id)
  const phone = requireCodPhone(cart, phoneInput)
  const cache = checkoutOtpCache(req)
  const requestedKey = checkoutOtpKey(cart, phone, "requested")
  const attemptsKey = checkoutOtpKey(cart, phone, "attempts")

  if (!(await cache.get<boolean>(requestedKey))) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Request a new verification code first")
  }

  const attempts = (await cache.get<number>(attemptsKey)) || 0
  if (attempts >= 5) {
    res.status(429).json({ message: "Too many attempts. Request a new code." })
    return
  }
  await cache.set(attemptsKey, attempts + 1, 300)

  try {
    await checkoutOtpClient().verifyOtp(phone, otp)
  } catch {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid or expired verification code")
  }

  await cache.set(checkoutOtpKey(cart, phone, "verified"), true, 600)
  await cache.invalidate(requestedKey)
  await cache.invalidate(attemptsKey)
  res.status(200).json({ verified: true })
}
