import { authenticate, defineMiddlewares } from "@medusajs/framework/http";
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { NextFunction } from "express";
import { checkoutOtpCache, checkoutOtpKey, getCheckoutCart, isCodCart, normalizedPhone } from "../services/checkout-phone-otp";

async function requireCodVerification(req: MedusaRequest, res: MedusaResponse, next: NextFunction): Promise<void> {
  try {
    const cart = await getCheckoutCart(req, req.params.id);
    if (isCodCart(cart)) {
      const phone = normalizedPhone(cart.shipping_address?.phone || "");
      const verified = await checkoutOtpCache(req).get<boolean>(checkoutOtpKey(cart, phone, "verified"));
      if (!verified) {
        res.status(403).json({ message: "Verify your phone before placing a Cash on Delivery order." });
        return;
      }
    }
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * The Google sign-in callback issues a *registration* token (empty actor_id)
 * before the customer account exists. The default /store/* auth rejects it, so
 * the google-identity lookup route must opt into `allowUnregistered` — same as
 * core's POST /store/customers register route — to receive auth_context.
 */
export default defineMiddlewares({
  routes: [
    {
      method: ["POST"],
      matcher: "/store/carts/:id/complete",
      middlewares: [requireCodVerification],
    },
    {
      method: ["GET"],
      matcher: "/store/custom/auth/google-identity",
      middlewares: [
        authenticate("customer", ["session", "bearer"], {
          allowUnregistered: true,
        }),
      ],
    },
    {
      method: ["POST"],
      matcher: "/store/custom/auth/google-resolve",
      middlewares: [
        authenticate("customer", ["session", "bearer"], {
          allowUnregistered: true,
        }),
      ],
    },
  ],
});
