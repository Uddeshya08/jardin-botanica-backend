import { DELIVERY_MARKUP, ORDER_CONFIRMATION_MARKUP, ORDER_ITEM_MARKUP } from "./order-confirmation-markup"
import { getOrderReference } from "../utils/order-reference"

type Amount = number | string | { amount?: number | string; value?: number | string }

export interface ConfirmationOrder {
  id: string
  display_id?: string | number
  metadata?: Record<string, unknown> | null
  email?: string | null
  created_at: string | Date
  currency_code?: string
  total?: Amount | null
  shipping_total?: Amount | null
  discount_total?: Amount | null
  shipping_methods?: { amount?: Amount | null; data?: Record<string, unknown> | null }[]
  customer?: { first_name?: string | null; last_name?: string | null } | null
  items?: {
    product_title?: string | null
    title?: string | null
    variant_title?: string | null
    subtitle?: string | null
    unit_price?: Amount | null
    subtotal?: Amount | null
    original_total?: Amount | null
    quantity?: number
    product?: {
      type?: { value?: string | null } | null
      categories?: { name?: string | null }[] | null
    } | null
    variant?: { title?: string | null; options?: { value?: string | null }[] | null } | null
  }[]
  shipping_address?: {
    first_name?: string | null
    last_name?: string | null
    company?: string | null
    address_1?: string | null
    address_2?: string | null
    city?: string | null
    province?: string | null
    postal_code?: string | null
    country_code?: string | null
  } | null
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!)
}

function amount(value?: Amount | null): number {
  const number = Number(typeof value === "object" && value ? value.amount ?? value.value : value ?? 0)
  return Number.isFinite(number) ? number : 0
}

function fill(markup: string, values: Record<string, string>): string {
  // One pass prevents customer-supplied text from becoming another placeholder.
  return markup.replace(/\{\{([a-z_]+)\}\}/g, (_, key: string) => values[key] ?? "")
}

export function renderOrderConfirmationEmail(order: ConfirmationOrder): string {
  const currency = order.currency_code?.toUpperCase() || "INR"
  // Medusa v2 order amounts are already in the currency's major units.
  const money = (value: number): string => escapeHtml(new Intl.NumberFormat("en-IN", {
    style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value))
  const shippingWithFees = order.shipping_total != null
    ? amount(order.shipping_total)
    : (order.shipping_methods ?? []).reduce((total, method) => total + amount(method.amount), 0)
  const codFee = (order.shipping_methods ?? []).reduce((total, method) =>
    total + (method.data?.paymentMethod === "COD" ? amount(Number(method.data.cod_fee || 0)) : 0), 0)
  const shipping = Math.max(0, shippingWithFees - codFee)
  const discount = amount(order.discount_total)
  const items = (order.items ?? []).map((item) => {
    const quantity = item.quantity ?? 1
    const category = item.product?.categories?.slice(-1)[0]?.name || item.product?.type?.value || ""
    const categoryLabel = category.toLowerCase() === "candles" ? "CANDLE" : category.toUpperCase()
    const variant = item.variant?.title || item.variant_title || item.subtitle || ""
    const size = [variant, ...(item.variant?.options?.map((option) => option.value) ?? [])]
      .map((value) => value?.match(/\b(\d+(?:\.\d+)?)\s*(kg|ml|oz|g|l)\b/i))
      .find(Boolean)
    const details = [categoryLabel, size ? `${size[1]} ${size[2].toUpperCase()}` : ""]
      .filter(Boolean).join(" · ") || (variant === "Default Variant" ? "" : variant)
    return fill(ORDER_ITEM_MARKUP, {
      product_name: escapeHtml(item.product_title || item.title || "Product"),
      product_details: escapeHtml(details),
      quantity: escapeHtml(String(quantity).padStart(2, "0")),
      item_total: money(item.original_total != null ? amount(item.original_total) : amount(item.unit_price) * quantity),
    })
  }).join("")
  const subtotal = (order.items ?? []).reduce((total, item) =>
    total + (item.original_total != null ? amount(item.original_total) : amount(item.unit_price) * (item.quantity ?? 1)), 0)
  const total = order.total != null ? amount(order.total) : subtotal + shippingWithFees - discount
  const address = order.shipping_address
  const name = address?.first_name?.trim() || order.customer?.first_name?.trim() || "Customer"
  const deliveryName = [address?.first_name, address?.last_name].filter(Boolean).join(" ") || name
  let country = address?.country_code?.toUpperCase() || ""
  if (country) {
    try { country = new Intl.DisplayNames(["en"], { type: "region" }).of(country) || country } catch { /* Keep the original country code. */ }
  }
  const city = [address?.city, address?.province].filter(Boolean).join(", ")
  const addressLines = [address?.company, address?.address_1, address?.address_2,
    [city, address?.postal_code].filter(Boolean).join(" "), country].filter(Boolean)
  const date = new Date(order.created_at)
  const dateParts = Number.isNaN(date.getTime()) ? [] : new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Kolkata",
  }).formatToParts(date)
  const datePart = (type: string): string => dateParts.find((part) => part.type === type)?.value || ""
  const orderDate = dateParts.length ? `${datePart("day")} ${datePart("month")}, ${datePart("year")}` : ""

  return fill(ORDER_CONFIRMATION_MARKUP, {
    reference: escapeHtml(`REF. ${getOrderReference(order) || order.id}`),
    order_date: escapeHtml(orderDate),
    greeting_name: escapeHtml(name),
    items,
    shipping: shipping === 0 ? "Complimentary" : money(shipping),
    cod_row: codFee > 0
      ? `<tr><td class="muted" style="padding:5px 0;color:#77766f;">COD</td><td align="right" style="padding:5px 0;">${money(codFee)}</td></tr>`
      : "",
    discount_row: discount > 0
      ? `<tr><td class="muted" style="padding:5px 0;color:#77766f;">Discount</td><td align="right" style="padding:5px 0;">−${money(discount)}</td></tr>`
      : "",
    total: money(total),
    delivery_section: address ? fill(DELIVERY_MARKUP, {
      delivery_name: escapeHtml(deliveryName),
      delivery_address: addressLines.map(escapeHtml).join("<br>"),
    }) : "",
  })
}
