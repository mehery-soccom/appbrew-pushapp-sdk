import messaging from '@react-native-firebase/messaging'
import { configureMeheryDeepLinks } from './deepLinks'
import {
  requestMeheryAndroidNotificationPermission,
  setMeheryOwnsPushTray,
} from './pushCoexistence'
import { loadMeherySdk } from './sdk'
import { rotateStalePushAppDeviceIfNeeded } from './sessionGuard'

/** Third argument to initSdk: production (`false`), sandbox (`true`), or `'development'`. */
export type SdkInitEnvironmentParam = boolean | 'development'

/** Client tenant_channel from PushApp dashboard. */
export const MEHERY_CHANNEL_ID = 'ecommerce_1786525308082'

/** Production: pushapp.ai (`.ai` domain). Use `true` for sandbox, `'development'` for co.in. */
export const MEHERY_ENVIRONMENT: SdkInitEnvironmentParam = false

let bootstrapPromise: Promise<void> | null = null

/**
 * Cold-start sequence matching the Mehery example app:
 * setGeoIP → readCredentialsForEnvironment → pushappAuth → initSdk
 * → (waitForSdkReady) → messaging.requestPermission + getToken
 *
 * Lifecycle (app_install / app_launch) runs inside initSdk via trackDefaultLifecycleEvents
 * after /device/register — do not call OnAppLaunch again here.
 */
export async function bootstrapMeherySdk(options?: {
  environment?: SdkInitEnvironmentParam
  channelId?: string
  logs?: boolean
}): Promise<void> {
  if (bootstrapPromise) {
    return bootstrapPromise
  }

  bootstrapPromise = (async () => {
    const environment = options?.environment ?? MEHERY_ENVIRONMENT
    const channelId = options?.channelId ?? MEHERY_CHANNEL_ID
    const logs = options?.logs ?? __DEV__

    // Before any SDK call that caches device_id (setGeoIP → common headers).
    await rotateStalePushAppDeviceIfNeeded()

    const sdk = await loadMeherySdk()

    // Same hardcoded geo the example app sets before auth/init (avoids 4s empty wait).
    if (typeof sdk.setGeoIP === 'function') {
      sdk.setGeoIP({
        ip: '103.21.244.0',
        location: { lat: 19.076, lng: 72.8777 },
        country: { iso_code: 'IN', name: 'India' },
        region: { iso_code: 'MH', name: 'Maharashtra' },
        city: { name: 'Mumbai' },
        area: { name: 'Parel' },
      })
    }

    const { xApiId, xApiKey } =
      await sdk.readCredentialsForEnvironment(environment)
    await sdk.pushappAuth(xApiId, xApiKey)
    await sdk.initSdk(null, channelId, environment, logs)
    // Host coordination only — example sets sdkReady after initSdk; we await readiness.
    // Must check the boolean: false means timeout or markSdkReady(false) after init error.
    const ready = await sdk.waitForSdkReady()
    if (!ready) {
      throw new Error(
        '[Mehery] initSdk did not become ready (timeout or init failure)'
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
