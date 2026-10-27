import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"
import { checkoutOtpCache, checkoutOtpClient, checkoutOtpKey, getCheckoutCart, requireCodPhone } from "../../../../../../services/checkout-phone-otp"

const schema = z.object({ cart_id: z.string().min(1), phone: z.string().min(8).max(30) })

export async function POST(req: MedusaRequest<z.infer<typeof schema>>, res: MedusaResponse): Promise<void> {
  const { cart_id, phone: phoneInput } = schema.parse(req.body)
  const cart = await getCheckoutCart(req, cart_id)
  const phone = requireCodPhone(cart, phoneInput)
  const cache = checkoutOtpCache(req)
  const rateKey = checkoutOtpKey(cart, phone, "rate")

  if (await cache.get<boolean>(rateKey)) {
    res.status(429).json({ message: "Please wait before requesting another code.", retry_after_seconds: 60 })
    return
  }

  await cache.set(rateKey, true, 60)
  await cache.invalidate(checkoutOtpKey(cart, phone, "verified"))
  await cache.invalidate(checkoutOtpKey(cart, phone, "requested"))
  await cache.invalidate(checkoutOtpKey(cart, phone, "attempts"))

  try {
    await checkoutOtpClient().sendOtp(phone)
  } catch {
    await cache.invalidate(rateKey)
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Unable to send OTP. Please try again.")
  }

  await cache.set(checkoutOtpKey(cart, phone, "requested"), true, 300)
  res.status(202).json({ message: "Verification code sent to your phone.", retry_after_seconds: 60 })
}
