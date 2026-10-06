import AsyncStorage from '@react-native-async-storage/async-storage'
import { loadMeherySdk } from './sdk'

const REGISTER_POLL_MS = 400
const REGISTER_TIMEOUT_MS = 15_000
const LINK_POLL_MS = 400
const LINK_TIMEOUT_MS = 2_000

/**
 * Immediate `/device/register` after login / logout / delink often races the
 * server. Wait this long before the first attempt and between retries.
 */
export const DEVICE_REREGISTER_DELAY_MS = 2_000
export const DEVICE_REREGISTER_MAX_ATTEMPTS = 3

const GUEST_LOGIN_RESET_KEYS = [
  'user_id',
  'UserLoggedIn',
  'contact_id',
  'mehery_last_linked_channel_id',
  'mehery_last_linked_host_root',
  'lastRegisteredState',
  'lastRegisteredToken',
  'APNStoken',
  'fcmToken',
  'isRegistered',
  'UserRegistered',
  'registered_user_id',
] as const

const LOGIN_STATE_KEYS = [
  'UserLoggedIn',
  'contact_id',
  'mehery_last_linked_channel_id',
  'mehery_last_linked_host_root',
] as const

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function isGuestRegistered(): Promise<boolean> {
  const [isRegistered, registeredUserId] = await Promise.all([
    AsyncStorage.getItem('isRegistered'),
    AsyncStorage.getItem('registered_user_id'),
  ]).then((values) => values.map((value) => value?.trim() ?? ''))

  return isRegistered === 'true' && Boolean(registeredUserId)
}

/**
 * Actively nudge `/device/register` (simulator APNs fallback lives in the SDK)
 * instead of only polling storage that may never flip.
 */
async function nudgeDeviceRegistration(): Promise<void> {
  try {
    const sdk = await loadMeherySdk()
    if (typeof sdk.ensureDeviceRegistered === 'function') {
      await sdk.ensureDeviceRegistered()
      return
    }
    if (typeof sdk.registerDeviceWithAPNS === 'function') {
      const token = (await AsyncStorage.getItem('APNStoken'))?.trim() ?? ''
      if (token) {
        await sdk.registerDeviceWithAPNS(token)
      }
    }
  } catch (e) {
    console.warn('[Mehery][linkGate] ensureDeviceRegistered nudge failed', e)
  }
}

/**
 * Bust the SDK "registration already valid" short-circuit so `/device/register`
 * actually POSTs again (needed after login link / logout delink).
 * Keeps `registered_user_id` so guest events can still send during the wait.
 * Does not clear user_id / UserLoggedIn (caller clears login keys on logout).
 */
async function bustRegisterSkipState(): Promise<void> {
  await AsyncStorage.multiRemove(['lastRegisteredState'])
}

/**
 * Wait {@link DEVICE_REREGISTER_DELAY_MS}, then force `/device/register` with
 * retries. Call after OnUserLogin and after OnUserLogOut — immediate register
 * right after those calls often fails with no retry.
 */
export async function reregisterDeviceAfterIdentityChange(
  reason: 'login' | 'logout'
): Promise<boolean> {
  if (reason === 'logout') {
    // Ensure guest attribution even if SDK OnUserLogOut was skipped / lagged.
    await AsyncStorage.removeItem('user_id')
    await AsyncStorage.removeItem('UserLoggedIn')
  }

  console.log(
    `[Mehery][linkGate] re-register after ${reason}: wait ${DEVICE_REREGISTER_DELAY_MS}ms`
  )
  await delay(DEVICE_REREGISTER_DELAY_MS)

  for (let attempt = 1; attempt <= DEVICE_REREGISTER_MAX_ATTEMPTS; attempt++) {
    try {
      await bustRegisterSkipState()
      await nudgeDeviceRegistration()
    } catch (e) {
      console.warn(
        `[Mehery][linkGate] re-register after ${reason} attempt ${attempt} threw`,
        e
      )
    }

    if (await isGuestRegistered()) {
      console.log(
        `[Mehery][linkGate] re-register after ${reason} ok (attempt ${attempt})`
      )
      try {
        const sdk = await loadMeherySdk()
        if (typeof sdk.flushPendingCustomEvents === 'function') {
          await sdk.flushPendingCustomEvents()
        }
      } catch {
        /* ignore */
      }
      return true
    }

    console.warn(
      `[Mehery][linkGate] re-register after ${reason} failed (attempt ${attempt}/${DEVICE_REREGISTER_MAX_ATTEMPTS})`
    )
    if (attempt < DEVICE_REREGISTER_MAX_ATTEMPTS) {
      await delay(DEVICE_REREGISTER_DELAY_MS)
    }
  }

  return false
}

