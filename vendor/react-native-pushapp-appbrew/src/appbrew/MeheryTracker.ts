import { AnalyticsProvider, AnalyticsTrackerV2 } from '@gauntlet/analytics'
import {
  AnalyticsEvent,
  AnalyticsEventParams,
  AnalyticsPayload,
  AppConfig,
  AppEvents,
} from '@gauntlet/types'
import { useAppStore } from '@gauntlet/state'
import { toMeheryUserId } from './identity'
import { ensureSdkReady } from './sdk'
import { sendMeheryCustomEvent } from './sendCustomEvent'
import {
  APPBREW_EVENT_PREFIX,
  toAppBrewEventName,
  toGa4EventName,
} from './eventNames'
import {
  isPoisonedLinkError,
  recoverFromFailedDeviceLink,
} from './deviceLinkRepair'
import { clearDeviceLinkFailed } from './sessionGuard'
import {
  clearLoginStateIfSwitchingUser,
  ensureGuestRegisteredBeforeLogin,
  isSameUserAlreadyLinked,
  reregisterDeviceAfterIdentityChange,
  resetGuestRegistrationState,
  waitForUserLoggedIn,
} from './linkGate'
import { resetBootstrapPromise } from './bootstrap'
import {
  buildMeheryProfileInfo,
  clearRememberedMeheryIdentity,
} from './buildMeheryProfileInfo'
import {
  CatalogProductLike,
  COMMERCE_EVENTS_REQUIRING_ITEMS,
  enrichListUrl,
  ensureCommerceCurrencyAndValue,
  hasUsableCommerceItems,
  normalizeAnalyticsItems,
  rebuildAnalyticsItem,
} from './itemPayload'
import { meheryOnPageClose, meheryOnPageOpen } from './navigation'
import { resolveMeheryPageOpenName } from './pageOpenConstants'
import { buildUpdateUserProfileEventPayload } from './updateUserProfileEvent'
import { resolveShopDomain } from './shopDomain'
import { Dimensions, Platform } from 'react-native'
import DeviceInfo from 'react-native-device-info'

export { APPBREW_EVENT_PREFIX, toAppBrewEventName, toGa4EventName }
export { buildMeheryProfileInfo }

/** True when host profile info has name / email / phone to force-sync. */
function profileInfoHasIdentity(profileInfo: Record<string, unknown>): boolean {
  if (typeof profileInfo.name === 'string' && profileInfo.name.trim()) {
    return true
  }
  if (
    profileInfo.name &&
    typeof profileInfo.name === 'object' &&
    typeof (profileInfo.name as { formattedName?: string }).formattedName ===
      'string' &&
    (profileInfo.name as { formattedName: string }).formattedName.trim()
  ) {
    return true
  }
  if (typeof profileInfo.email === 'string' && profileInfo.email.trim()) {
    return true
  }
  if (Array.isArray(profileInfo.emails) && profileInfo.emails.length > 0) {
    return true
  }
  if (Array.isArray(profileInfo.phones) && profileInfo.phones.length > 0) {
    return true
  }
  return false
}

/**
 * Every mobile ecom event App Brew actually fires (`AppEvents`).
 * Canvas/admin `PlatformEvents` are not sent from this host app.
 */
const ECOM_EVENTS: AnalyticsEvent[] = Object.values(AppEvents)

/** Extra Excel / App Brew keys not always present on AnalyticsEventParams. */
const EXTRA_PARAMS = [
  'push_enabled',
  'version',
  'sizeWidth',
  'sizeHeight',
  'shopify_order_id',
  'shopify_id',
  'cart_id',
  'reason',
  'isApplicable',
  'is_applicable',
  'checkout_token',
  'sub_total',
  'coupon',
  'currency',
  'value',
  'items',
  'method',
  'search_term',
  'screen_name',
  'screen_class',
  'item_list_id',
  'item_list_name',
  'handle',
  'url',
  'transaction_id',
  'status',
  'from_status',
  'to_status',
  'action',
  'click_label',
  'instance_id',
  'session_id',
  'appbrew_session_id',
  'item_id',
  'item_name',
  'item_variant',
  'item_brand',
  'item_category',
  'img_url',
  'sku',
  'quantity',
  'price',
  'original_price',
  'discount',
] as const

