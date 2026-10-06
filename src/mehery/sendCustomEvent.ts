import { Dimensions, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import DeviceInfo from 'react-native-device-info'
import { ensureSdkReady } from './sdk'
import { toGa4EventName } from './eventNames'
import {
  HOST_INSTALL_STORAGE_KEY,
  buildAppInstallPayload,
  lifecycleEventsToSend,
} from './lifecycleEvents'
import {
  COMMERCE_EVENTS_REQUIRING_ITEMS,
  hasUsableCommerceItems,
  normalizeAnalyticsItems,
} from './itemPayload'
import { enrichEventData } from './enrichEventData'
import {
  fetchMeheryUserId,
  isWebUrlOrShopDomain,
  sanitizeMeheryUserId,
} from './commerceIds'

type EventType = 'INTERACTIVE' | 'LOG'

let sendChain: Promise<boolean> = Promise.resolve(true)

async function waitForEventUserId(timeoutMs = 20_000): Promise<boolean> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const [registered, login] = await Promise.all([
      AsyncStorage.getItem('registered_user_id'),
      AsyncStorage.getItem('user_id'),
    ])
    if (registered?.trim() || login?.trim()) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  return false
}

/**
 * Wait until `/device/register` has a user id so sendCustomEvent can POST
 * `/v1/event` instead of sitting in the in-memory pending queue.
 */
export async function ensureMeheryCanSendCustomEvents(): Promise<boolean> {
  const sdk = await ensureSdkReady()
  const hasId = await waitForEventUserId(20_000)
  if (!hasId) {
    console.warn(
      '[Mehery] No registered_user_id yet — custom events will queue until /device/register succeeds'
    )
  }
  if (typeof sdk.flushPendingCustomEvents === 'function') {
    await sdk.flushPendingCustomEvents()
  }
  return hasId
}

let lastSent = { name: '', key: '', at: 0 }

/** Exported for unit tests — reset between cases. */
export function resetMeheryCustomEventDedupeForTests(): void {
  lastSent = { name: '', key: '', at: 0 }
}

function dedupeKey(name: string, data: Record<string, unknown>): string {
  // Identity profile events: include name/phone so a real name edit after a
  // same-email skip spam within 400ms is not dropped.
  if (name === 'updateUserProfile' || name === 'update_user_profile') {
    return [
      typeof data.name === 'string' ? data.name : '',
      typeof data.email === 'string' ? data.email : '',
      typeof data.phone === 'string' ? data.phone : '',
    ].join('|')
  }

  // Track-order / confirmation UI: keep distinct clicks (advance vs refund vs back).
  if (
    name === 'order_click' ||
    name === 'advance_order_status' ||
    name === 'request_refund' ||
    name === 'cancel_refund' ||
    name === 'view_order' ||
    name === 'refund'
  ) {
    return [
      typeof data.transaction_id === 'string' ? data.transaction_id : '',
      typeof data.action === 'string' ? data.action : '',
      typeof data.click_label === 'string' ? data.click_label : '',
      typeof data.reason === 'string' ? data.reason : '',
      typeof data.to_status === 'string' ? data.to_status : '',
    ].join('|')
  }

  const items = data.items as
    | Array<{ item_variant?: string; item_id?: string }>
    | undefined
  return String(
    items?.[0]?.item_variant ??
      items?.[0]?.item_id ??
      data.search_term ??
      data.screen_name ??
      data.compare ??
      data.coupon ??
      data.transaction_id ??
      data.user_id ??
      data.email ??
      ''
  )
}

function isDuplicate(name: string, data: Record<string, unknown>): boolean {
  const key = dedupeKey(name, data)
  const now = Date.now()
  // Cart press interceptor + Gauntlet analytics often fire ~400–500ms apart.
  const windowMs =
    name === 'add_to_cart' ||
    name === 'remove_from_cart' ||
    name === 'add_to_wishlist' ||
    name === 'remove_from_wishlist' ||
    name === 'view_item' ||
    name === 'notify_back_in_stock' ||
    name === 'begin_checkout'
      ? 1000
      : 400
  if (lastSent.name === name && now - lastSent.at < windowMs) {
    if (lastSent.key === key) {
      return true
    }
    // Prefer rich payload: drop empty-items follow-up after a rich press send.
    if (!key && lastSent.key) {
      return true
    }
    // Allow rich to replace a prior empty key in the same window.
    if (key && !lastSent.key) {
      lastSent = { name, key, at: now }
      return false
    }
  }
  lastSent = { name, key, at: now }
  return false
}

