import { resolveProductUrl } from './itemPayload'

/**
 * Mirrors installMeheryProductUrlEnrichment decision logic without zustand.
 */
export function needsOnlineStoreUrlEnrichment(product: {
  onlineStoreUrl?: string | null
}): boolean {
  return !String(product.onlineStoreUrl ?? '').trim()
}

export function enrichOnlineStoreUrl(
  product: { handle?: string; onlineStoreUrl?: string | null },
  shopDomain?: string
): string | undefined {
  if (!needsOnlineStoreUrlEnrichment(product)) {
    return product.onlineStoreUrl?.trim() || undefined
  }
  return resolveProductUrl({
    handle: product.handle,
    shopDomain,
  })
}
