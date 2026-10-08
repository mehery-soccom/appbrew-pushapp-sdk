import {
  configurePushApp,
  getChannelAlias,
  getChannelId,
  getEnvironment,
  getTenant,
} from '../config'

describe('push app config', () => {
  it('derives tenant and alias from the channel id', () => {
    configurePushApp({ channelId: 'acme_1786525308082' })
    expect(getChannelId()).toBe('acme_1786525308082')
    expect(getTenant()).toBe('acme')
    expect(getChannelAlias()).toBe('1786525308082')
    expect(getEnvironment()).toBe(false)
  })

  it('rejects a channel id without tenant_number format', () => {
    expect(() => configurePushApp({ channelId: 'nounderscore' })).toThrow(
      /channelId/
    )
  })
})
