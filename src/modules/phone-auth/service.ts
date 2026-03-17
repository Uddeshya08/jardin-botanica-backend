// src/modules/phone-auth/service.ts
import { AbstractAuthModuleProvider, MedusaError } from "@medusajs/framework/utils";
import {
  AuthenticationInput,
  AuthenticationResponse,
  AuthIdentityProviderService,
  Logger,
} from "@medusajs/types";
import jwt from "jsonwebtoken";

type InjectedDependencies = {
  logger: Logger;
};

type Options = {
  jwtSecret: string;
  msg91AuthKey: string;
  msg91SenderId?: string;
  msg91TemplateId?: string;
};

interface PhoneAuthData {
  phone: string;
  otp?: string;
  step?: "request" | "verify";
}

class PhoneAuthService extends AbstractAuthModuleProvider {
  static DISPLAY_NAME = "Phone Authentication";
  static identifier = "phone-auth";

  private options_: Options;
  private logger_: Logger;
  private otpStore: Map<string, { otp: string; expiresAt: number }> = new Map();

  constructor(container: InjectedDependencies, options: Options) {
    super();
    this.options_ = options;
    this.logger_ = container.logger;
  }

  async authenticate(
    data: AuthenticationInput,
    authIdentityProviderService: AuthIdentityProviderService,
  ): Promise<AuthenticationResponse> {
    const phoneData = data.body as PhoneAuthData;

    if (!phoneData.phone) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Phone number is required");
    }

    // Step 1: Request OTP
    if (!phoneData.otp || phoneData.step === "request") {
      return await this.requestOTP(phoneData.phone);
    }

    // Step 2: Verify OTP
    return await this.verifyOTP(phoneData.phone, phoneData.otp, authIdentityProviderService);
  }

  private async requestOTP(phone: string): Promise<AuthenticationResponse> {
    try {
      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      // Store OTP with 5 minutes expiration
      this.otpStore.set(phone, {
        otp,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });

      // Send OTP via MSG91
      await this.sendOTPViaMSG91(phone, otp);

      this.logger_.info(`OTP sent to ${phone}`);

      return {
        success: true,
        authIdentity: {
          id: `phone-${phone}`,
          provider: PhoneAuthService.identifier,
          entity_id: phone,
          provider_metadata: {
            step: "otp_sent",
          },
        },
      };
    } catch (error) {
      this.logger_.error(`Failed to send OTP: ${error.message}`);
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Failed to send OTP. Please try again.",
      );
    }
  }

  private async sendOTPViaMSG91(phone: string, otp: string): Promise<void> {
    const { msg91AuthKey, msg91SenderId, msg91TemplateId } = this.options_;

    // Format phone number (remove any non-digits and ensure it starts with country code)
    const formattedPhone = phone.replace(/\D/g, "");

    try {
      // MSG91 OTP API endpoint
      const url = "https://control.msg91.com/api/v5/otp";

      const payload = {
        template_id: msg91TemplateId || "default",
        mobile: formattedPhone,
        authkey: msg91AuthKey,
        otp: otp,
        // Optional: customize message
        // otp_length: 6,
        // otp_expiry: 5, // minutes
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authkey: msg91AuthKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`MSG91 API error: ${errorData.message || response.statusText}`);
      }

      const result = await response.json();
      this.logger_.info(`MSG91 response: ${JSON.stringify(result)}`);
    } catch (error) {
      this.logger_.error(`MSG91 API error: ${error.message}`);
      throw error;
    }
  }

  private async verifyOTP(
    phone: string,
    otp: string,
    authIdentityProviderService: AuthIdentityProviderService,
  ): Promise<AuthenticationResponse> {
    const storedData = this.otpStore.get(phone);

    if (!storedData) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "OTP expired or not found. Please request a new OTP.",
      );
    }

    if (Date.now() > storedData.expiresAt) {
      this.otpStore.delete(phone);
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "OTP has expired. Please request a new OTP.",
      );
    }

    if (storedData.otp !== otp) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid OTP. Please try again.");
    }

    // OTP verified successfully, clean up
    this.otpStore.delete(phone);

    // Check if auth identity exists
    let authIdentity = await authIdentityProviderService
      .list({
        provider: PhoneAuthService.identifier,
        entity_id: phone,
      })
      .then((identities) => identities[0]);

    if (!authIdentity) {
      // Create new auth identity
      authIdentity = await authIdentityProviderService.create({
        provider: PhoneAuthService.identifier,
        entity_id: phone,
        provider_metadata: {
          phone,
        },
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        auth_identity_id: authIdentity.id,
        provider: PhoneAuthService.identifier,
      },
      this.options_.jwtSecret,
      { expiresIn: "24h" },
    );

    return {
      success: true,
      authIdentity,
      auth_token: token,
    };
  }

  async validateCallback(
    data: AuthenticationInput,
    authIdentityProviderService: AuthIdentityProviderService,
  ): Promise<AuthenticationResponse> {
    return this.authenticate(data, authIdentityProviderService);
  }
}

export default PhoneAuthService;
