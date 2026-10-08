/**
 * Pure helpers for Shopify Checkout WebView → Gauntlet analytics → Mehery dual-send.
 * Prefer cart snapshot / pixel payload — never invent line items.
 *
 * Shopify Customer Events (web pixel) use different names than PushApp / GA4.
 * Normalize at the bridge so dual-send + host dedupe share one canonical name.
 */

import { AnalyticsEvent } from '@gauntlet/types'

/**
 * Canonical PushApp / GA4 checkout event names (Excel dual-send contract).
 * Prefer these everywhere after the bridge — not Shopify pixel names.
 */
export const PUSHAPP_CHECKOUT_EVENTS = {
  BEGIN_CHECKOUT: 'begin_checkout',
  ADD_PAYMENT_INFO: 'add_payment_info',
  ADD_SHIPPING_INFO: 'add_shipping_info',
  APPLY_COUPON: 'apply_coupon',
  REMOVE_COUPON: 'remove_coupon',
  PURCHASE: 'purchase',
} as const

/**
 * Inbound Shopify Customer Event / web-pixel names (what checkout emits).
 * Kept for matching only — always remap via {@link toPushAppCheckoutEventName}.
 */
export const SHOPIFY_PIXEL_EVENTS = {
  CHECKOUT_STARTED: 'checkout_started',
  CHECKOUT_COMPLETED: 'checkout_completed',
  PAYMENT_INFO_SUBMITTED: 'payment_info_submitted',
  SHIPPING_INFO_SUBMITTED: 'checkout_shipping_info_submitted',
  ADDRESS_INFO_SUBMITTED: 'checkout_address_info_submitted',
  DISCOUNT_CODE_APPLIED: 'checkout_discount_code_applied',
  DISCOUNT_CODE_REMOVED: 'checkout_discount_code_removed',
} as const

/**
 * Shopify pixel name → PushApp / GA4 name.
 * Unknown names pass through unchanged.
 */
export const SHOPIFY_TO_PUSHAPP_EVENT: Record<string, string> = {
  [SHOPIFY_PIXEL_EVENTS.CHECKOUT_STARTED]: PUSHAPP_CHECKOUT_EVENTS.BEGIN_CHECKOUT,
  [SHOPIFY_PIXEL_EVENTS.CHECKOUT_COMPLETED]: PUSHAPP_CHECKOUT_EVENTS.PURCHASE,
  [SHOPIFY_PIXEL_EVENTS.PAYMENT_INFO_SUBMITTED]:
    PUSHAPP_CHECKOUT_EVENTS.ADD_PAYMENT_INFO,
  [SHOPIFY_PIXEL_EVENTS.SHIPPING_INFO_SUBMITTED]:
    PUSHAPP_CHECKOUT_EVENTS.ADD_SHIPPING_INFO,
  [SHOPIFY_PIXEL_EVENTS.ADDRESS_INFO_SUBMITTED]:
    PUSHAPP_CHECKOUT_EVENTS.ADD_SHIPPING_INFO,
  [SHOPIFY_PIXEL_EVENTS.DISCOUNT_CODE_APPLIED]:
    PUSHAPP_CHECKOUT_EVENTS.APPLY_COUPON,
  [SHOPIFY_PIXEL_EVENTS.DISCOUNT_CODE_REMOVED]:
    PUSHAPP_CHECKOUT_EVENTS.REMOVE_COUPON,
}

/** @deprecated Use {@link PUSHAPP_CHECKOUT_EVENTS} / {@link SHOPIFY_PIXEL_EVENTS}. */
export const CHECKOUT_BRIDGE_EVENTS = {
  CHECKOUT_COMPLETED: SHOPIFY_PIXEL_EVENTS.CHECKOUT_COMPLETED,
  CHECKOUT_STARTED: SHOPIFY_PIXEL_EVENTS.CHECKOUT_STARTED,
  PAYMENT_INFO_SUBMITTED: SHOPIFY_PIXEL_EVENTS.PAYMENT_INFO_SUBMITTED,
  SHIPPING_INFO_SUBMITTED: SHOPIFY_PIXEL_EVENTS.SHIPPING_INFO_SUBMITTED,
  ADDRESS_INFO_SUBMITTED: SHOPIFY_PIXEL_EVENTS.ADDRESS_INFO_SUBMITTED,
  DISCOUNT_CODE_APPLIED: SHOPIFY_PIXEL_EVENTS.DISCOUNT_CODE_APPLIED,
  DISCOUNT_CODE_REMOVED: SHOPIFY_PIXEL_EVENTS.DISCOUNT_CODE_REMOVED,
} as const

/**
 * Rename a Shopify (or already-GA4) checkout event to the PushApp dual-send name.
 */
export function toPushAppCheckoutEventName(
  eventName: string | undefined | null
): string {
  const name = (eventName ?? '').trim()
  if (!name) return ''
  return SHOPIFY_TO_PUSHAPP_EVENT[name] ?? name
}

export type CartSnapshot = {
  url?: string
  value?: number
  checkout_token?: string
  sub_total?: number
  discount?: number
  currency?: string
  coupon?: string
  items?: unknown[]
  transaction_id?: string
  shopify_order_id?: string
}