function shopDomainFromConfig(): string | undefined {
  return resolveShopDomain()
}

function localizationCurrency(): string | undefined {
  try {
    return useAppStore.getState().localization.data.selectedCountry?.currency
      ?.isoCode
  } catch {
    return undefined
  }
}

function catalogProductForHandle(
  handle?: string
): CatalogProductLike | undefined {
  if (!handle) {
    return undefined
  }
  try {
    const entry = useAppStore.getState().products?.items?.[handle] as
      | { status?: string; data?: CatalogProductLike }
      | undefined
    if (entry?.status === 'idle' && entry.data) {
      return entry.data
    }
  } catch {
    /* ignore */
  }
  return undefined
}

function compactPayload(payload?: AnalyticsPayload): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') {
    return {}
  }
  let data: Record<string, unknown>
  try {
    data = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>
  } catch {
    data = { ...payload }
  }
  // Gauntlet filterParams turns empty items[] into items:{} — normalize first.
  data = normalizeAnalyticsItems(data)
  const domain = shopDomainFromConfig()
  // Rebuild Excel items (view_item / notify / cart / wishlist) via buildExcelItem + catalog.
  if (Array.isArray(data.items)) {
    data.items = data.items
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const raw = item as Record<string, unknown>
        const handle =
          (typeof raw.handle === 'string' && raw.handle) ||
          (typeof raw.productHandle === 'string' && raw.productHandle) ||
          undefined
        return rebuildAnalyticsItem(
          raw,
          domain,
          catalogProductForHandle(handle)
        )
      })
    data = normalizeAnalyticsItems(data)
  }
  data = enrichListUrl(data, domain)
  // Wishlist / notify / cart often arrive without currency/value from sparse paths.
  data = ensureCommerceCurrencyAndValue(data, localizationCurrency())
  return data
}

function enrichAppInstallPayload(
  data: Record<string, unknown>
): Record<string, unknown> {
  const { width, height } = Dimensions.get('screen')
  const appVersion = (() => {
    try {
      return DeviceInfo.getVersion() || 'unknown'
    } catch {
      return 'unknown'
    }
  })()
  // Gauntlet sends Platform.Version (OS) as `version` — replace with app version.
  const versionLooksLikeOs =
    data.version === Platform.Version ||
    data.version === String(Platform.Version)
  return {
    ...data,
    version: versionLooksLikeOs || !data.version ? appVersion : data.version,
    app_version: appVersion,
    sizeWidth:
      typeof data.sizeWidth === 'number'
        ? Math.round(data.sizeWidth)
        : Math.round(width),
    sizeHeight:
      typeof data.sizeHeight === 'number'
        ? Math.round(data.sizeHeight)
        : Math.round(height),
    platform:
      typeof data.platform === 'string' ? data.platform : Platform.OS,
  }
}

function resolveMeheryUserId(user?: any): string | null {
  const rawId =
    user?.id != null
      ? String(user.id)
      : user?.customerId != null
      ? String(user.customerId)
      : null
  if (rawId != null) {
    return toMeheryUserId(rawId)
  }
  if (user?.email) {
    return String(user.email)
  }
  return null
}

function isMeheryPhoneAlreadyExistsError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  if (/phone\s+already\s+exists/i.test(msg)) {
    return true
  }
  const jsonStart = msg.indexOf('{')
  if (jsonStart < 0) {
    return false
  }
  try {
    const parsed = JSON.parse(msg.slice(jsonStart)) as {
      error?: { message?: string }
    }
    return /phone\s+already\s+exists/i.test(parsed.error?.message ?? '')
  } catch {
    return false
  }
}

function omitMeheryProfilePhones(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const rest = { ...payload }
  delete rest.phones
  return rest
}

function isSuccessfulLoginResult(result: unknown): boolean {
  return (
    result !== null &&
    typeof result === 'object' &&
    'success' in result &&
    (result as { success?: unknown }).success === true
  )
}

