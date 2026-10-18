export type Msg91OtpOptions = {
  authKey: string
  templateId: string
  baseUrl?: string
  otpExpiryMinutes?: number
  otpLength?: number
  requestTimeoutMs?: number
}
type Msg91Response = {
  type?: string
  message?: string
  request_id?: string
}

const DEFAULT_BASE_URL = "https://control.msg91.com/api/v5/otp"

export class Msg91OtpError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "Msg91OtpError"
  }
}

export function normalizePhoneNumber(
  value: string,
  defaultCountryCode = "91"
): string {
  const input = value.trim()

  if (!input || !/^\+?[\d\s()-]+$/.test(input)) {
    throw new Error("Enter a valid mobile phone number")
  }

  let digits = input.replace(/\D/g, "")
  const countryCode = defaultCountryCode.replace(/\D/g, "")

  if (!countryCode || countryCode.length > 3) {
    throw new Error("MSG91_DEFAULT_COUNTRY_CODE is invalid")
  }

  if (digits.startsWith("00")) {
    digits = digits.slice(2)
  }

  if (digits.length === 10) {
    digits = `${countryCode}${digits}`
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = `${countryCode}${digits.slice(1)}`
  }

  if (digits.length < 10 || digits.length > 15) {
    throw new Error("Enter a valid mobile phone number with country code")
  }

  return digits
}

export function getPhoneLookupVariants(
  normalizedPhone: string,
  defaultCountryCode = "91"
): string[] {
  const countryCode = defaultCountryCode.replace(/\D/g, "")
  const variants = new Set([normalizedPhone, `+${normalizedPhone}`])

  if (normalizedPhone.startsWith(countryCode)) {
    const nationalNumber = normalizedPhone.slice(countryCode.length)

    if (nationalNumber.length >= 8) {
      variants.add(nationalNumber)
      variants.add(`0${nationalNumber}`)
    }
  }

  return [...variants]
}

export class Msg91OtpClient {
  private readonly options: Required<Msg91OtpOptions>

  constructor(options: Msg91OtpOptions) {
    if (!options.authKey) {
      throw new Error("MSG91_AUTH_KEY is required")
    }

    if (!options.templateId) {
      throw new Error("MSG91_OTP_TEMPLATE_ID is required")
    }

    this.options = {
      authKey: options.authKey,
      templateId: options.templateId,
      baseUrl: options.baseUrl || DEFAULT_BASE_URL,
      otpExpiryMinutes: options.otpExpiryMinutes || 5,
      otpLength: options.otpLength || 6,
      requestTimeoutMs: options.requestTimeoutMs || 10_000,
    }
  }

  async sendOtp(phone: string): Promise<{ requestId?: string }> {
    const url = new URL(this.options.baseUrl)
    url.searchParams.set("template_id", this.options.templateId)
    url.searchParams.set("mobile", phone)
    url.searchParams.set(
      "otp_expiry",
      String(this.options.otpExpiryMinutes)
    )
    url.searchParams.set("otp_length", String(this.options.otpLength))

    const result = await this.request(url, { method: "POST" })

    return { requestId: result.request_id }
  }

  async verifyOtp(phone: string, otp: string): Promise<void> {
    const url = new URL(`${this.options.baseUrl.replace(/\/$/, "")}/verify`)
    url.searchParams.set("mobile", phone)
    url.searchParams.set("otp", otp)

    await this.request(url, { method: "GET" })
  }

  private async request(
    url: URL,
    init: Pick<RequestInit, "method">
  ): Promise<Msg91Response> {
    let response: Response

    try {
      response = await fetch(url, {
        ...init,
        headers: {
          accept: "application/json",
          authkey: this.options.authKey,
        },
        signal: AbortSignal.timeout(this.options.requestTimeoutMs),
      })
    } catch (error) {
      throw new Msg91OtpError(
        error instanceof Error ? error.message : "MSG91 request failed"
      )
    }

    let result: Msg91Response = {}

    try {
      result = (await response.json()) as Msg91Response
    } catch {
      throw new Msg91OtpError(`MSG91 returned HTTP ${response.status}`)
    }

    if (!response.ok || result.type?.toLowerCase() !== "success") {
      throw new Msg91OtpError(result.message || "MSG91 OTP request failed")
    }

    return result
  }
}

