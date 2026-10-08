/**
 * Shared Excel / GA4 `items[]` shape for PushApp dual-send.
 * Prefer this over ad-hoc item objects in cart / wishlist / analytics enrich.
 */

export function resolveProductUrl(opts: {
  onlineStoreUrl?: string | null
  handle?: string
  shopDomain?: string
}): string | undefined {
  const direct = opts.onlineStoreUrl?.trim()
  if (direct) {
    return direct
  }
  const handle = opts.handle?.trim()
  const rawDomain = opts.shopDomain?.trim()
  if (!handle || !rawDomain) {
    return undefined
  }
  const domain = rawDomain.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
  if (!domain) {
    return undefined
  }
  return `https://${domain}/products/${handle}`
}

function omitEmpty(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') {
      continue
    }
    out[k] = v
  }
  return out
}

export type ExcelItemFields = {
  item_id?: string
  handle?: string
  item_name?: string
  item_variant?: string
  price?: number
  original_price?: number
  discount?: number
  sku?: string
  quantity?: number
  img_url?: string | null
  item_brand?: string | null
  item_category?: string | null
  url?: string | null
  onlineStoreUrl?: string | null
  shopDomain?: string
}

/** True when the item has a stable GA4 identity (handle or item_id). */
export function hasExcelItemIdentity(fields: {
  item_id?: string | number | null
  handle?: string | null
}): boolean {
  const id =
    fields.item_id != null && String(fields.item_id).trim()
      ? String(fields.item_id).trim()
      : ''
  const handle =
    typeof fields.handle === 'string' && fields.handle.trim()
      ? fields.handle.trim()
      : ''
  return Boolean(id || handle)
}

/**
 * Gauntlet `filterParams` turns `items: []` into `items: {}`. Normalize to an
 * array (possibly empty) so Mehery never POSTs a bare object.
 */
export function normalizeAnalyticsItems(
  data: Record<string, unknown>
): Record<string, unknown> {
  if (!('items' in data)) {
    return data
  }
  const raw = data.items
  if (Array.isArray(raw)) {
    const items = raw.filter(
      (item) =>
        item &&
        typeof item === 'object' &&
        hasExcelItemIdentity(item as { item_id?: string; handle?: string })
    )
    return { ...data, items }
  }
  // `{}` or other non-array → empty list (callers may skip POST).
  return { ...data, items: [] }
}

/** Events that must not POST without at least one identified item. */
export const COMMERCE_EVENTS_REQUIRING_ITEMS = new Set([
  'view_item',
  'add_to_cart',
  'remove_from_cart',
  'add_to_wishlist',
  'remove_from_wishlist',
  'notify_back_in_stock',
])

export function hasUsableCommerceItems(
  data: Record<string, unknown>
): boolean {
  const items = data.items
  return (
    Array.isArray(items) &&
    items.some(
      (item) =>
        item &&
        typeof item === 'object' &&
        hasExcelItemIdentity(item as { item_id?: string; handle?: string })
    )
  )
}

/** Build one Excel item row; omits empty strings / null / undefined. */
export function buildExcelItem(
  fields: ExcelItemFields
): Record<string, unknown> {
  const price = Number(fields.price ?? 0)
  const original = Number(
    fields.original_price != null ? fields.original_price : price
  )
  const url =
    (typeof fields.url === 'string' && fields.url.trim()) ||
    resolveProductUrl({
      onlineStoreUrl: fields.onlineStoreUrl,
      handle: fields.handle,
      shopDomain: fields.shopDomain,
    })

  return omitEmpty({
    item_id: fields.item_id,
    handle: fields.handle,
    item_name: fields.item_name,
    item_variant: fields.item_variant,
    price,
    original_price: original,
    discount:
      fields.discount != null
        ? fields.discount
        : original > price
        ? original - price
        : 0,
    sku: fields.sku,
    quantity: fields.quantity,
    img_url: fields.img_url,
    item_brand: fields.item_brand,
    item_category: fields.item_category,
    ...(url ? { url } : {}),
  })
}