/**
 * Prevent a stale login id from making SDK guest registration look complete,
 * then wait for both the registration flag and server-assigned guest id.
 */
export async function ensureGuestRegisteredBeforeLogin(): Promise<boolean> {
  await AsyncStorage.removeItem('user_id')

  if (await isGuestRegistered()) {
    console.log('[Mehery][linkGate] guest registration confirmed')
    return true
  }

  // Immediate register after auth churn often fails — delay, then retry nudges.
  console.log(
    `[Mehery][linkGate] guest not registered — wait ${DEVICE_REREGISTER_DELAY_MS}ms before /device/register`
  )
  await delay(DEVICE_REREGISTER_DELAY_MS)

  const startedAt = Date.now()
  let nextNudgeAt = 0
  while (Date.now() - startedAt < REGISTER_TIMEOUT_MS) {
    if (Date.now() >= nextNudgeAt) {
      await nudgeDeviceRegistration()
      nextNudgeAt = Date.now() + DEVICE_REREGISTER_DELAY_MS
    }
    if (await isGuestRegistered()) {
      console.log('[Mehery][linkGate] guest registration confirmed')
      return true
    }
    await delay(REGISTER_POLL_MS)
  }

  const registered = await isGuestRegistered()
  console.log(
    registered
      ? '[Mehery][linkGate] guest registration confirmed'
      : '[Mehery][linkGate] guest registration not confirmed'
  )
  return registered
}

/**
 * Remove prior-user login evidence. Call only when switching to a different
 * user_id — never before every OnUserLogin, or the SDK cannot skip an already
 * linked same contact (forces a fresh /device/link and looks like broken iOS linking).
 */
export async function clearLoginStateBeforeLink(): Promise<void> {
  await Promise.all(LOGIN_STATE_KEYS.map((key) => AsyncStorage.removeItem(key)))
}

/** True when AsyncStorage already has this customer linked on this device. */
export async function isSameUserAlreadyLinked(userId: string): Promise<boolean> {
  const id = userId.trim()
  if (!id) return false
  const [loggedIn, storedUserId, contactId] = await Promise.all([
    AsyncStorage.getItem('UserLoggedIn'),
    AsyncStorage.getItem('user_id'),
    AsyncStorage.getItem('contact_id'),
  ]).then((values) => values.map((value) => value?.trim() ?? ''))

  if (loggedIn !== 'true') return false
  if (storedUserId === id) return true
  // contact_id is typically `${userId}_${deviceId}` after a successful link.
  return Boolean(contactId && contactId.startsWith(`${id}_`))
}

/**
 * Clear login flags only when linking a *different* customer than last time.
 * Same-user cold start must keep UserLoggedIn so SDK same-contact skip works.
 */
export async function clearLoginStateIfSwitchingUser(
  nextUserId: string
): Promise<void> {
  const next = nextUserId.trim()
  if (!next) return
  if (await isSameUserAlreadyLinked(next)) return

  const [storedUserId, contactId] = await Promise.all([
    AsyncStorage.getItem('user_id'),
    AsyncStorage.getItem('contact_id'),
  ]).then((values) => values.map((value) => value?.trim() ?? ''))

  const hadOtherUser =
    (Boolean(storedUserId) && storedUserId !== next) ||
    (Boolean(contactId) && !contactId.startsWith(`${next}_`))

  if (hadOtherUser) {
    console.log(
      '[Mehery][linkGate] clearing prior login state (user switch)',
      { from: storedUserId || contactId, to: next }
    )
    await clearLoginStateBeforeLink()
  }
}

export async function waitForUserLoggedIn(
  timeoutMs = LINK_TIMEOUT_MS
): Promise<boolean> {
  const isLoggedIn = async () =>
    (await AsyncStorage.getItem('UserLoggedIn')) === 'true'

  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await isLoggedIn()) {
      console.log('[Mehery][linkGate] UserLoggedIn confirmed')
      return true
    }
    await delay(LINK_POLL_MS)
  }

  const loggedIn = await isLoggedIn()
  console.log(
    loggedIn
      ? '[Mehery][linkGate] UserLoggedIn confirmed'
      : '[Mehery][linkGate] UserLoggedIn timeout'
  )
  return loggedIn
}

/** Clear only Mehery guest/login state and the SDK device identity. */
export async function resetGuestRegistrationState(): Promise<void> {
  await Promise.all(
    [...GUEST_LOGIN_RESET_KEYS, 'device_id'].map((key) =>
      AsyncStorage.removeItem(key)
    )
  )
}
