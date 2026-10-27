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
 *   1. reads the Google email and name off the auth identity,
 *   2. links an existing customer when needed and fills only blank name fields,
 *   3. returns the name for a new customer so the storefront can create its profile.
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
  const givenName = googleIdentity?.user_metadata?.given_name;
  const familyName = googleIdentity?.user_metadata?.family_name;
  const fullName = googleIdentity?.user_metadata?.name;
  const lastName = typeof familyName === "string" ? familyName.trim() : "";
  const firstName =
    (typeof givenName === "string" && givenName.trim()) ||
    (!lastName && typeof fullName === "string" ? fullName.trim() : "");

  if (!email) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "No email found on the Google identity"
    );
  }

  const linkedCustomerId = authIdentity.app_metadata?.customer_id;
  const account = linkedCustomerId
    ? await customerModuleService.retrieveCustomer(String(linkedCustomerId))
    : (await customerModuleService.listCustomers({ email })).find(
        (customer) => customer.has_account
      );

  if (account) {
    const appMetadata = authIdentity.app_metadata || {};

    // Link only if not already linked — setting an existing key throws.
    if (!appMetadata.customer_id) {
      await authModuleService.updateAuthIdentities({
        id: authIdentity.id,
        app_metadata: { ...appMetadata, customer_id: account.id },
      });
    }

    const missingName: { first_name?: string; last_name?: string } = {};
    if (!account.first_name?.trim() && firstName) {
      missingName.first_name = firstName;
    }
    if (!account.last_name?.trim() && lastName) {
      missingName.last_name = lastName;
    }
    if (Object.keys(missingName).length) {
      await customerModuleService.updateCustomers(account.id, missingName);
    }

    res.json({ email, existed: true });
    return;
  }

  res.json({
    email,
    existed: false,
    first_name: firstName || null,
    last_name: lastName || null,
  });
}