export type CatalogProductLike = {
  id?: string
  handle?: string
  title?: string
  vendor?: string | null
  productType?: string | null
  onlineStoreUrl?: string | null
  selectedVariantId?: string
  defaultVariantId?: string
  images?: { items?: Array<{ url?: string }> } | string[] | Array<{ url?: string }>
  variants?: {
    items?: Record<
      string,
      {
        sku?: string
        price?: { amount?: string | number } | number
        compareAtPrice?: { amount?: string | number } | number
        image?: { url?: string }
      }
    >
  }
}

function firstCatalogImage(catalog?: CatalogProductLike | null): string | undefined {
  if (!catalog?.images) {
    return undefined
  }
  if (Array.isArray(catalog.images)) {
    const first = catalog.images[0]
    if (typeof first === 'string' && first) {
      return first
    }
    if (first && typeof first === 'object' && typeof first.url === 'string') {
      return first.url
    }
    return undefined
  }
  const url = catalog.images.items?.[0]?.url
  return typeof url === 'string' && url ? url : undefined
}

/**
 * Rebuild one analytics / view_item row via `buildExcelItem` (not enrich-only),
 * filling url / brand / category / img from the item and optional catalog product.
 */
export function rebuildAnalyticsItem(
  item: Record<string, unknown>,
  shopDomain?: string,
  catalog?: CatalogProductLike | null
): Record<string, unknown> {
  const handle =
    (typeof item.handle === 'string' && item.handle) ||
    (typeof item.productHandle === 'string' && item.productHandle) ||
    (typeof catalog?.handle === 'string' && catalog.handle) ||
    undefined

  const variantId =
    (typeof item.item_variant === 'string' && item.item_variant) ||
    (typeof item.variant_id === 'string' && item.variant_id) ||
    (typeof item.variantId === 'string' && item.variantId) ||
    catalog?.selectedVariantId ||
    catalog?.defaultVariantId ||
    undefined

  const variant =
    variantId && catalog?.variants?.items
      ? catalog.variants.items[variantId]
      : undefined

  const priceFromCatalog =
    variant?.price != null
      ? Number(
          typeof variant.price === 'object'
            ? variant.price.amount
            : variant.price
        )
      : undefined
  const originalFromCatalog =
    variant?.compareAtPrice != null
      ? Number(
          typeof variant.compareAtPrice === 'object'
            ? variant.compareAtPrice.amount
            : variant.compareAtPrice
        )
      : undefined

  const rebuilt = buildExcelItem({
    item_id:
      (typeof item.item_id === 'string' && item.item_id) ||
      (typeof item.id === 'string' && item.id) ||
      (item.item_id != null ? String(item.item_id) : undefined) ||
      (item.id != null ? String(item.id) : undefined) ||
      (catalog?.id != null ? String(catalog.id) : undefined) ||
      variantId,
    handle,
    item_name:
      (typeof item.item_name === 'string' && item.item_name) ||
      (typeof item.name === 'string' && item.name) ||
      (typeof item.title === 'string' && item.title) ||
      catalog?.title ||
      undefined,
    item_variant: variantId,
    price:
      typeof item.price === 'number'
        ? item.price
        : item.price != null
        ? Number(item.price)
        : priceFromCatalog,
    original_price:
      typeof item.original_price === 'number'
        ? item.original_price
        : item.original_price != null
        ? Number(item.original_price)
        : originalFromCatalog,
    discount:
      typeof item.discount === 'number'
        ? item.discount
        : item.discount != null
        ? Number(item.discount)
        : undefined,
    sku:
      (typeof item.sku === 'string' && item.sku) ||
      (typeof variant?.sku === 'string' ? variant.sku : undefined),
    quantity:
      typeof item.quantity === 'number'
        ? item.quantity
        : item.quantity != null
        ? Number(item.quantity)
        : undefined,
    img_url:
      (typeof item.img_url === 'string' && item.img_url) ||
      (typeof item.image === 'string' && item.image) ||
      (typeof item.image_url === 'string' && item.image_url) ||
      (item.image &&
      typeof item.image === 'object' &&
      typeof (item.image as { url?: string }).url === 'string'
        ? (item.image as { url: string }).url
        : undefined) ||
      variant?.image?.url ||
      firstCatalogImage(catalog),
    item_brand:
      (typeof item.item_brand === 'string' && item.item_brand) ||
      (typeof item.brand === 'string' && item.brand) ||
      (typeof item.vendor === 'string' && item.vendor) ||
      (typeof item.itemBrand === 'string' && item.itemBrand) ||
      catalog?.vendor ||
      undefined,
    item_category:
      (typeof item.item_category === 'string' && item.item_category) ||
      (typeof item.categories === 'string' && item.categories) ||
      (typeof item.product_type === 'string' && item.product_type) ||
      (typeof item.productType === 'string' && item.productType) ||
      (typeof item.itemCategory === 'string' && item.itemCategory) ||
      catalog?.productType ||
      undefined,
    url: typeof item.url === 'string' ? item.url : undefined,
    onlineStoreUrl:
      (typeof item.onlineStoreUrl === 'string' && item.onlineStoreUrl) ||
      catalog?.onlineStoreUrl ||
      undefined,
    shopDomain,
  })

  // Preserve unknown analytics keys; Excel shape from rebuild wins on overlap.
  return enrichAnalyticsItem({ ...item, ...rebuilt }, shopDomain)
}

