import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { IAuthModuleService, ProviderIdentityDTO } from "@medusajs/types";
import { MedusaError, Modules } from "@medusajs/framework/utils";

/**
 * The `auth.callback` JWT does not embed the Google profile (only
 * actor_id/auth_identity_id) — the email captured during OAuth lives on the
 * provider identity record instead. This route lets the storefront look it
 * up right after callback, before the customer account exists, using the
 * bearer token's auth_identity_id (populated even when actor_id is empty).
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const authIdentityId = req.auth_context?.auth_identity_id;

  if (!authIdentityId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Not authenticated");
  }

  const authModuleService: IAuthModuleService = req.scope.resolve(Modules.AUTH);

  const authIdentity = await authModuleService.retrieveAuthIdentity(authIdentityId, {
    relations: ["provider_identities"],
  });

  const googleIdentity = authIdentity.provider_identities?.find(
    (identity: ProviderIdentityDTO) => identity.provider === "google"
  );

  res.json({
    email: (googleIdentity?.user_metadata?.email as string) ?? null,
    name: (googleIdentity?.user_metadata?.name as string) ?? null,
  });
}
