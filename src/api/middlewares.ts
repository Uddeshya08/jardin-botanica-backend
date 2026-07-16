import { authenticate, defineMiddlewares } from "@medusajs/framework/http";

/**
 * The Google sign-in callback issues a *registration* token (empty actor_id)
 * before the customer account exists. The default /store/* auth rejects it, so
 * the google-identity lookup route must opt into `allowUnregistered` — same as
 * core's POST /store/customers register route — to receive auth_context.
 */
export default defineMiddlewares({
  routes: [
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
