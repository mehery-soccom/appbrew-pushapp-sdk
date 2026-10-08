/**
 * PushApp for App Brew apps.
 *
 *   import { setupPushApp, PushAppRoot } from 'react-native-pushapp-appbrew/appbrew'
 *
 * Call setupPushApp({...}) once at module scope in App.tsx and render
 * <PushAppRoot /> once inside your app tree. Requires the @gauntlet/* packages
 * every App Brew app already has.
 */
import { AnalyticsProvider } from '@gauntlet/analytics'
import { configurePushApp, type PushAppConfig } from './config'
import { registerMeheryTracker } from './MeheryTracker'
import { installMeheryCartPressTracking } from './cartPressEvents'
import { installMeheryWishlistPressTracking } from './wishlistPressEvents'
import { installMeheryProductUrlEnrichment } from './productUrlEnrichment'
import { installMeherySearchTracking } from './searchEvents'
import { installMeherySessionKeepAlive } from './sessionKeepAlive'
import { installNotifeePushAppDeduper } from './pushCoexistence'

export type { PushAppConfig } from './config'

/**
 * One-time setup. Call before `state.modules.updateModules(...)` so the
 * Notifee de-duper is in place before FirebasePush initialises.
 */
export function setupPushApp(config: PushAppConfig): void {
  configurePushApp(config)
  // Registered in __DEV__ too, so PushApp is not empty in debug builds.
  registerMeheryTracker(AnalyticsProvider.getInstance())
  installMeheryCartPressTracking()
  installMeheryProductUrlEnrichment()
  installMeheryWishlistPressTracking()
  installMeherySearchTracking()
  installMeherySessionKeepAlive()
  installNotifeePushAppDeduper()
}

export { PushAppRoot } from './PushAppRoot'
export { MeheryPollOverlay } from './MeheryPollOverlay'
export { MeheryPageOpenListener } from './MeheryPageOpenListener'
export { MeheryProfileUserGreeting } from './accountPollBlocks'
export { startMehery } from './startMehery'
export { ensureSdkReady, loadMeherySdk } from './sdk'
export {
  MeheryTracker,
  registerMeheryTracker,
  getMeheryTracker,
  toAppBrewEventName,
  toGa4EventName,
  APPBREW_EVENT_PREFIX,
} from './MeheryTracker'
export {
  buildMeheryProfileInfo,
  formatOtpPhone,
  mergeMeheryIdentityPhone,
  mergeMeheryIdentityEmail,
  mergeMeheryIdentityFields,
  resolveMeheryEmail,
  resolveMeheryPhone,
  clearRememberedMeheryIdentity,
} from './buildMeheryProfileInfo'
export { sendMeheryCustomEvent } from './sendCustomEvent'
export { meheryOnPageOpen, meheryOnPageClose } from './navigation'
export { toMeheryUserId } from './identity'
export { resolveShopDomain } from './shopDomain'
export { getCartId, getShopifyId, allocateDemoOrderIds } from './commerceIds'
export * from './itemPayload'
export * from './checkoutBridge'
