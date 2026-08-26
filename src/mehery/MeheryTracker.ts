import { AnalyticsProvider, AnalyticsTrackerV2 } from '@gauntlet/analytics'
import {
  AnalyticsEvent,
  AnalyticsEventParams,
  AnalyticsPayload,
  AppConfig,
  AppEvents,
} from '@gauntlet/types'
import { toMeheryUserId } from './identity'
import { ensureSdkReady } from './sdk'
import { sendMeheryCustomEvent } from './sendCustomEvent'
import { APPBREW_EVENT_PREFIX, toAppBrewEventName } from './eventNames'
import {
  isPoisonedLinkError,
  recoverFromFailedDeviceLink,
} from './deviceLinkRepair'
import { clearDeviceLinkFailed } from './sessionGuard'

export { APPBREW_EVENT_PREFIX, toAppBrewEventName }

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

function compactPayload(payload?: AnalyticsPayload): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') {
    return {}
  }
  return { ...payload }
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

function isSdkNotReadyError(error?: string): boolean {
  if (!error) return false
  const lower = error.toLowerCase()
  return (
    lower.includes('sdk not ready') ||
    lower.includes('wait for initsdk') ||
    lower.includes('initsdk has not completed')
  )
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
 * named `AppBrew-{ga4_name}` via sendCustomEvent → `/v1/event`.
 */
export class MeheryTracker extends AnalyticsTrackerV2 {
  private linkedUserId: string | null = null
  /** Latest user from analytics; retried after SDK becomes ready. */
  private pendingUser: any | undefined = undefined
  private loginFlushPromise: Promise<void> | null = null

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
    await sendMeheryCustomEvent(toAppBrewEventName(event), compactPayload(payload))
  }

  async sendScreenView(screenName?: string) {
    if (!screenName) {
      return
    }
    await sendMeheryCustomEvent(
      toAppBrewEventName(AnalyticsEvent.SCREEN_VIEW),
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
        const sdk = await ensureSdkReady()

        if (!user || !userId) {
          if (this.linkedUserId) {
            await sdk.OnUserLogOut(this.linkedUserId)
            this.linkedUserId = null
          }
        } else {
          let result = await sdk.OnUserLogin(userId)

          if (
            result &&
            typeof result === 'object' &&
            'success' in result &&
            !(result as { success: boolean }).success &&
            isSdkNotReadyError((result as { error?: string }).error)
          ) {
            console.warn(
              '[MeheryTracker] OnUserLogin skipped (SDK not ready) — retrying after wait'
            )
            const ready = await sdk.waitForSdkReady(60_000)
            if (ready) {
              result = await sdk.OnUserLogin(userId)
            }
          }

          if (
            result &&
            typeof result === 'object' &&
            'success' in result &&
            !(result as { success: boolean }).success
          ) {
            const loginError = (result as { error?: string }).error ?? String(result)
            console.warn('[MeheryTracker] OnUserLogin failed', loginError)

            if (isPoisonedLinkError(loginError) || /http error/i.test(loginError)) {
              const recovered = await recoverFromFailedDeviceLink(loginError)
              if (recovered) {
                result = await sdk.OnUserLogin(userId)
              }
            }
          }

          if (
            result &&
            typeof result === 'object' &&
            'success' in result &&
            !(result as { success: boolean }).success
          ) {
            console.warn(
              '[MeheryTracker] OnUserLogin still failed after recovery',
              (result as { error?: string }).error ?? result
            )
          } else {
            this.linkedUserId = userId
            await clearDeviceLinkFailed()
            console.log('[MeheryTracker] OnUserLogin ok for', userId)

            const additionalInfo: Record<string, unknown> = {}
            if (user.email) additionalInfo.email = user.email
            if (user.phone) additionalInfo.phone = user.phone
            if (user.firstName || user.lastName) {
              additionalInfo.name = [user.firstName, user.lastName]
                .filter(Boolean)
                .join(' ')
            }
            if (Object.keys(additionalInfo).length > 0) {
              await this.pushUserProfile(sdk, additionalInfo)
            }
            if (typeof sdk.flushPendingCustomEvents === 'function') {
              await sdk.flushPendingCustomEvents()
            }
          }
        }
      } catch (e) {
        console.warn('[MeheryTracker] setUserDetails failed', e)
        const message = e instanceof Error ? e.message : String(e)
        if (isPoisonedLinkError(message) || /http error/i.test(message)) {
          try {
            await recoverFromFailedDeviceLink(message)
          } catch (recoveryError) {
            console.warn('[MeheryTracker] device link recovery failed', recoveryError)
          }
        }
      }

      if (this.pendingUser === user) {
        break
      }
    }
  }

  /**
   * Push identity fields to Mehery. Treat skipped results as incomplete (not ok),
   * and retry once for transient "in progress" / login-wait skips.
   */
  private async pushUserProfile(
    sdk: Awaited<ReturnType<typeof ensureSdkReady>>,
    additionalInfo: Record<string, unknown>
  ): Promise<void> {
    const attempt = async (force?: boolean) => {
      if (force && typeof sdk.updateUserProfile === 'function') {
        return sdk.updateUserProfile(additionalInfo, {}, { force: true })
      }
      return sdk.updateUserProfile(additionalInfo)
    }

    let result = await attempt()
    if (
      result &&
      typeof result === 'object' &&
      'skipped' in result &&
      (result as { skipped?: boolean }).skipped
    ) {
      const message =
        (result as { message?: string }).message ?? 'profile update skipped'
      console.warn('[MeheryTracker] updateUserProfile skipped', message)

      if (/in progress|timed out waiting for login/i.test(message)) {
        await new Promise<void>((resolve) => {
          setTimeout(() => resolve(), 1500)
        })
        result = await attempt(true)
      }
    }

    if (
      result &&
      typeof result === 'object' &&
      'skipped' in result &&
      (result as { skipped?: boolean }).skipped
    ) {
      console.warn(
        '[MeheryTracker] updateUserProfile still skipped',
        (result as { message?: string }).message ?? result
      )
      return
    }

    console.log('[MeheryTracker] updateUserProfile ok', result)
  }
}
