import { NativeModules, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAppStore } from '@gauntlet/state'
import { registerMeheryTracker } from './MeheryTracker'
import { bootstrapMeherySdk } from './bootstrap'
import { loadMeherySdk } from './sdk'
import { sendMeheryLifecycleCustomEvents } from './sendCustomEvent'
import { installMeheryCartPressTracking } from './cartPressEvents'
import { installMeheryWishlistPressTracking } from './wishlistPressEvents'
import { installMeheryNotifyPressTracking } from './notifyPressEvents'
import { installMeheryProductUrlEnrichment } from './productUrlEnrichment'
import { installMeherySearchTracking } from './searchEvents'
import { recoverFromFailedDeviceLink } from './deviceLinkRepair'
import { wireMeheryIdentityListeners } from './identityListeners'
import { ensureMeheryChannelPinned } from './channelPin'
import {
  isPoisonedSessionId,
  rotateStalePushAppDeviceIfNeeded,
} from './sessionGuard'
import { installMeherySessionKeepAlive } from './sessionKeepAlive'
import { installMeheryPushPermissionTracking } from './pushPermissionEvents'

/**
 * `react-native-push-notification` (Mehery peer) imports
 * `@react-native-community/push-notification-ios`, which throws at module load if
 * `NativeModules.RNCPushNotificationIOS` is null (pod not linked / stale binary).
 */
function assertIosPushNativeReady(): void {
  if (Platform.OS !== 'ios') {
    return
  }
  if (!NativeModules.RNCPushNotificationIOS) {
    throw new Error(
      '[Mehery] RNCPushNotificationIOS native module missing — rebuild iOS after pod install'
    )
  }
}

/**
 * Host entry for Mehery after App mount (see App.tsx).
 * Must not be statically imported from index.js evaluate path.
 *
 * Order matters for login races:
 * 1. Register + init MeheryTracker first so AnalyticsProvider.setUserDetails
 *    during bootstrap is queued / awaits ensureSdkReady (not dropped).
 * 2. Await bootstrap (initSdk + waitForSdkReady).
 * 3. Replay current user from the store — analytics subscribe does not
 *    fireImmediately, so already-logged-in / early login would otherwise miss
 *    OnUserLogin permanently.
 */
let startPromise: Promise<void> | null = null

export async function startMehery(): Promise<void> {
  if (!startPromise) {
    startPromise = runStartMehery().catch((e) => {
      startPromise = null
      throw e
    })
  }
  return startPromise
}

async function runStartMehery(): Promise<void> {
  assertIosPushNativeReady()
  await ensureMeheryChannelPinned()
  await rotateStalePushAppDeviceIfNeeded()
  await ensureMeheryChannelPinned()

  await loadMeherySdk()
  const tracker = registerMeheryTracker()
  installMeheryCartPressTracking()
  installMeheryProductUrlEnrichment()
  installMeheryWishlistPressTracking()
  installMeheryNotifyPressTracking()
  installMeherySearchTracking()
  installMeherySessionKeepAlive()
  // Baseline OS push state BEFORE bootstrap's messaging().requestPermission().
  await installMeheryPushPermissionTracking()
  // Before bootstrap so a fast OTP login during init still queues OnUserLogin.
  wireMeheryIdentityListeners()

  await bootstrapMeherySdk()

  const sessionId = (await AsyncStorage.getItem('sessionId'))?.trim() ?? ''
  if (isPoisonedSessionId(sessionId)) {
    console.warn(
      '[Mehery] Poisoned session after init — rotating device before events/login'
    )
    await recoverFromFailedDeviceLink(`poisoned sessionId after init: ${sessionId}`)
  }

  await sendMeheryLifecycleCustomEvents()

  // Catch users who logged in before the tracker existed, or who were already
  // idle when analytics.initEvents subscribed (no fireImmediately).
  const userDetails = useAppStore.getState().user?.data?.userDetails as
    | { status?: string; data?: unknown }
    | undefined
  if (userDetails?.status === 'idle' && userDetails?.data) {
    console.log('[Mehery] Syncing existing user to PushApp after SDK ready')
    await tracker.setUserDetails(userDetails.data)
  } else {
    // Still flush if setUserDetails ran during bootstrap and left pendingUser.
    await tracker.flushPendingUserLogin()
  }
}
