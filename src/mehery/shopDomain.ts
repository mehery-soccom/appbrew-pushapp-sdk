/**
 * Resolve Shopify storefront domain for product URL enrichment.
 * Prefer live config; fall back to the Natori demo shop used by catalogFallback.
 */

import { useAppStore } from '@gauntlet/state'

/** Same demo shop as catalogFallback when headless config omits domain. */
export const MEHERY_FALLBACK_SHOP_DOMAIN = 'natori-appbrew.myshopify.com'

export function resolveShopDomain(): string | undefined {
  try {
    const data = useAppStore.getState().config.data as
      | {
          integrations?: { shopify?: { domain?: string } }
          store?: { domain?: string; shopifyDomain?: string }
        }
      | undefined
    const fromConfig =
      data?.integrations?.shopify?.domain ||
      data?.store?.shopifyDomain ||
      data?.store?.domain
    const trimmed = typeof fromConfig === 'string' ? fromConfig.trim() : ''
    if (trimmed) {
      return trimmed.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
    }
  } catch {
    /* ignore */
  }
  return MEHERY_FALLBACK_SHOP_DOMAIN
}
