import { buildMetaPurchase, hashMetaValue } from "../meta-capi";
import { normalizeMetaMatchValue } from "../meta-match-data";
import type { MetaOrder } from "../meta-capi";

const config = { datasetId: "123", accessToken: "test", version: "v26.0", storefrontUrl: "https://www.jardinbotanica.com" };
const order = (): MetaOrder => ({
  id: "order_match", created_at: new Date(), total: 1900, currency_code: "inr",
  email: "buyer@example.com", customer_id: "cus_buyer",
  shipping_address: { first_name: " Asha ", last_name: " Sharma ", city: " New Delhi ",
    province: "IN-DL", postal_code: "110 001", country_code: " IN " },
  payment_collections: [{ status: "completed", captured_amount: 1900, completed_at: new Date() }],
});

describe("Meta Purchase matching", () => {
  it("normalizes and hashes the requested address fields without exposing raw values", () => {
    const result = buildMetaPurchase(order(), config);
    if (result.state !== "ready") throw new Error("expected ready");
    expect(result.event.user_data).toMatchObject({
      fn: [hashMetaValue("asha")], ln: [hashMetaValue("sharma")],
      ct: [hashMetaValue("newdelhi")], st: [hashMetaValue("dl")],
      zp: [hashMetaValue("110001")], country: [hashMetaValue("in")],
    });
    expect(result.event.user_data.ge).toBeUndefined();
    expect(result.event.user_data.db).toBeUndefined();
    expect(result.event.user_data.zip).toBeUndefined();
    expect(JSON.stringify(result.event)).not.toContain("Sharma");
    expect(JSON.stringify(result.event)).not.toContain("110001");
  });

  it("prefers customer names and billing location when supplied", () => {
    const result = buildMetaPurchase({ ...order(),
      customer: { first_name: "Buyer", last_name: "Name" },
      billing_address: { first_name: "Billing", city: "Bhopal", province: "Madhya Pradesh", country_code: "in" },
    }, config);
    if (result.state !== "ready") throw new Error("expected ready");
    expect(result.event.user_data.fn).toEqual([hashMetaValue("buyer")]);
    expect(result.event.user_data.ct).toEqual([hashMetaValue("bhopal")]);
    expect(result.event.user_data.st).toEqual([hashMetaValue("mp")]);
  });

  it("shares only explicitly stored and valid demographics under the API keys", () => {
    const result = buildMetaPurchase({ ...order(), customer: {
      metadata: { gender: "Female", date_of_birth: "1992-02-29" },
    } }, config);
    if (result.state !== "ready") throw new Error("expected ready");
    expect(result.event.user_data.ge).toEqual([hashMetaValue("f")]);
    expect(result.event.user_data.db).toEqual([hashMetaValue("19920229")]);
    expect(result.event.user_data.gen).toBeUndefined();
    expect(result.event.user_data.dob).toBeUndefined();
  });

  it.each([undefined, null, "", "unknown", 19920101, "1991-02-29", "2999-01-01", "1992-13-01"])(
    "omits absent/invalid date of birth: %s", (value) => {
      expect(normalizeMetaMatchValue("db", value)).toBeUndefined();
    });

  it("omits invalid matching values rather than hashing placeholders", () => {
    expect(normalizeMetaMatchValue("ge", "unknown")).toBeUndefined();
    expect(normalizeMetaMatchValue("st", "unknown", "in")).toBeUndefined();
    expect(normalizeMetaMatchValue("st", "xx", "in")).toBeUndefined();
    expect(normalizeMetaMatchValue("country", "India")).toBeUndefined();
    expect(normalizeMetaMatchValue("fn", " -- ")).toBeUndefined();
    expect(normalizeMetaMatchValue("ct", "New Delhi 12")).toBe("newdelhi");
    expect(normalizeMetaMatchValue("fn", "Élodie")).toBe("élodie");
  });

  it("does not treat a country alone as sufficient customer identity", () => {
    expect(buildMetaPurchase({ ...order(), email: null, customer_id: null,
      shipping_address: { country_code: "in", city: "Bhopal" },
    }, config)).toEqual({ state: "skipped", reason: "no_customer_match_identifiers" });
  });
});
