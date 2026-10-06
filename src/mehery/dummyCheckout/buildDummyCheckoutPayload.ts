/**
 * Build cart-like PushApp payloads from the live Shopify cart for dummy checkout.
 */

import { getCartId, getShopifyId } from '../commerceIds'
import { buildExcelItem } from '../itemPayload'
import { resolveShopDomain } from '../shopDomain'

export type DummyCartLike = {
  id?: string | number
  webUrl?: string
  lineItems?: Array<{
    variantId?: string | number
    productId?: string | number
    productHandle?: string
    title?: string
    image?: string
    priceAfterDiscount?: string | number
    originalPrice?: string | number
    quantity?: number
    vendor?: string
    productType?: string
    sku?: string
    url?: string | null
  }>
  payment?: {
    total?: string | number
    lineItemsSubTotal?: string | number
    subTotal?: string | number
    currencyCode?: string
  }
  discount?: { code?: string }
  discountCodes?: Array<{ code?: string; applicable?: boolean } | string>
}

function adminId(id: string | number | undefined): string | undefined {
  if (id == null) return undefined
  const s = String(id)
  const m = s.match(/\/(\d+)\s*$/)
  return m ? m[1] : s
}

function resolveCoupon(cart: DummyCartLike): string | undefined {
  if (cart.discount?.code) return cart.discount.code
  const codes = cart.discountCodes
  if (!Array.isArray(codes) || !codes.length) return undefined
  const first = codes[0]
  if (typeof first === 'string') return first
  return first?.code
}

export function buildDummyCheckoutPayload(
  cart: DummyCartLike,
  extras: Record<string, unknown> = {}
): Record<string, unknown> {
  const currency = cart.payment?.currencyCode ?? 'INR'
  const value = Number(cart.payment?.total ?? 0)
  const subTotal = Number(
    cart.payment?.lineItemsSubTotal ?? cart.payment?.subTotal ?? value
  )
  const discount = Math.max(
    0,
    subTotal - Number(cart.payment?.subTotal ?? subTotal)
  )
  const coupon =
    (typeof extras.coupon === 'string' && extras.coupon) ||
    resolveCoupon(cart) ||
    undefined

  const shopDomain = resolveShopDomain()
  const items = (cart.lineItems ?? []).map((item) => {
    const price = Number(item.priceAfterDiscount ?? 0)
    const original = Number(item.originalPrice ?? price)
    return buildExcelItem({
      item_id: adminId(item.productId) ?? String(item.variantId ?? ''),
      handle: item.productHandle,
      item_name: item.title,
      item_variant: adminId(item.variantId) ?? String(item.variantId ?? ''),
      price,
      original_price: original,
      img_url: item.image,
      quantity: item.quantity ?? 1,
      item_brand: item.vendor,
      item_category: item.productType,
      sku: item.sku,
      url: item.url,
      onlineStoreUrl: item.url,
      shopDomain,
    })
  })

  const cartId = getCartId() || (cart.id != null ? String(cart.id) : undefined)
  const checkoutToken = adminId(cart.id) || cartId

  return {
    url: cart.webUrl,
    value,
    checkout_token: checkoutToken,
    sub_total: subTotal,
    discount,
    currency,
    ...(coupon ? { coupon } : {}),
    items,
    ...(cartId ? { cart_id: cartId } : {}),
    ...(getShopifyId() ? { shopify_id: getShopifyId() } : {}),
    ...extras,
  }
}
