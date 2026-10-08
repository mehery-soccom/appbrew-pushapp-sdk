export const HOST_INSTALL_STORAGE_KEY = 'mehery_host_appbrew_install_sent_v2'

export type AppInstallPayloadInput = {
  version?: string
  sizeWidth: number
  sizeHeight: number
  platform: string
}

export function buildAppInstallPayload(
  input: AppInstallPayloadInput
): Record<string, unknown> {
  const version = input.version?.trim() || 'unknown'
  return {
    version,
    app_version: version,
    sizeWidth: Math.round(input.sizeWidth),
    sizeHeight: Math.round(input.sizeHeight),
    platform: input.platform,
  }
}

export type LifecycleEventPlan = {
  name: 'app_install' | 'app_launch' | 'app_open'
  data: Record<string, unknown>
  eventType: 'LOG'
}

/**
 * Cold-start PushApp lifecycle after initSdk + device register.
 * Excel: app_install props. CSV: OnAppLaunch / OnAppOpen after init (outside analytics bus).
 * app_open must not wait for login — SDK only fires OnAppOpen after /device/link.
 */
export function lifecycleEventsToSend(opts: {
  installAlreadySent: boolean
  installPayload?: Record<string, unknown>
}): LifecycleEventPlan[] {
  const events: LifecycleEventPlan[] = []
  if (!opts.installAlreadySent && opts.installPayload) {
    events.push({
      name: 'app_install',
      data: opts.installPayload,
      eventType: 'LOG',
    })
  }
  events.push(
    { name: 'app_launch', data: { source: 'host' }, eventType: 'LOG' },
    { name: 'app_open', data: { source: 'host' }, eventType: 'LOG' }
  )
  return events
}
