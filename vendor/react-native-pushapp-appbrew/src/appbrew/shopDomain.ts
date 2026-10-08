/**
 * Resolve Shopify storefront domain for product URL enrichment.
 * Prefer live App Brew config; fall back to `shopDomain` from setupPushApp.
 */

import { useAppStore } from '@gauntlet/state'
import { peekPushAppConfig } from './config'

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
  return peekPushAppConfig()?.shopDomain
}