function getLoginError(result: unknown): string | undefined {
  if (!result || typeof result !== 'object' || !('error' in result)) {
    return undefined
  }
  const error = (result as { error?: unknown }).error
  return typeof error === 'string' ? error : undefined
}

let sharedTracker: MeheryTracker | null = null

export function getMeheryTracker(): MeheryTracker {
  if (!sharedTracker) {
    sharedTracker = new MeheryTracker()
  }
  return sharedTracker
}

/**
 * Register once on AnalyticsProvider so install / early cart events are not dropped.
 * Safe to call from initApp and startMehery.
 */
export function registerMeheryTracker(
  analytics: AnalyticsProvider = AnalyticsProvider.getInstance()
): MeheryTracker {
  const tracker = getMeheryTracker()
  if (!analytics.trackers.includes(tracker)) {
    analytics.addTracker(tracker)
  }
  tracker.init(analytics.config)
  return tracker
}

/**
 * Dual-sends App Brew ecom analytics to Mehery PushApp as custom events
 * with exact GA4 names (`add_to_cart`, `screen_view`, …) via sendCustomEvent.
 * LOG so Event Analytics POSTs without waiting for /device/link.
 * Screen views also drive OnPageOpen / OnPageClose.
 */
export class MeheryTracker extends AnalyticsTrackerV2 {
  private linkedUserId: string | null = null
  /** Dual-send OnUserLogin LOG once per linked user per process (Event Analytics). */
  private onUserLoginAnalyticsSentFor: string | null = null
  /** Latest user from analytics; retried after SDK becomes ready. */
  private pendingUser: any | undefined = undefined
  private loginFlushPromise: Promise<void> | null = null
  /** Last screen for OnPageOpen / OnPageClose pairing. */
  private lastPageName: string | null = null

  /** PushApp linked customer id (survives Gauntlet resetUser before SIGNOUT). */
  getLinkedUserId(): string | null {
    return this.linkedUserId
  }

  async initTracker(_config?: AppConfig) {
    this.eventsWhitelist = ECOM_EVENTS
    this.paramsWhitelist = [
      ...Object.values(AnalyticsEventParams),
      ...(EXTRA_PARAMS as unknown as AnalyticsEventParams[]),
    ]
    this.eventsMapper = {}
    this.paramsMapper = {}
  }

  async sendEvent(event?: AnalyticsEvent, payload?: AnalyticsPayload) {
    if (!event) {
      return
    }
    if (
      this.eventsWhitelist.length > 0 &&
      !this.eventsWhitelist.includes(event)
    ) {
      return
    }
    const name = toGa4EventName(event)
    let data = compactPayload(payload)
    if (name === 'app_install') {
      data = enrichAppInstallPayload(data)
    }
    if (name === 'search') {
      const term =
        (typeof data.search_term === 'string' && data.search_term.trim()) ||
        ''
      if (!term) {
        try {
          const key =
            useAppStore.getState().search?.searchParams?.searchKey ?? ''
          if (key.trim()) {
            data = { ...data, search_term: key.trim() }
          }
        } catch {
          /* ignore */
        }
      }
      // Do not POST empty search — suggestions-only focus is screen_view.
      if (
        !(typeof data.search_term === 'string' && data.search_term.trim())
      ) {
        return
      }
    }
    if (
      COMMERCE_EVENTS_REQUIRING_ITEMS.has(name) &&
      !hasUsableCommerceItems(data)
    ) {
      return
    }
    await sendMeheryCustomEvent(name, data, 'INTERACTIVE')
  }

