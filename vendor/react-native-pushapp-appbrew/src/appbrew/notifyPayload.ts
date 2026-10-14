/**
 * Pure helpers for notify_back_in_stock PushApp payloads.
 * Reuses wishlist Excel item shape; skip empty shells (no handle / variant).
 */

import { wishlistPayloadFromProduct } from './wishlistPayload'
import { ensureCommerceCurrencyAndValue } from './itemPayload'
import { resolveShopDomain } from './shopDomain'
import { sendMeheryCustomEvent } from './sendCustomEvent'
import { useAppStore } from '@gauntlet/state'

function currencyCode(): string | undefined {
  try {
    return useAppStore.getState().localization.data.selectedCountry?.currency
      ?.isoCode
  } catch {
    return undefined
  }
}

export function notifyPayloadFromProduct(
  productData: any,
  options: { shopDomain?: string; currency?: string } = {}
): Record<string, unknown> | null {
  if (!productData?.handle) {
    return null
  }
  const variantId =
    productData.selectedVariantId ?? productData.defaultVariantId
  if (!variantId) {
    return null
  }
  const currency = options.currency ?? currencyCode()
  const payload = wishlistPayloadFromProduct(productData, {
    shopDomain: options.shopDomain ?? resolveShopDomain(),
    currency,
  })
  if (!payload) {
    return null
  }
  const items = payload.items as unknown[] | undefined
  if (!Array.isArray(items) || items.length === 0) {
    return null
  }
  return ensureCommerceCurrencyAndValue(payload, currency)
}

export function emitNotifyBackInStockFromProduct(productData: any): boolean {
  const payload = notifyPayloadFromProduct(productData)
  if (!payload) {
    return false
  }
  void sendMeheryCustomEvent('notify_back_in_stock', payload, 'INTERACTIVE')
  return true
}