/**
 * Fill missing Excel keys on an analytics / cart item without dropping
 * unknown fields the tracker already forwarded.
 */
export function enrichAnalyticsItem(
  item: Record<string, unknown>,
  shopDomain?: string
): Record<string, unknown> {
  const handle =
    typeof item.handle === 'string'
      ? item.handle
      : typeof item.productHandle === 'string'
      ? item.productHandle
      : undefined
  const existingUrl =
    (typeof item.url === 'string' && item.url.trim()) ||
    (typeof item.onlineStoreUrl === 'string' && item.onlineStoreUrl.trim()) ||
    undefined
  const url =
    existingUrl ||
    resolveProductUrl({
      onlineStoreUrl:
        typeof item.onlineStoreUrl === 'string' ? item.onlineStoreUrl : undefined,
      handle,
      shopDomain,
    })

  const item_brand =
    (typeof item.item_brand === 'string' && item.item_brand) ||
    (typeof item.brand === 'string' && item.brand) ||
    (typeof item.vendor === 'string' && item.vendor) ||
    (typeof item.itemBrand === 'string' && item.itemBrand) ||
    undefined

  const item_category =
    (typeof item.item_category === 'string' && item.item_category) ||
    (typeof item.categories === 'string' && item.categories) ||
    (typeof item.product_type === 'string' && item.product_type) ||
    (typeof item.productType === 'string' && item.productType) ||
    (typeof item.itemCategory === 'string' && item.itemCategory) ||
    undefined

  const img_url =
    (typeof item.img_url === 'string' && item.img_url) ||
    (typeof item.image === 'string' && item.image) ||
    (typeof item.image_url === 'string' && item.image_url) ||
    (item.image &&
    typeof item.image === 'object' &&
    typeof (item.image as { url?: string }).url === 'string'
      ? (item.image as { url: string }).url
      : undefined)

  return omitEmpty({
    ...item,
    ...(handle && !item.handle ? { handle } : {}),
    ...(url ? { url } : {}),
    ...(item_brand ? { item_brand } : {}),
    ...(item_category ? { item_category } : {}),
    ...(img_url ? { img_url } : {}),
  })
}

/**
 * Fill top-level `currency` / `value` for commerce events when Gauntlet or
 * a sparse press path omitted them. `value` = sum of (price * quantity).
 */
export function ensureCommerceCurrencyAndValue(
  data: Record<string, unknown>,
  fallbackCurrency?: string
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data }
  const currency =
    (typeof out.currency === 'string' && out.currency.trim()) ||
    (typeof fallbackCurrency === 'string' && fallbackCurrency.trim()) ||
    undefined
  if (currency) {
    out.currency = currency
  }

  if (out.value == null || out.value === '') {
    const items = out.items
    if (Array.isArray(items)) {
      out.value = items.reduce((sum: number, raw) => {
        if (!raw || typeof raw !== 'object') {
          return sum
        }
        const item = raw as { price?: unknown; quantity?: unknown }
        const price = Number(item.price ?? 0)
        const qty = Number(item.quantity ?? 1)
        return sum + price * (Number.isFinite(qty) && qty > 0 ? qty : 1)
      }, 0)
    }
  }
  return out
}

