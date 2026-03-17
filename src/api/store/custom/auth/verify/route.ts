import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { IAuthModuleService } from "@medusajs/types";
import { Modules } from "@medusajs/framework/utils";

export async function POST_VERIFY(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const authModuleService: IAuthModuleService = req.scope.resolve(Modules.AUTH);

  const { phone, otp } = req.body;

  if (!phone || !otp) {
    return res.status(400).json({
      success: false,
      error: "Phone number and OTP are required",
    });
  }

  try {
    const result = await authModuleService.authenticate("phone-auth", {
      body: {
        phone,
        otp,
        step: "verify",
      },
    } as any);

    if (result.success && result.auth_token) {
      res.json({
        success: true,
        token: result.auth_token,
        authIdentity: result.authIdentity,
      });
    } else {
      res.status(400).json({
        success: false,
        error: "Verification failed",
      });
    }
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
}
