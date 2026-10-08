import {
  HOST_INSTALL_STORAGE_KEY,
  buildAppInstallPayload,
  lifecycleEventsToSend,
} from '../lifecycleEvents'

describe('buildAppInstallPayload', () => {
  it('includes Excel keys version, sizeWidth, sizeHeight', () => {
    expect(
      buildAppInstallPayload({
        version: '1.3.0',
        sizeWidth: 390,
        sizeHeight: 844,
        platform: 'ios',
      })
    ).toEqual({
      version: '1.3.0',
      app_version: '1.3.0',
      sizeWidth: 390,
      sizeHeight: 844,
      platform: 'ios',
    })
  })

  it('falls back to unknown version', () => {
    expect(
      buildAppInstallPayload({
        version: '',
        sizeWidth: 1,
        sizeHeight: 2,
        platform: 'android',
      }).version
    ).toBe('unknown')
  })
})

describe('lifecycleEventsToSend', () => {
  it('always includes app_open and app_launch after init', () => {
    const events = lifecycleEventsToSend({ installAlreadySent: true })
    expect(events.map((e) => e.name)).toEqual(['app_launch', 'app_open'])
  })

  it('prepends app_install with props when not yet sent', () => {
    const install = buildAppInstallPayload({
      version: '1.3.0',
      sizeWidth: 390,
      sizeHeight: 844,
      platform: 'ios',
    })
    const events = lifecycleEventsToSend({
      installAlreadySent: false,
      installPayload: install,
    })
    expect(events.map((e) => e.name)).toEqual([
      'app_install',
      'app_launch',
      'app_open',
    ])
    expect(events[0].data).toEqual(install)
    expect(events.every((e) => e.eventType === 'LOG')).toBe(true)
  })

  it('uses a v2 storage key so prior false-positive marks can resend once', () => {
    expect(HOST_INSTALL_STORAGE_KEY).toBe('mehery_host_appbrew_install_sent_v2')
  })
})
