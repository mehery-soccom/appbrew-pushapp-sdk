/**
 * Pure helpers for add_to_wishlist / remove_from_wishlist / notify_back_in_stock
 * PushApp payloads. Excel contract:
 *   currency, value, items[] → item_id, handle, item_name, item_variant,
 *   price, original_price, discount, url, sku, item_category, item_brand, img_url
 *
 * Headless catalogs often omit onlineStoreUrl — never block the event on that.
 */

import { buildExcelItem, hasExcelItemIdentity, resolveProductUrl } from './itemPayload'

export { resolveProductUrl }

export type WishlistPayloadOptions = {
  shopDomain?: string
  currency?: string
}

/**
 * Excel item keys required on add_to_wishlist / remove_from_wishlist /
 * notify_back_in_stock (nested under `items[]`).
 */
export const WISHLIST_EXCEL_ITEM_KEYS = [
  'item_id',
  'handle',
  'item_name',
  'item_variant',
  'price',
  'original_price',
  'discount',
  'url',
  'sku',
  'item_category',
  'item_brand',
  'img_url',
] as const

export function wishlistPayloadFromProduct(
  productData: any,
  options: WishlistPayloadOptions = {}
): Record<string, unknown> | null {
  const variantId =
    productData?.selectedVariantId ?? productData?.defaultVariantId
  // Prefer variant id as item_id (same as cart Excel / GA4); fall back to product id.
  const itemId = variantId ?? productData?.id
  if (
    !hasExcelItemIdentity({
      item_id: itemId,
      handle: productData?.handle,
    })
  ) {
    return null
  }
  const variant = variantId
    ? productData?.variants?.items?.[variantId]
    : undefined
  const price = Number(variant?.price?.amount ?? variant?.price ?? 0)
  const original = Number(
    variant?.compareAtPrice?.amount ?? variant?.compareAtPrice ?? price
  )
  const img =
    variant?.image?.url ??
    productData?.images?.items?.[0]?.url ??
    (Array.isArray(productData?.images) ? productData.images[0] : undefined)

  const currency =
    options.currency ??
    (typeof variant?.price?.currencyCode === 'string'
      ? variant.price.currencyCode
      : undefined)

  return {
    currency,
    value: price,
    items: [
      buildExcelItem({
        item_id: itemId,
        handle: productData?.handle,
        item_name: productData?.title,
        item_variant: variantId,
        price,
        original_price: original,
        img_url: typeof img === 'string' ? img : img?.url,
        sku: variant?.sku,
        item_brand: productData?.vendor,
        item_category: productData?.productType,
        onlineStoreUrl: productData?.onlineStoreUrl,
        shopDomain: options.shopDomain,
      }),
    ],
  }
}
