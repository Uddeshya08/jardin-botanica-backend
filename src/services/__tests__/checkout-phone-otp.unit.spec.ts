import { checkoutOtpKey, getCodSession, isCodCart, requireCodPhone } from "../checkout-phone-otp"

const cart = {
  id: "cart_123",
  shipping_address: { phone: "+91 98765 43210" },
  shipping_methods: [{ data: { paymentMethod: "COD" } }],
  payment_collection: {
    payment_sessions: [{ id: "payses_1", provider_id: "pp_system_default", status: "pending" }],
  },
}

describe("checkout phone OTP binding", () => {
  it("accepts the cart delivery phone with or without country code", () => {
    expect(requireCodPhone(cart, "9876543210")).toBe("919876543210")
    expect(requireCodPhone(cart, "+919876543210")).toBe("919876543210")
  })

  it("rejects a different phone or a missing COD session", () => {
    expect(() => requireCodPhone(cart, "9876543211")).toThrow("Phone number does not match")
    expect(() => requireCodPhone({ ...cart, payment_collection: null })).toThrow("Select Cash on Delivery")
  })

  it("invalidates verification when the cart, phone, or payment session changes", () => {
    const key = checkoutOtpKey(cart, "919876543210", "verified")
    expect(checkoutOtpKey({ ...cart, id: "cart_456" }, "919876543210", "verified")).not.toBe(key)
    expect(checkoutOtpKey(cart, "919876543211", "verified")).not.toBe(key)
    expect(checkoutOtpKey({
      ...cart,
      payment_collection: {
        payment_sessions: [{ id: "payses_2", provider_id: "pp_system_default", status: "pending" }],
      },
    }, "919876543210", "verified")).not.toBe(key)
  })

  it("guards a manual-only cart even without a shipping payment marker", () => {
    expect(isCodCart({ ...cart, shipping_methods: [] })).toBe(true)
    expect(getCodSession(cart)?.id).toBe("payses_1")
    expect(isCodCart({
      ...cart,
      shipping_methods: [{ data: { paymentMethod: "PREPAID" } }],
    })).toBe(true)
    expect(isCodCart({
      ...cart,
      shipping_methods: [{ data: { paymentMethod: "PREPAID" } }],
      payment_collection: {
        payment_sessions: [
          ...cart.payment_collection.payment_sessions,
          { id: "payses_online", provider_id: "pp_razorpay_razorpay", status: "pending" },
        ],
      },
    })).toBe(false)
  })
})
