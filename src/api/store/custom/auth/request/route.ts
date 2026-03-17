import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { IAuthModuleService } from "@medusajs/types";
import { Modules } from "@medusajs/framework/utils";

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const authModuleService: IAuthModuleService = req.scope.resolve(Modules.AUTH);

  const { phone, otp, step } = req.body;

  try {
    const result = await authModuleService.authenticate("phone-auth", {
      body: {
        phone,
        otp,
        step,
      },
    } as any);

    if (result.success && result.auth_token) {
      // Full authentication successful
      res.json({
        success: true,
        token: result.auth_token,
        authIdentity: result.authIdentity,
      });
    } else {
      // OTP sent successfully
      res.json({
        success: true,
        message: "OTP sent successfully",
      });
    }
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
}

// src/api/store/auth/phone/verify/route.ts
// POST /store/auth/phone/verify
