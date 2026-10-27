import { Resend } from "resend"

import { sendOrderConfirmationEmail } from "../email.service"
import { renderOrderConfirmationEmail, type ConfirmationOrder } from "../order-confirmation-template"

jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn().mockResolvedValue({ data: { id: "email_mock" } }) },
  })),
}))

const order: ConfirmationOrder = {
  id: "order_test",
  display_id: 4831,
  email: "customer@example.com",
  created_at: "2026-10-25T20:00:00Z",
  currency_code: "inr",
  total: 7200,
  shipping_total: 0,
  items: [{
    product_title: "Cedarwood Rose",
    variant_title: "Cedarwood Rose 200g",
    unit_price: 1800,
    quantity: 4,
    product: { categories: [{ name: "Candles" }] },
  }],
  shipping_address: {
    first_name: "Uddeshya", last_name: "Sharma",
    address_1: "305 Shobha Park, Yerwada", city: "Pune",
    province: "Maharashtra", postal_code: "411006", country_code: "in",
  },
}

describe("dispatch-note order confirmation template", () => {
  it("uses the supplied design with real order data and India-local order date", () => {
    const html = renderOrderConfirmationEmail(order)
    expect(html).toContain("Dear Uddeshya,")
    expect(html).toContain("REF. JB-26004831")
    expect(html).toContain("26 October, 2026")
    expect(html).toContain("CANDLE · 200 G")
    expect(html).toContain("QTY 04")
    expect(html).toContain("₹7,200.00")
    expect(html).toContain("Complimentary")
    expect(html).toContain("Pune, Maharashtra 411006<br>India")
    expect(html).toContain("#f9f7f0")
    expect(html).toContain('src="cid:jardin-wordmark"')
    expect(html).toContain("font-family:&quot;American Typewriter&quot;")
    expect(html).toContain("max-width:650px")
    expect(html).toContain("We'll write again when your order leaves the Conservatory.")
    expect(html).not.toMatch(/\{\{[a-z_]+\}\}/)
  })

  it("renders every item, paid shipping and discount without dividing large rupee amounts", () => {
    const html = renderOrderConfirmationEmail({
      ...order,
      display_id: 9999,
      total: { amount: 17939.07 },
      shipping_total: 39.07,
      discount_total: 100,
      items: [order.items![0], {
        product_title: "Santal Pepper", unit_price: 1800, quantity: 6,
        variant: { options: [{ value: "200g" }] },
        product: { categories: [{ name: "Candles" }] },
      }],
    })
    expect(html).toContain("Santal Pepper")
    expect(html).toContain("QTY 06")
    expect(html).toContain("₹10,800.00")
    expect(html).toContain("₹17,939.07")
    expect(html).toContain("₹39.07")
    expect(html).toContain("−₹100.00")
    expect(html).not.toContain("Complimentary")
  })

  it("escapes customer and product fields without interpreting inserted placeholders", () => {
    const html = renderOrderConfirmationEmail({
      ...order,
      shipping_address: { ...order.shipping_address, first_name: '<img onerror="x">{{total}}', address_1: "A & B" },
      items: [{ product_title: "<script>bad()</script>", quantity: 1, unit_price: 10 }],
    })
    expect(html).toContain("&lt;img onerror=&quot;x&quot;&gt;{{total}}")
    expect(html).toContain("&lt;script&gt;bad()&lt;/script&gt;")
    expect(html).toContain("A &amp; B")
    expect(html).not.toContain("<script>")
    expect(html).not.toContain('<img onerror="x">')
  })

  it("keeps GST in the displayed line price instead of using the tax-exclusive subtotal", () => {
    const html = renderOrderConfirmationEmail({
      ...order,
      total: 1800,
      items: [{ product_title: "Cedarwood Rose", quantity: 1, unit_price: 1800,
        subtotal: 1525.42, original_total: 1800 }],
    })
    expect(html).toContain("₹1,800.00")
    expect(html).not.toContain("₹1,525.42")
  })

  it("shows complimentary delivery and lists the COD handling fee separately", () => {
    const html = renderOrderConfirmationEmail({
      ...order,
      total: 7300,
      shipping_total: 100,
      shipping_methods: [{ amount: 100, data: { paymentMethod: "COD", cod_fee: 100 } }],
    })
    expect(html).toContain("Complimentary")
    expect(html).toContain(">COD</td>")
    expect(html).toContain("₹100.00")
    expect(html).toContain("₹7,300.00")
  })

  it("handles absent optional data and derives totals only when the order total is absent", () => {
    const html = renderOrderConfirmationEmail({
      id: "order_fallback", created_at: "2026-10-26", customer: { first_name: "Guest" },
      shipping_methods: [{ amount: 50 }],
      items: [{ title: "Product", unit_price: 1800, quantity: 2 }],
      discount_total: 100,
    })
    expect(html).toContain("Dear Guest,")
    expect(html).toContain("₹3,550.00")
    expect(html).not.toContain("Deliver to")
    expect(html).not.toContain("undefined")
    expect(html).not.toContain("Uddeshya")
  })

  it("passes the new HTML and matching PNG content ID to Resend without sending a live email", async () => {
    const previousKey = process.env.RESEND_API_KEY
    const previousFrom = process.env.RESEND_FROM_EMAIL
    process.env.RESEND_API_KEY = "mock-key"
    process.env.RESEND_FROM_EMAIL = "hello@jardinbotanica.com"
    const log = jest.spyOn(console, "log").mockImplementation(() => {})
    try {
      await sendOrderConfirmationEmail(order)
      const client = (Resend as jest.Mock).mock.results.slice(-1)[0]!.value
      const payload = client.emails.send.mock.calls[0][0]
      expect(payload.html).toBe(renderOrderConfirmationEmail(order))
      expect(payload.to).toContain(order.email)
      expect(payload.subject).toBe("Order Confirmation - JB-26004831")
      expect(payload.attachments[0].contentId).toBe("jardin-wordmark")
      expect(payload.attachments[0].content.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a")
    } finally {
      if (previousKey === undefined) delete process.env.RESEND_API_KEY
      else process.env.RESEND_API_KEY = previousKey
      if (previousFrom === undefined) delete process.env.RESEND_FROM_EMAIL
      else process.env.RESEND_FROM_EMAIL = previousFrom
      log.mockRestore()
    }
  })
})