  async sendScreenView(screenName?: string) {
    if (!screenName) {
      return
    }
    const ownedPage = resolveMeheryPageOpenName(screenName)
    // Home / account OnPageOpen is owned by MeheryPageOpenListener (canonical names).
    if (ownedPage) {
      this.lastPageName = ownedPage
      await sendMeheryCustomEvent(
        toGa4EventName(AnalyticsEvent.SCREEN_VIEW),
        { screen_name: ownedPage, screen_class: ownedPage },
        'LOG'
      )
      return
    }
    if (this.lastPageName && this.lastPageName !== screenName) {
      meheryOnPageClose(this.lastPageName)
    }
    meheryOnPageOpen(screenName)
    this.lastPageName = screenName
    await sendMeheryCustomEvent(
      toGa4EventName(AnalyticsEvent.SCREEN_VIEW),
      { screen_name: screenName, screen_class: screenName },
      'LOG'
    )
  }

  async setUserDetails(user?: any) {
    this.pendingUser = user
    return this.flushPendingUserLogin()
  }

  async flushPendingUserLogin(): Promise<void> {
    if (this.loginFlushPromise) {
      return this.loginFlushPromise
    }

    this.loginFlushPromise = this.runPendingUserLogin().finally(() => {
      this.loginFlushPromise = null
    })
    return this.loginFlushPromise
  }