/**
 * Single host path to PushApp `/v1/event` via SDK sendCustomEvent.
 * Defaults to LOG so Event Analytics POSTs without requiring /device/link
 * and without scheduling poll checks. Pass INTERACTIVE only for poll-driving UX.
 * Returns true only when the SDK reported a successful POST (`true`).
 */
export async function sendMeheryCustomEvent(
  eventName: string,
  data: Record<string, unknown> = {},
  eventType: EventType = 'LOG'
): Promise<boolean> {
  const name = toGa4EventName(eventName)
  const meheryUserId = await fetchMeheryUserId()
  const normalized = enrichEventData(normalizeAnalyticsItems({ ...data }))
  const currentShopifyId =
    typeof normalized.shopify_id === 'string' ? normalized.shopify_id.trim() : ''
  if (meheryUserId && (!currentShopifyId || isWebUrlOrShopDomain(currentShopifyId))) {
    normalized.shopify_id = meheryUserId
  } else if (currentShopifyId) {
    const cleaned = sanitizeMeheryUserId(currentShopifyId)
    if (cleaned) {
      normalized.shopify_id = cleaned
    } else if (meheryUserId) {
      normalized.shopify_id = meheryUserId
    } else {
      delete normalized.shopify_id
    }
  }
  if (
    COMMERCE_EVENTS_REQUIRING_ITEMS.has(name) &&
    !hasUsableCommerceItems(normalized)
  ) {
    return false
  }
  if (isDuplicate(name, normalized)) {
    return true
  }

  const run = async (): Promise<boolean> => {
    const sdk = await ensureSdkReady()
    const send = sdk.sendCustomEvent as (
      n: string,
      d: object,
      o?: { eventType?: EventType }
    ) => Promise<unknown>

    let result = await send(name, normalized, { eventType })
    let ok = result === true

    if (!ok && typeof sdk.flushPendingCustomEvents === 'function') {
      await new Promise((resolve) => setTimeout(resolve, 800))
      await sdk.flushPendingCustomEvents()
      result = await send(name, normalized, { eventType: 'LOG' })
      ok = result === true
    }

    if (__DEV__) {
      if (ok) {
        console.log('[Mehery] sendCustomEvent ok', name, {
          keys: Object.keys(normalized),
          cart_id: normalized.cart_id,
          shopify_id: normalized.shopify_id,
          itemCount: Array.isArray(normalized.items)
            ? normalized.items.length
            : undefined,
        })
      } else {
        console.warn(
          '[Mehery] sendCustomEvent did not POST (queued or failed)',
          name
        )
      }
    }
    return ok
  }

  sendChain = sendChain.then(run, run)
  return sendChain
}

/**
 * After initSdk + register: app_install (once), app_launch, app_open.
 * app_open is host-sent here because SDK OnAppOpen only runs after login link.
 */
export async function sendMeheryLifecycleCustomEvents(): Promise<void> {
  await ensureMeheryCanSendCustomEvents()

  const already = await AsyncStorage.getItem(HOST_INSTALL_STORAGE_KEY)
  const { width, height } = Dimensions.get('screen')
  const installPayload = buildAppInstallPayload({
    version: DeviceInfo.getVersion() || 'unknown',
    sizeWidth: width,
    sizeHeight: height,
    platform: Platform.OS,
  })

  const plan = lifecycleEventsToSend({
    installAlreadySent: Boolean(already),
    installPayload,
  })

  for (const event of plan) {
    const ok = await sendMeheryCustomEvent(event.name, event.data, event.eventType)
    if (event.name === 'app_install' && ok) {
      await AsyncStorage.setItem(HOST_INSTALL_STORAGE_KEY, '1')
    }
  }
}
