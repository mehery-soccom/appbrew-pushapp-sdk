import { AnalyticsEvent } from '@gauntlet/types'

/** @deprecated Events are sent as exact GA4 names (same as screen_view). */
export const APPBREW_EVENT_PREFIX = 'AppBrew-'

/**
 * PushApp `/v1/event` name: exact GA4 (`add_to_cart`, `screen_view`, …).
 * Strips a leftover `AppBrew-` prefix so old call sites still map correctly.
 */
export function toGa4EventName(event: AnalyticsEvent | string): string {
  const raw = String(event)
  const base = raw.startsWith(APPBREW_EVENT_PREFIX)
    ? raw.slice(APPBREW_EVENT_PREFIX.length)
    : raw
  if (
    base === AnalyticsEvent.APP_INSTALL_IOS ||
    base === AnalyticsEvent.APP_INSTALL_ANDROID ||
    base === 'app_install_ios' ||
    base === 'app_install_android'
  ) {
    return 'app_install'
  }
  return base
}

/** @deprecated Use `toGa4EventName` — PushApp expects unprefixed GA4 names. */
export function toAppBrewEventName(event: AnalyticsEvent | string): string {
  return toGa4EventName(event)
}
