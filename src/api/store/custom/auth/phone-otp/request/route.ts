import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type {
  IAuthModuleService,
  ICacheService,
  ICustomerModuleService,
} from "@medusajs/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { createHash } from "node:crypto"
import { z } from "zod"

import {
  getPhoneLookupVariants,
  Msg91OtpClient,
  normalizePhoneNumber,
} from "../../../../../../services/msg91-otp"

const requestOtpSchema = z.object({
  phone: z.string().min(8).max(30),
})

type RequestOtpBody = z.infer<typeof requestOtpSchema>

type CustomerLookup = {
  id: string
  email: string | null
  phone: string | null
  has_account: boolean
}

const RESPONSE_MESSAGE =
  "If the phone number belongs to an account, an OTP has been sent."
const PROVIDER_ID = "phoneotp"

function getMsg91Client(): Msg91OtpClient {
  return new Msg91OtpClient({
    authKey: process.env.MSG91_AUTH_KEY || "",
    templateId: process.env.MSG91_OTP_TEMPLATE_ID || "",
    baseUrl: process.env.MSG91_OTP_BASE_URL,
    otpExpiryMinutes: Number(process.env.MSG91_OTP_EXPIRY_MINUTES || 5),
    otpLength: Number(process.env.MSG91_OTP_LENGTH || 6),
  })
}

async function getCustomerByPhone(
  req: MedusaRequest,
  normalizedPhone: string,
  countryCode: string
): Promise<CustomerLookup | null> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const variants = getPhoneLookupVariants(normalizedPhone, countryCode)

  const { data } = await query.graph({
    entity: "customer",
    fields: ["id", "email", "phone", "has_account"],
    filters: { phone: variants },
  } as any)

  const customers = (data as CustomerLookup[]).filter(
    (customer) => customer.has_account && customer.email
  )
  const uniqueCustomers = [
    ...new Map(customers.map((customer) => [customer.id, customer])).values(),
  ]

  if (uniqueCustomers.length > 1) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "This phone number is assigned to multiple customer accounts"
    )
  }

  return uniqueCustomers[0] || null
}

async function linkPhoneIdentity(
  authModuleService: IAuthModuleService,
  phone: string,
  customerId: string
): Promise<void> {
  let [providerIdentity] = await authModuleService.listProviderIdentities({
    provider: PROVIDER_ID,
    entity_id: phone,
  })

  if (!providerIdentity) {
    try {
      await authModuleService.createAuthIdentities({
        app_metadata: { customer_id: customerId },
        provider_identities: [
          {
            provider: PROVIDER_ID,
            entity_id: phone,
            user_metadata: { phone: `+${phone}` },
          },
        ],
      })
      return
    } catch {
      ;[providerIdentity] = await authModuleService.listProviderIdentities({
        provider: PROVIDER_ID,
        entity_id: phone,
      })
    }
  }

  if (!providerIdentity?.auth_identity_id) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "Unable to link phone authentication"
    )
  }

  const authIdentity = await authModuleService.retrieveAuthIdentity(
    providerIdentity.auth_identity_id
  )
  const linkedCustomerId = authIdentity.app_metadata?.customer_id

  if (linkedCustomerId && linkedCustomerId !== customerId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "This phone number is already linked to another customer account"
    )
  }

  if (!linkedCustomerId) {
    await authModuleService.updateAuthIdentities({
      id: authIdentity.id,
      app_metadata: {
        ...authIdentity.app_metadata,
        customer_id: customerId,
      },
    })
  }
}

export async function POST(
  req: MedusaRequest<RequestOtpBody>,
  res: MedusaResponse
): Promise<void> {
  const { phone: phoneInput } = requestOtpSchema.parse(req.body)
  const countryCode = process.env.MSG91_DEFAULT_COUNTRY_CODE || "91"

  let phone: string

  try {
    phone = normalizePhoneNumber(phoneInput, countryCode)
  } catch (error) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      error instanceof Error ? error.message : "Invalid phone number"
    )
  }

  const cache: ICacheService = req.scope.resolve(Modules.CACHE)
  const rateLimitKey = `phone-otp:request:${createHash("sha256")
    .update(phone)
    .digest("hex")}`
  const recentlyRequested = await cache.get<boolean>(rateLimitKey)

  if (recentlyRequested) {
    res.status(429).json({
      message: "Please wait before requesting another OTP.",
      retry_after_seconds: 60,
    })
    return
  }

  await cache.set(rateLimitKey, true, 60)

  const customer = await getCustomerByPhone(req, phone, countryCode)

  if (!customer) {
    res.status(202).json({ message: RESPONSE_MESSAGE })
    return
  }

  const authModuleService: IAuthModuleService = req.scope.resolve(Modules.AUTH)
  await linkPhoneIdentity(authModuleService, phone, customer.id)

  if (customer.phone !== `+${phone}`) {
    const customerModuleService: ICustomerModuleService = req.scope.resolve(
      Modules.CUSTOMER
    )
    await customerModuleService.updateCustomers(customer.id, {
      phone: `+${phone}`,
    })
  }

  try {
    await getMsg91Client().sendOtp(phone)
  } catch (error) {
    await cache.invalidate(rateLimitKey)

    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
    logger.error(
      `Unable to send MSG91 OTP: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    )

    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "Unable to send OTP. Please try again."
    )
  }

  res.status(202).json({ message: RESPONSE_MESSAGE })
}
