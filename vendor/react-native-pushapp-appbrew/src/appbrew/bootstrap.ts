import messaging from '@react-native-firebase/messaging'
import { configureMeheryDeepLinks } from './deepLinks'
import {
  requestMeheryAndroidNotificationPermission,
  setMeheryOwnsPushTray,
} from './pushCoexistence'
import { loadMeherySdk } from './sdk'
import { rotateStalePushAppDeviceIfNeeded } from './sessionGuard'
import { ensureMeheryChannelPinned } from './channelPin'
import { getChannelId, getEnvironment, getPushAppConfig } from './config'

/** Third argument to initSdk: production (`false`), sandbox (`true`), or `'development'`. */
export type SdkInitEnvironmentParam = boolean | 'development'

let bootstrapPromise: Promise<void> | null = null

/**
 * Forget a completed bootstrap so recovery can run the full auth/init sequence
 * again after clearing the SDK's persisted guest/device state.
 */
export function resetBootstrapPromise(): void {
  bootstrapPromise = null
}

/**
 * Cold-start sequence matching the Mehery example app:
 * setGeoIP → readCredentialsForEnvironment → pushappAuth → initSdk
 * → (waitForSdkReady) → messaging.requestPermission + getToken
 *
 * Lifecycle (app_install / app_launch) also runs inside initSdk via
 * trackDefaultLifecycleEvents after /device/register. Host still sends
 * app_install / app_launch / app_open via sendMeheryLifecycleCustomEvents
 * (app_open is not fired by the SDK until after login link).
 */
export async function bootstrapMeherySdk(options?: {
  environment?: SdkInitEnvironmentParam
  logs?: boolean
}): Promise<void> {
  if (bootstrapPromise) {
    return bootstrapPromise
  }

  bootstrapPromise = (async () => {
    const environment = options?.environment ?? getEnvironment()
    // DIAGNOSTIC (build 34): release logging on to read device logs; revert after debugging.
    const logs = options?.logs ?? true

    // Before any SDK call that caches device_id (setGeoIP → common headers).
    await ensureMeheryChannelPinned()
    await rotateStalePushAppDeviceIfNeeded()
    await ensureMeheryChannelPinned()

    const sdk = await loadMeherySdk()

    // Optional fixed geo (config.geo) avoids the SDK's ~4s geo lookup wait.
    const { geo } = getPushAppConfig()
    if (geo && typeof sdk.setGeoIP === 'function') {
      sdk.setGeoIP(geo)
    }

    const { xApiId, xApiKey } = await sdk.readCredentialsForEnvironment(
      environment
    )
    await sdk.pushappAuth(xApiId, xApiKey)
    await sdk.initSdk(null, getChannelId(), environment, logs)
    await ensureMeheryChannelPinned()
    // Host coordination only — example sets sdkReady after initSdk; we await readiness.
    // Must check the boolean: false means timeout or markSdkReady(false) after init error.
    const ready = await sdk.waitForSdkReady()
    if (!ready) {
      // Not fatal: initSdk keeps running (slow iOS register); sends queue until ready.
      console.warn(
        '[Mehery] initSdk not ready after wait (timeout or init failure) — continuing'
      )
    }

    await configureMeheryDeepLinks()
    await requestMeheryAndroidNotificationPermission()
    // Stop FirebasePush/Notifee from posting a second tray for the same FCM.
    setMeheryOwnsPushTray(true)

    // Same as example App.tsx after initSdk: request permission + fetch FCM token.
    // On iOS this also nudges FCM once APNs is wired (AppDelegate → PushTokenManager).
    try {
      await messaging().requestPermission()
      const token = await messaging().getToken()
      if (__DEV__) {
        console.log('[Mehery] Firebase Cloud Messaging Token:', token)
      }
      if (typeof sdk.iosChecker === 'function') {
        sdk.iosChecker()
      }
    } catch (e) {
      console.warn('[Mehery] Failed to get FCM token after init', e)
    }

    // Log marker: safe for OnUserLogin / setUserDetails / updateUserProfile.
    console.log(
      '[Mehery] SDK ready — safe to login (OnUserLogin / setUserDetails)'
    )
  })()

  try {
    await bootstrapPromise
  } catch (e) {
    bootstrapPromise = null
    throw e
  }
}
