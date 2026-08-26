import { AnalyticsEvent } from '@gauntlet/types'

/** Prefix Mehery/PushApp custom event names so they are distinct from SDK lifecycle. */
export const APPBREW_EVENT_PREFIX = 'AppBrew-'

export function toGa4EventName(event: AnalyticsEvent | string): string {
  if (
    event === AnalyticsEvent.APP_INSTALL_IOS ||
    event === AnalyticsEvent.APP_INSTALL_ANDROID
  ) {
    return 'app_install'
  }
  return String(event)
}

/** PushApp custom event name: `AppBrew-add_to_cart`, `AppBrew-view_item`, … */
export function toAppBrewEventName(event: AnalyticsEvent | string): string {
  const base = toGa4EventName(event)
  if (base.startsWith(APPBREW_EVENT_PREFIX)) {
    return base
  }
  return `${APPBREW_EVENT_PREFIX}${base}`
}
