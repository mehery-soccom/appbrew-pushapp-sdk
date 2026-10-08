import { Platform } from 'react-native'
import { loadMeherySdk } from './sdk'

/**
 * Request POST_NOTIFICATIONS on Android 13+.
 * FirebasePush remains the AppBrew push module; Mehery owns PushApp rich tray UI.
 */
export async function requestMeheryAndroidNotificationPermission() {
  if (Platform.OS !== 'android') {
    return
  }
  try {
    const sdk = await loadMeherySdk()
    await sdk.ensureAndroidNotificationPermission()
  } catch (e) {
    console.warn('[Mehery] ensureAndroidNotificationPermission failed', e)
  }
}

/**
 * Heuristic: PushApp / Mehery FCM data payloads often include these keys.
 * Use to suppress duplicate Notifee / FirebasePush foreground trays.
 */
export function isLikelyPushAppPayload(
  data?: Record<string, unknown> | null
): boolean {
  if (!data || typeof data !== 'object') {
    return false
  }
  const keys = Object.keys(data)
  if (keys.length === 0) {
    return false
  }
  const markers = [
    'notification_url',
    'notificationUrl',
    'imageUrls',
    'image_urls',
    'carousel_images',
    'cta_buttons',
    'message1',
    'message2',
    'message3',
    'click_token',
    'activity_id',
    'CAROUSEL_CATEGORY',
    'category',
    'title1',
    'url1',
    'action1',
    'image',
    'imageUrl',
    'image_url',
  ]
  return markers.some(
    (m) =>
      keys.includes(m) ||
      (typeof data.category === 'string' &&
        String(data.category).includes('CATEGORY'))
  )
}

let meheryOwnsPushTray = false
let notifeeDeduperInstalled = false

/** Call after Mehery `initSdk` is ready — FirebasePush/Notifee must not also post. */
export function setMeheryOwnsPushTray(owns: boolean): void {
  meheryOwnsPushTray = owns
}

/**
 * FirebasePush registers `messaging().onMessage` → Notifee.displayNotification
 * whenever FCM includes a top-level `notification` block. Mehery also registers
 * `onMessage` and posts via react-native-push-notification / native carousel.
 * Without this, foreground PushApp sends appear twice in the tray.
 *
 * Install once at app boot (before or after FirebasePush.init — patches the module).
 */
export function installNotifeePushAppDeduper(): void {
  if (notifeeDeduperInstalled) {
    return
  }
  notifeeDeduperInstalled = true

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const notifee = require('@notifee/react-native').default
    if (!notifee?.displayNotification) {
      return
    }
    const original = notifee.displayNotification.bind(notifee)
    notifee.displayNotification = async (notification: {
      data?: Record<string, unknown>
      title?: string
      body?: string
    }) => {
      const data = (notification?.data ?? {}) as Record<string, unknown>
      const suppress =
        meheryOwnsPushTray ||
        isLikelyPushAppPayload(data) ||
        // PushApp / Mehery almost always send a data map; Mehery JS will render it.
        Object.keys(data).length > 0

      if (suppress) {
        if (__DEV__) {
          console.log(
            '[Mehery] Suppressing Notifee tray (Mehery owns push display)',
            {
              meheryOwnsPushTray,
              dataKeys: Object.keys(data),
              title: notification?.title,
            }
          )
        }
        return ''
      }
      return original(notification)
    }
    console.log('[Mehery] Notifee PushApp deduper installed')
  } catch (e) {
    console.warn('[Mehery] Failed to install Notifee deduper', e)
  }
}
