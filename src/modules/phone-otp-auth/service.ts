import type {
  AuthenticationInput,
  AuthenticationResponse,
  AuthIdentityProviderService,
  Logger,
} from "@medusajs/framework/types"
import {
  AbstractAuthModuleProvider,
  MedusaError,
} from "@medusajs/framework/utils"

import {
  Msg91OtpClient,
  normalizePhoneNumber,
  type Msg91OtpOptions,
} from "../../services/msg91-otp"

type InjectedDependencies = {
  logger: Logger
}

export type PhoneOtpAuthOptions = Msg91OtpOptions & {
  defaultCountryCode?: string
}

class PhoneOtpAuthService extends AbstractAuthModuleProvider {
  static identifier = "phoneotp"
  static DISPLAY_NAME = "Phone OTP Authentication"

  protected readonly logger_: Logger
  protected readonly options_: PhoneOtpAuthOptions
  protected readonly msg91_: Msg91OtpClient

  static validateOptions(options: PhoneOtpAuthOptions): void {
    if (!options.authKey) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "MSG91 auth key is required for the phone OTP provider"
      )
    }

    if (!options.templateId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "MSG91 OTP template ID is required for the phone OTP provider"
      )
    }
  }

  constructor(
    { logger }: InjectedDependencies,
    options: PhoneOtpAuthOptions
  ) {
    // @ts-ignore Medusa's provider base forwards module container arguments.
    super(...arguments)
    this.logger_ = logger
    this.options_ = options
    this.msg91_ = new Msg91OtpClient(options)
  }

  async authenticate(
    data: AuthenticationInput,
    authIdentityProviderService: AuthIdentityProviderService
  ): Promise<AuthenticationResponse> {
    const phoneInput = data.body?.phone
    const otp = data.body?.otp

    if (typeof phoneInput !== "string") {
      return { success: false, error: "Phone number is required" }
    }

    if (typeof otp !== "string" || !/^\d{4,9}$/.test(otp)) {
      return { success: false, error: "Enter a valid OTP" }
    }

    let phone: string

    try {
      phone = normalizePhoneNumber(
        phoneInput,
        this.options_.defaultCountryCode
      )
      await this.msg91_.verifyOtp(phone, otp)
    } catch (error) {
      this.logger_.warn(
        `Phone OTP verification failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      )
      return { success: false, error: "Invalid or expired OTP" }
    }

    try {
      const authIdentity = await authIdentityProviderService.retrieve({
        entity_id: phone,
      })

      if (!authIdentity.app_metadata?.customer_id) {
        return { success: false, error: "Phone number is not linked to an account" }
      }

      return { success: true, authIdentity }
    } catch {
      return { success: false, error: "Phone number is not linked to an account" }
    }
  }

  async register(): Promise<AuthenticationResponse> {
    return {
      success: false,
      error: "Use the phone OTP request endpoint to link a customer account",
    }
  }

  async update(): Promise<AuthenticationResponse> {
    return { success: false, error: "Phone OTP identities cannot be updated here" }
  }

  async validateCallback(
    data: AuthenticationInput,
    authIdentityProviderService: AuthIdentityProviderService
  ): Promise<AuthenticationResponse> {
    return this.authenticate(data, authIdentityProviderService)
  }
}

export default PhoneOtpAuthService
