/**
 * Dual-send push_notification_subscribed / unsubscribed when OS permission changes.
 *
 * Cold-start: await baseline BEFORE FCM requestPermission (startMehery order).
 * First-ever grant (including already-granted devices) emits subscribed once.
 * Later transitions emit subscribe/unsubscribe as permission flips.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState, Platform } from 'react-native'
import { checkNotifications, RESULTS } from 'react-native-permissions'
import { sendMeheryCustomEvent } from './sendCustomEvent'

const STORAGE_EVER_SUBSCRIBED = 'mehery_push_subscribed_emitted'

let installed = false
let baselineReady = false
let lastEnabled: boolean | null = null

async function readPushEnabled(): Promise<boolean | null> {
  try {
    const { status } = await checkNotifications()
    if (status === RESULTS.GRANTED || status === RESULTS.LIMITED) {
      return true
    }
    if (
      status === RESULTS.DENIED ||
      status === RESULTS.BLOCKED ||
      status === RESULTS.UNAVAILABLE
    ) {
      return false
    }
  } catch {
    /* ignore */
  }
  return null
}

/**
 * Pure transition rule for tests:
 * - no emit until baseline is ready
 * - no emit when next is unknown
 * - emit when next differs from baseline/last (including null → granted/denied)
 */
export function shouldEmitPushPermissionTransition(
  baselineIsReady: boolean,
  prev: boolean | null,
  next: boolean | null
): boolean {
  if (!baselineIsReady) {
    return false
  }
  if (next == null) {
    return false
  }
  return prev !== next
}

async function markEverSubscribedEmitted(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_EVER_SUBSCRIBED, '1')
  } catch {
    /* ignore */
  }
}

async function hasEverSubscribedEmitted(): Promise<boolean> {
  try {
    return Boolean(await AsyncStorage.getItem(STORAGE_EVER_SUBSCRIBED))
  } catch {
    return false
  }
}

async function emitIfChanged(): Promise<void> {
  const enabled = await readPushEnabled()
  if (
    !shouldEmitPushPermissionTransition(baselineReady, lastEnabled, enabled)
  ) {
    return
  }
  lastEnabled = enabled as boolean
  const name = enabled
    ? 'push_notification_subscribed'
    : 'push_notification_unsubscribed'
  void sendMeheryCustomEvent(name, { push_enabled: enabled }, 'LOG')
  if (enabled) {
    void markEverSubscribedEmitted()
  }
}

/**
 * Snapshot OS permission before FCM prompt. If already granted and we have
 * never dual-sent subscribed, emit once (otherwise QA never sees the event).
 */
async function establishBaseline(): Promise<void> {
  const enabled = await readPushEnabled()
  lastEnabled = enabled
  baselineReady = true

  if (enabled === true && !(await hasEverSubscribedEmitted())) {
    void sendMeheryCustomEvent(
      'push_notification_subscribed',
      { push_enabled: true },
      'LOG'
    )
    await markEverSubscribedEmitted()
  }
}

/** Awaitable so startMehery can baseline before messaging().requestPermission(). */
export async function installMeheryPushPermissionTracking(): Promise<void> {
  if (installed) {
    return
  }
  installed = true

  await establishBaseline()

  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    // Re-check after permission prompt may complete.
    setTimeout(() => {
      void emitIfChanged()
    }, 5000)
  }

  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void emitIfChanged()
    }
  })
}

/** @internal test helpers */
export function __resetMeheryPushPermissionTrackingForTests(): void {
  installed = false
  baselineReady = false
  lastEnabled = null
}

export async function __emitPushPermissionIfChangedForTests(): Promise<void> {
  return emitIfChanged()
}

export async function __establishPushBaselineForTests(): Promise<void> {
  return establishBaseline()
}

export function __getPushPermissionStateForTests(): {
  baselineReady: boolean
  lastEnabled: boolean | null
} {
  return { baselineReady, lastEnabled }
}

export { STORAGE_EVER_SUBSCRIBED }