/** Fill top-level list/collection `url` when only handle is present. */
export function enrichListUrl(
  data: Record<string, unknown>,
  shopDomain?: string
): Record<string, unknown> {
  const existing =
    typeof data.url === 'string' && data.url.trim() ? data.url.trim() : undefined
  if (existing) {
    return data
  }
  const handle =
    (typeof data.handle === 'string' && data.handle.trim()) ||
    (typeof data.item_list_id === 'string' && data.item_list_id.trim()) ||
    undefined
  if (!handle || !shopDomain) {
    return data
  }
  const domain = shopDomain.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
  if (!domain) {
    return data
  }
  const isCollection =
    typeof data.item_list_id === 'string' ||
    typeof data.item_list_name === 'string'
  const path = isCollection ? 'collections' : 'products'
  return { ...data, url: `https://${domain}/${path}/${handle}` }
}

export type CartLineItemLike = {
  variantId?: string
  title?: string
  image?: string
  priceAfterDiscount?: string
  originalPrice?: string | null
  productHandle?: string
  quantity?: number
  vendor?: string
  productType?: string
  sku?: string
  /** Shopify cart mapper uses `url` (onlineStoreUrl). */
  url?: string | null
  onlineStoreUrl?: string | null
}

function withCartCommerceIds(
  payload: Record<string, unknown>,
  options: { cartId?: string; shopDomain?: string } = {}
): Record<string, unknown> {
  let cart_id = options.cartId?.trim() || ''
  let shopify_id = ''
  try {
    // Lazy: avoid pulling @gauntlet/state into pure itemPayload Jest suites.
    // shopDomain is only for product URLs. shopify_id is the Mehery user id.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ids = require('./commerceIds') as {
      getCartId: () => string | undefined
      getShopifyId: () => string
    }
    if (!cart_id) {
      cart_id = ids.getCartId() || ''
    }
    shopify_id = ids.getShopifyId()
  } catch {
    /* ignore */
  }
  return {
    ...payload,
    ...(cart_id ? { cart_id } : {}),
    ...(shopify_id ? { shopify_id } : {}),
  }
}

export function cartPayloadFromLineItem(
  item: CartLineItemLike,
  options: { currency?: string; shopDomain?: string; cartId?: string } = {}
): Record<string, unknown> | null {
  if (!hasExcelItemIdentity({ item_id: item.variantId, handle: item.productHandle })) {
    return null
  }
  const price = Number(item.priceAfterDiscount ?? 0)
  const original = Number(item.originalPrice ?? price)
  return withCartCommerceIds(
    {
      currency: options.currency,
      value: price,
      items: [
        buildExcelItem({
          item_id: item.variantId,
          handle: item.productHandle,
          item_name: item.title,
          item_variant: item.variantId,
          price,
          original_price: original,
          img_url: item.image,
          quantity: item.quantity ?? 1,
          item_brand: item.vendor,
          item_category: item.productType,
          sku: item.sku,
          url: item.url,
          onlineStoreUrl: item.onlineStoreUrl ?? item.url,
          shopDomain: options.shopDomain,
        }),
      ],
    },
    options
  )
}

export function cartPayloadFromProduct(
  productData: any,
  options: { currency?: string; shopDomain?: string; cartId?: string } = {}
): Record<string, unknown> | null {
  const variantId =
    productData?.selectedVariantId ?? productData?.defaultVariantId
  if (
    !hasExcelItemIdentity({
      item_id: variantId ?? productData?.id,
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
    productData?.images?.[0]

  return withCartCommerceIds(
    {
      currency: options.currency ?? variant?.price?.currencyCode,
      value: price,
      items: [
        buildExcelItem({
          item_id: variantId,
          handle: productData?.handle,
          item_name: productData?.title,
          item_variant: variantId,
          price,
          original_price: original,
          img_url: img,
          sku: variant?.sku,
          quantity: productData?.lineItem?.quantity ?? 1,
          item_brand: productData?.vendor,
          item_category: productData?.productType,
          onlineStoreUrl: productData?.onlineStoreUrl,
          shopDomain: options.shopDomain,
        }),
      ],
    },
    options
  )
}
