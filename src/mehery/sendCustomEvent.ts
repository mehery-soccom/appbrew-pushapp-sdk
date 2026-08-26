import { Dimensions, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AnalyticsEvent } from '@gauntlet/types'
import { ensureSdkReady } from './sdk'
import { APPBREW_EVENT_PREFIX, toAppBrewEventName } from './eventNames'

type EventType = 'INTERACTIVE' | 'LOG'

const LIFECYCLE_EVENTS = new Set([
  `${APPBREW_EVENT_PREFIX}app_install`,
  `${APPBREW_EVENT_PREFIX}app_launch`,
  `${APPBREW_EVENT_PREFIX}screen_view`,
  `${APPBREW_EVENT_PREFIX}page_view`,
])

const HOST_INSTALL_KEY = 'mehery_host_appbrew_install_sent'

let sendChain: Promise<boolean> = Promise.resolve(true)

async function eventTypeFor(
  name: string,
  override?: EventType
): Promise<EventType> {
  if (override) return override
  if (LIFECYCLE_EVENTS.has(name)) return 'LOG'
  const userLoggedIn =
    (await AsyncStorage.getItem('UserLoggedIn'))?.toLowerCase() === 'true'
  // INTERACTIVE is queued until /device/link. LOG still POSTs so the dashboard
  // is not empty while login recovery is rotating a poisoned session.
  return userLoggedIn ? 'INTERACTIVE' : 'LOG'
}

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

function isDuplicate(name: string, data: Record<string, unknown>): boolean {
  const items = data.items as Array<{ item_variant?: string; item_id?: string }> | undefined
  const key = String(items?.[0]?.item_variant ?? items?.[0]?.item_id ?? '')
  const now = Date.now()
  if (lastSent.name === name && lastSent.key === key && now - lastSent.at < 400) {
    return true
  }
  lastSent = { name, key, at: now }
  return false
}

/**
 * Single host path to PushApp `/v1/event` via SDK sendCustomEvent.
 * Returns true only when the SDK reported a successful POST.
 */
export async function sendMeheryCustomEvent(
  eventName: string,
  data: Record<string, unknown> = {},
  eventType?: EventType
): Promise<boolean> {
  const name = eventName.startsWith(APPBREW_EVENT_PREFIX)
    ? eventName
    : toAppBrewEventName(eventName)
  if (isDuplicate(name, data)) {
    return true
  }

  const type = await eventTypeFor(name, eventType)

  const run = async (): Promise<boolean> => {
    const sdk = await ensureSdkReady()
    const send = sdk.sendCustomEvent as (
      n: string,
      d: object,
      o?: { eventType?: EventType }
    ) => Promise<unknown>

    let result = await send(name, data, { eventType: type })
    let ok = result === true || result === undefined

    // INTERACTIVE is blocked until /device/link when login is in-flight.
    // LOG still posts the custom event so the dashboard is not empty.
    if (result === false && type === 'INTERACTIVE') {
      result = await send(name, data, { eventType: 'LOG' })
      ok = result === true
    }

    if (result === false && typeof sdk.flushPendingCustomEvents === 'function') {
      await new Promise((resolve) => setTimeout(resolve, 800))
      await sdk.flushPendingCustomEvents()
      result = await send(name, data, { eventType: 'LOG' })
      ok = result === true
    }

    if (__DEV__) {
      if (ok) {
        console.log('[Mehery] sendCustomEvent ok', name, {
          keys: Object.keys(data),
          itemCount: Array.isArray(data.items) ? data.items.length : undefined,
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

export async function sendMeheryLifecycleCustomEvents(): Promise<void> {
  await ensureMeheryCanSendCustomEvents()

  await sendMeheryCustomEvent(
    toAppBrewEventName('app_launch'),
    { source: 'host' },
    'LOG'
  )

  const already = await AsyncStorage.getItem(HOST_INSTALL_KEY)
  if (!already) {
    const { width, height } = Dimensions.get('screen')
    const ok = await sendMeheryCustomEvent(
      toAppBrewEventName(AnalyticsEvent.APP_INSTALL_IOS),
      {
        version: String(Platform.Version),
        sizeWidth: width,
        sizeHeight: height,
        platform: Platform.OS,
      },
      'LOG'
    )
    if (ok) {
      await AsyncStorage.setItem(HOST_INSTALL_KEY, '1')
    }
  }
}