  private async runPendingUserLogin(): Promise<void> {
    for (;;) {
      const user = this.pendingUser
      const userId = resolveMeheryUserId(user)

      try {
        let sdk = await ensureSdkReady()

        if (!user || !userId) {
          if (this.linkedUserId) {
            await sdk.OnUserLogOut(this.linkedUserId)
            this.linkedUserId = null
            this.onUserLoginAnalyticsSentFor = null
          }
          clearRememberedMeheryIdentity()
          // Delink + immediate /device/register races the server — delay + retry.
          await reregisterDeviceAfterIdentityChange('logout')
        } else {
          // Process-local OR AsyncStorage same-user link — do not wipe
          // UserLoggedIn before OnUserLogin or the SDK cannot skip an already
          // linked iOS contact (Android looks fine because FCM re-register is
          // cheaper; iOS re-link churn looks like broken profile linking).
          let alreadyLinked = this.linkedUserId === userId
          if (!alreadyLinked && (await isSameUserAlreadyLinked(userId))) {
            this.linkedUserId = userId
            alreadyLinked = true
            console.log(
              '[MeheryTracker] Restored linked session from storage — skip /device/link',
              userId
            )
          }

          let loginOk = alreadyLinked
          let result: unknown = alreadyLinked
            ? { success: true }
            : { success: false, error: 'login not attempted' }

          // Name / email edits update userDetails and re-enter setUserDetails.
          // Re-running /device/link (or rotating the device on a flaky HTTP)
          // replaces the customer's device list with this phone (Device 3→1)
          // and drops event attribution. Skip relink when already linked.
          if (!alreadyLinked) {
            let guestRegistered = await ensureGuestRegisteredBeforeLogin()
            if (!guestRegistered) {
              console.warn(
                '[MeheryTracker] Guest registration not confirmed before OnUserLogin'
              )
              result = {
                success: false,
                error: 'guest registration not confirmed',
              }
            } else {
              // Only clear prior login evidence when switching users. Clearing
              // on every attempt forces a fresh /device/link and breaks the SDK
              // same-contact short-circuit (hurts iOS more than Android).
              await clearLoginStateIfSwitchingUser(userId)
              result = await sdk.OnUserLogin(userId)
              let loginSucceeded = isSuccessfulLoginResult(result)
              let linked = await waitForUserLoggedIn()
              let poisonError = loginSucceeded
                ? undefined
                : getLoginError(result)

              if (!loginSucceeded || !linked) {
                console.warn(
                  '[MeheryTracker] Link not verified — resetting guest state and retrying once'
                )
                await resetGuestRegistrationState()
                sdk.resetCachedDeviceId?.()
                resetBootstrapPromise()
                sdk = await ensureSdkReady()
                guestRegistered = await ensureGuestRegisteredBeforeLogin()
                if (guestRegistered) {
                  // Full reset already wiped login keys; do not clear again.
                  result = await sdk.OnUserLogin(userId)
                  loginSucceeded = isSuccessfulLoginResult(result)
                  linked = await waitForUserLoggedIn()
                } else {
                  result = {
                    success: false,
                    error: 'guest registration not confirmed after reset',
                  }
                  loginSucceeded = false
                  linked = false
                }

                if (!loginSucceeded) {
                  const retryError = getLoginError(result)
                  if (
                    isPoisonedLinkError(retryError) ||
                    !isPoisonedLinkError(poisonError)
                  ) {
                    poisonError = retryError ?? poisonError
                  }
                }
              }

              if (
                (!loginSucceeded || !linked) &&
                isPoisonedLinkError(poisonError)
              ) {
                console.warn(
                  '[MeheryTracker] Poisoned device link detected — running device recovery'
                )
                const recovered = await recoverFromFailedDeviceLink(poisonError)
                if (recovered) {
                  sdk = await ensureSdkReady()
                  guestRegistered = await ensureGuestRegisteredBeforeLogin()
                  if (guestRegistered) {
                    result = await sdk.OnUserLogin(userId)
                    loginSucceeded = isSuccessfulLoginResult(result)
                    linked = await waitForUserLoggedIn()
                  } else {
                    result = {
                      success: false,
                      error:
                        'guest registration not confirmed after device recovery',
                    }
                    loginSucceeded = false
                    linked = false
                  }
                }
              }

              loginOk = loginSucceeded && linked
            }
          }

          if (!loginOk) {
            console.warn(
              '[MeheryTracker] OnUserLogin still failed after recovery — profile PUT skipped (needs UserLoggedIn)',
              result && typeof result === 'object' && 'error' in result
                ? (result as { error?: string }).error
                : result
            )
          } else {
            this.linkedUserId = userId
            await clearDeviceLinkFailed()
            if (alreadyLinked) {
              console.log(
                '[MeheryTracker] Same user already linked — skip /device/link, sync profile',
                userId
              )
            } else {
              console.log('[MeheryTracker] OnUserLogin ok for', userId)
            }
            // Device /device/link is not Event Analytics. Dual-send once per
            // user per process so restores / retests still show OnUserLogin,
            // without spamming on every profile name edit. Mark sent only
            // after a successful POST so a failed/queued send can retry.
            if (this.onUserLoginAnalyticsSentFor !== userId) {
              const loginSent = await sendMeheryCustomEvent(
                'OnUserLogin',
                { user_id: userId },
                'LOG'
              )
              if (loginSent) {
                this.onUserLoginAnalyticsSentFor = userId
              }
            }

            // Call shape: { name, phones: [string], email } — email → additionalInfo.
            // buildMeheryProfileInfo re-applies remembered OTP email/phone so a
            // later name-only store update cannot PUT without them.
            const profileInfo = buildMeheryProfileInfo(user)
            if (Object.keys(profileInfo).length > 0) {
              // Force when any identity field is present so prepareProfileUpdate
              // cannot drop email/phones on name-only follow-ups, and so the
              // first email/phone sync is not skipped by session dedupe.
              const forceIdentitySync = profileInfoHasIdentity(profileInfo)
              console.log(
                '[MeheryTracker] updateUserProfile →',
                JSON.stringify(profileInfo),
                forceIdentitySync ? '{ force: true }' : ''
              )
              await this.pushUserProfile(sdk, profileInfo, {
                force: forceIdentitySync,
              })
            } else {
              console.warn(
                '[MeheryTracker] updateUserProfile skipped — empty profile info (no name/email/phone)'
              )
            }
            if (typeof sdk.flushPendingCustomEvents === 'function') {
              await sdk.flushPendingCustomEvents()
            }
            // Only after a fresh /device/link — not on every profile setUserDetails.
            if (!alreadyLinked) {
              await reregisterDeviceAfterIdentityChange('login')
            }
          }
        }
      } catch (e) {
        console.warn('[MeheryTracker] setUserDetails failed', e)
        const message = e instanceof Error ? e.message : String(e)
        const sameUserStillLinked =
          Boolean(userId) && this.linkedUserId === userId
        if (isPoisonedLinkError(message) && !sameUserStillLinked) {
          try {
            await recoverFromFailedDeviceLink(message)
          } catch (recoveryError) {
            console.warn(
              '[MeheryTracker] device link recovery failed',
              recoveryError
            )
          }
        }
      }

      if (this.pendingUser === user) {
        break
      }
    }
  }

