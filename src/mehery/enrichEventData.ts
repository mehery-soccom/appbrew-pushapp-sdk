/**
 * Inject shopify_id (always) and cart_id (when available) onto Mehery event payloads.
 */

export type EnrichEventOptions = {
  /** Override cart id (e.g. snapshot at purchase time). */
  cartId?: string | null
  /** Override shopify_id. */
  shopifyId?: string | null
  /** When false, never attach cart_id even if available. Default true. */
  includeCartId?: boolean
}

function resolveIds(): { cartId?: string; shopifyId: string } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ids = require('./commerceIds') as {
      getCartId: () => string | undefined
      getShopifyId: () => string
      sanitizeMeheryUserId: (raw: string) => string
    }
    return { cartId: ids.getCartId(), shopifyId: ids.getShopifyId() }
  } catch {
    return { shopifyId: '' }
  }
}

function usableShopifyId(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { sanitizeMeheryUserId } = require('./commerceIds') as {
      sanitizeMeheryUserId: (raw: string) => string
    }
    return sanitizeMeheryUserId(value)
  } catch {
    const trimmed = value.trim()
    if (!trimmed || /^https?:\/\//i.test(trimmed) || /myshopify\.com/i.test(trimmed)) {
      return ''
    }
    return trimmed
  }
}

/**
 * Merge commerce IDs into event data. Does not overwrite non-empty caller values.
 */
export function enrichEventData(
  data: Record<string, unknown> = {},
  options: EnrichEventOptions = {}
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data }
  const resolved = resolveIds()

  const shopifyId =
    usableShopifyId(options.shopifyId) ||
    usableShopifyId(out.shopify_id) ||
    usableShopifyId(resolved.shopifyId)
  if (shopifyId) {
    out.shopify_id = shopifyId
  } else {
    delete out.shopify_id
  }

  const includeCartId = options.includeCartId !== false
  if (includeCartId) {
    const existing =
      typeof out.cart_id === 'string' && String(out.cart_id).trim()
        ? String(out.cart_id).trim()
        : ''
    if (!existing) {
      const fromOpt =
        typeof options.cartId === 'string' && options.cartId.trim()
          ? options.cartId.trim()
          : ''
      const cartId = fromOpt || resolved.cartId
      if (cartId) {
        out.cart_id = cartId
      }
    }
  }

  return out
}
