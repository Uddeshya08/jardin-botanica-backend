import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type {
  IAuthModuleService,
  ICustomerModuleService,
  ProviderIdentityDTO,
} from "@medusajs/types";
import { MedusaError, Modules } from "@medusajs/framework/utils";

/**
 * Resolves the Google sign-in for the storefront callback. The callback JWT is
 * a registration token (empty actor_id) and Google's email lives on the
 * provider identity record. This route:
 *   1. reads the verified Google email off the auth identity,
 *   2. if a customer with that email already exists, links this auth identity
 *      to it (sets app_metadata.customer_id) so a token refresh yields actor_id,
 *   3. reports whether the customer already existed so the storefront knows
 *      whether it still needs to create one.
 */
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const authIdentityId = req.auth_context?.auth_identity_id;

  if (!authIdentityId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Not authenticated");
  }

  const authModuleService: IAuthModuleService = req.scope.resolve(Modules.AUTH);
  const customerModuleService: ICustomerModuleService = req.scope.resolve(
    Modules.CUSTOMER
  );

  const authIdentity = await authModuleService.retrieveAuthIdentity(authIdentityId, {
    relations: ["provider_identities"],
  });

  const googleIdentity = authIdentity.provider_identities?.find(
    (identity: ProviderIdentityDTO) => identity.provider === "google"
  );

  const email = googleIdentity?.user_metadata?.email as string | undefined;

  if (!email) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "No email found on the Google identity"
    );
  }

  const existingCustomers = await customerModuleService.listCustomers({ email });
  const account = existingCustomers?.find((customer) => customer.has_account);

  if (account) {
    const appMetadata = authIdentity.app_metadata || {};

    // Link only if not already linked — setting an existing key throws.
    if (!appMetadata.customer_id) {
      await authModuleService.updateAuthIdentities({
        id: authIdentity.id,
        app_metadata: { ...appMetadata, customer_id: account.id },
      });
    }

    res.json({ email, existed: true });
    return;
  }

  res.json({ email, existed: false });
}