/**
 * Merge WebView / pixel fields over last-known cart snapshot.
 * Pixel wins on defined keys; empty items fall back to snapshot items.
 */
export function mergeCheckoutPayloadWithCart(
  pixelOrPartial: Record<string, unknown> | null | undefined,
  cartSnapshot: CartSnapshot | null | undefined
): Record<string, unknown> {
  const snap = (cartSnapshot ?? {}) as Record<string, unknown>
  const pixel = (pixelOrPartial ?? {}) as Record<string, unknown>
  const merged: Record<string, unknown> = { ...snap }

  for (const [key, value] of Object.entries(pixel)) {
    if (value === undefined || value === null || value === '') {
      continue
    }
    merged[key] = value
  }

  const pixelItems = pixel.items
  const snapItems = snap.items
  if (
    (!Array.isArray(pixelItems) || pixelItems.length === 0) &&
    Array.isArray(snapItems) &&
    snapItems.length > 0
  ) {
    merged.items = snapItems
  }

  if (
    (merged.coupon === undefined || merged.coupon === '') &&
    typeof snap.coupon === 'string' &&
    snap.coupon
  ) {
    merged.coupon = snap.coupon
  }

  return merged
}

export type CheckoutBridgeAction =
  | { type: 'analytics'; event: AnalyticsEvent; payload: Record<string, unknown> }
  | { type: 'ignore' }

/**
 * Map a web-pixel / SEND_EVENT name to a Gauntlet analytics dual-send.
 * Accepts Shopify pixel names or already-aligned GA4 / PushApp names.
 * Purchase enrichment stays on the WebView (PURCHASE); this maps shipping + coupons + begin/payment.
 */
export function resolveCheckoutBridgeAction(
  eventName: string | undefined,
  payload: Record<string, unknown> | null | undefined,
  cartSnapshot: CartSnapshot | null | undefined
): CheckoutBridgeAction {
  const name = toPushAppCheckoutEventName(eventName)
  if (!name) {
    return { type: 'ignore' }
  }

  const merged = mergeCheckoutPayloadWithCart(payload ?? {}, cartSnapshot)

  if (
    name === PUSHAPP_CHECKOUT_EVENTS.ADD_SHIPPING_INFO ||
    name === AnalyticsEvent.ADD_SHIPPING_INFO
  ) {
    return {
      type: 'analytics',
      event: AnalyticsEvent.ADD_SHIPPING_INFO,
      payload: merged,
    }
  }

  if (
    name === PUSHAPP_CHECKOUT_EVENTS.ADD_PAYMENT_INFO ||
    name === AnalyticsEvent.ADD_PAYMENT_INFO
  ) {
    return {
      type: 'analytics',
      event: AnalyticsEvent.ADD_PAYMENT_INFO,
      payload: merged,
    }
  }

  if (
    name === PUSHAPP_CHECKOUT_EVENTS.APPLY_COUPON ||
    name === AnalyticsEvent.APPLY_COUPON
  ) {
    const coupon =
      (typeof merged.coupon === 'string' && merged.coupon) ||
      (typeof payload?.code === 'string' && payload.code) ||
      (typeof payload?.discountCode === 'string' && payload.discountCode) ||
      ''
    return {
      type: 'analytics',
      event: AnalyticsEvent.APPLY_COUPON,
      payload: {
        coupon,
        isApplicable:
          typeof payload?.isApplicable === 'boolean'
            ? payload.isApplicable
            : true,
      },
    }
  }

  if (
    name === PUSHAPP_CHECKOUT_EVENTS.REMOVE_COUPON ||
    name === AnalyticsEvent.REMOVE_COUPON
  ) {
    const coupon =
      (typeof merged.coupon === 'string' && merged.coupon) ||
      (typeof payload?.code === 'string' && payload.code) ||
      ''
    return {
      type: 'analytics',
      event: AnalyticsEvent.REMOVE_COUPON,
      payload: { coupon },
    }
  }

  if (
    name === PUSHAPP_CHECKOUT_EVENTS.BEGIN_CHECKOUT ||
    name === AnalyticsEvent.BEGIN_CHECKOUT
  ) {
    return {
      type: 'analytics',
      event: AnalyticsEvent.BEGIN_CHECKOUT,
      payload: merged,
    }
  }

  // purchase / checkout_completed stay on PaymentWebviewV4 purchase path.
  if (name === PUSHAPP_CHECKOUT_EVENTS.PURCHASE) {
    return { type: 'ignore' }
  }

  return { type: 'ignore' }
}

/** Extract coupon title from a checkout pixel payload when present. */
export function couponFromCheckoutPixel(
  payload: Record<string, unknown> | null | undefined
): string | undefined {
  if (!payload) return undefined
  if (typeof payload.coupon === 'string' && payload.coupon.trim()) {
    return payload.coupon.trim()
  }
  const apps = payload.discountApplications
  if (Array.isArray(apps)) {
    for (const app of apps) {
      if (
        app &&
        typeof app === 'object' &&
        (app as { type?: string }).type === 'DISCOUNT_CODE' &&
        typeof (app as { title?: string }).title === 'string'
      ) {
        return (app as { title: string }).title.trim()
      }
    }
  }
  return undefined
}
