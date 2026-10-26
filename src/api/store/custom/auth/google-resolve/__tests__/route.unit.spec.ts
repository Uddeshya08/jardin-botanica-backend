jest.mock("@medusajs/framework/utils", () => ({
  Modules: { AUTH: "auth", CUSTOMER: "customer" },
  MedusaError: class extends Error {
    static Types = { UNAUTHORIZED: "unauthorized", INVALID_DATA: "invalid_data" };
  },
}));

import { POST } from "../route";

describe("Google customer profile resolution", () => {
  const authIdentity = {
    id: "auth_1",
    app_metadata: {} as Record<string, unknown>,
    provider_identities: [{
      provider: "google",
      user_metadata: {
        email: "customer@example.com",
        given_name: "Jane",
        family_name: "Doe",
        name: "Jane Doe",
      },
    }],
  };
  const authService = {
    retrieveAuthIdentity: jest.fn(),
    updateAuthIdentities: jest.fn(),
  };
  const customerService = {
    listCustomers: jest.fn(),
    retrieveCustomer: jest.fn(),
    updateCustomers: jest.fn(),
  };
  const json = jest.fn();
  const req = {
    auth_context: { auth_identity_id: "auth_1" },
    scope: {
      resolve: (name: string) => name === "auth" ? authService : customerService,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    authIdentity.app_metadata = {};
    authService.retrieveAuthIdentity.mockResolvedValue(authIdentity);
    customerService.listCustomers.mockResolvedValue([]);
  });

  it("returns Google names for a new customer", async () => {
    await POST(req as any, { json } as any);

    expect(json).toHaveBeenCalledWith({
      email: "customer@example.com",
      existed: false,
      first_name: "Jane",
      last_name: "Doe",
    });
    expect(customerService.updateCustomers).not.toHaveBeenCalled();
  });

  it("links an existing customer and fills only missing name fields", async () => {
    customerService.listCustomers.mockResolvedValue([{
      id: "cus_1",
      has_account: true,
      first_name: "",
      last_name: "Chosen Surname",
    }]);

    await POST(req as any, { json } as any);

    expect(authService.updateAuthIdentities).toHaveBeenCalledWith({
      id: "auth_1",
      app_metadata: { customer_id: "cus_1" },
    });
    expect(customerService.updateCustomers).toHaveBeenCalledWith("cus_1", {
      first_name: "Jane",
    });
    expect(json).toHaveBeenCalledWith({ email: "customer@example.com", existed: true });
  });

  it("uses the linked customer and preserves an existing name", async () => {
    authIdentity.app_metadata = { customer_id: "cus_1" };
    customerService.retrieveCustomer.mockResolvedValue({
      id: "cus_1",
      has_account: true,
      first_name: "Preferred",
      last_name: "Name",
    });

    await POST(req as any, { json } as any);

    expect(customerService.retrieveCustomer).toHaveBeenCalledWith("cus_1");
    expect(customerService.listCustomers).not.toHaveBeenCalled();
    expect(customerService.updateCustomers).not.toHaveBeenCalled();
    expect(authService.updateAuthIdentities).not.toHaveBeenCalled();
  });

  it("backfills a previously linked customer with an empty name", async () => {
    authIdentity.app_metadata = { customer_id: "cus_1" };
    customerService.retrieveCustomer.mockResolvedValue({
      id: "cus_1",
      has_account: true,
      first_name: null,
      last_name: null,
    });

    await POST(req as any, { json } as any);

    expect(customerService.updateCustomers).toHaveBeenCalledWith("cus_1", {
      first_name: "Jane",
      last_name: "Doe",
    });
    expect(json).toHaveBeenCalledWith({ email: "customer@example.com", existed: true });
  });

  it("uses the full Google name when separate name parts are unavailable", async () => {
    authService.retrieveAuthIdentity.mockResolvedValue({
      ...authIdentity,
      provider_identities: [{
        provider: "google",
        user_metadata: { email: "customer@example.com", name: "Jane Doe" },
      }],
    });

    await POST(req as any, { json } as any);

    expect(json).toHaveBeenCalledWith({
      email: "customer@example.com",
      existed: false,
      first_name: "Jane Doe",
      last_name: null,
    });
  });
});