  /**
   * Push identity fields via official SDK API:
   *   updateUserProfile(additionalInfo, cohorts?, { force? })
   * Must run only after OnUserLogin succeeded (caller guarantees).
   * Host call shape: `{ name, phones: [string], email }` (scalar email → additionalInfo).
   * See Mehery docs / mehery-pushapp-profile rule.
   */
  private async pushUserProfile(
    sdk: Awaited<ReturnType<typeof ensureSdkReady>>,
    profileInfo: Record<string, unknown>,
    options?: { force?: boolean }
  ): Promise<void> {
    const attemptUpdate = async (
      info: Record<string, unknown>,
      force?: boolean
    ) => {
      if (typeof sdk.updateUserProfile !== 'function') {
        return { skipped: true, message: 'updateUserProfile unavailable' }
      }
      // Docs signature: (additionalInfo, cohorts?, options?)
      return sdk.updateUserProfile(
        info,
        {},
        force ? { force: true } : undefined
      )
    }

    const isBenignSkip = (message: string) =>
      /already handled this app session|same profile already pushed|no changed profile fields|duplicate call/i.test(
        message
      )

    const pushOnce = async (info: Record<string, unknown>): Promise<void> => {
      let result = await attemptUpdate(info, options?.force)
      if (
        result &&
        typeof result === 'object' &&
        'skipped' in result &&
        (result as { skipped?: boolean }).skipped
      ) {
        const message =
          (result as { message?: string }).message ?? 'profile update skipped'

        // Dedupe from SIGNIN + store subscribe + startMehery — not an error.
        // Do NOT dual-send Event Analytics on skip (would spam without changes
        // and can suppress a later real name-change via 400ms dedupe).
        if (isBenignSkip(message)) {
          console.log(
            '[MeheryTracker] updateUserProfile already synced (skip)',
            message
          )
          return
        }

        if (/in progress|timed out waiting for login/i.test(message)) {
          console.warn('[MeheryTracker] updateUserProfile skipped', message)
          await new Promise<void>((resolve) => {
            setTimeout(() => resolve(), 1500)
          })
          result = await attemptUpdate(info, true)
        } else {
          console.warn('[MeheryTracker] updateUserProfile skipped', message)
          return
        }
      }

      if (
        result &&
        typeof result === 'object' &&
        'skipped' in result &&
        (result as { skipped?: boolean }).skipped
      ) {
        const message =
          (result as { message?: string }).message ?? String(result)
        if (isBenignSkip(message)) {
          console.log(
            '[MeheryTracker] updateUserProfile already synced (skip)',
            message
          )
          return
        }
        console.warn('[MeheryTracker] updateUserProfile still skipped', message)
        return
      }

      console.log('[MeheryTracker] updateUserProfile ok', result)
      // PUT is not Event Analytics — dual-send Excel identity event only after
      // a real (non-skipped) profile update.
      void sendMeheryCustomEvent(
        'updateUserProfile',
        buildUpdateUserProfileEventPayload(info),
        'LOG'
      )
    }

    try {
      await pushOnce(profileInfo)
    } catch (error) {
      const payloadHadPhones = Boolean(profileInfo.phones)
      if (isMeheryPhoneAlreadyExistsError(error) && payloadHadPhones) {
        const retryInfo = omitMeheryProfilePhones(profileInfo)
        if (Object.keys(retryInfo).length === 0) {
          console.warn(
            '[MeheryTracker] updateUserProfile failed (phones conflict, nothing else to sync)',
            error
          )
          return
        }
        console.warn(
          '[MeheryTracker] updateUserProfile retrying without phones'
        )
        try {
          await pushOnce(retryInfo)
        } catch (retryError) {
          console.warn(
            '[MeheryTracker] updateUserProfile failed after phone omit retry',
            retryError
          )
        }
        return
      }
      console.warn('[MeheryTracker] updateUserProfile failed', error)
    }
  }
}
