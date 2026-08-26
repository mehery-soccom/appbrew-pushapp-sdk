/**
 * Mehery / PushApp host helpers for App Brew (Natori).
 * SDK package is read-only: react-native-mehery-event-sender.
 */

export { bootstrapMeherySdk, MEHERY_CHANNEL_ID, MEHERY_ENVIRONMENT } from './bootstrap'
export {
  MeheryTracker,
  registerMeheryTracker,
  getMeheryTracker,
  toAppBrewEventName,
  APPBREW_EVENT_PREFIX,
} from './MeheryTracker'
export { sendMeheryCustomEvent } from './sendCustomEvent'
export { ensureSdkReady, loadMeherySdk } from './sdk'
export {
  meheryOnUserLogin,
  meheryOnUserLogOut,
  meheryUpdateUserProfile,
  toMeheryUserId,
} from './identity'
export { meheryOnPageOpen, meheryOnPageClose } from './navigation'
export { ensureWorkingCatalog } from './catalogFallback'
export { configureMeheryDeepLinks } from './deepLinks'
export {
  requestMeheryAndroidNotificationPermission,
  isLikelyPushAppPayload,
  installNotifeePushAppDeduper,
  setMeheryOwnsPushTray,
} from './pushCoexistence'
