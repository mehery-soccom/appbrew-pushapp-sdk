jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn() },
  Platform: { OS: 'ios' },
}))

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}))

jest.mock('../sendCustomEvent', () => ({
  sendMeheryCustomEvent: jest.fn(() => Promise.resolve(true)),
}))

const mockCheckNotifications = jest.fn()

jest.mock('react-native-permissions', () => ({
  RESULTS: {
    GRANTED: 'granted',
    LIMITED: 'limited',
    DENIED: 'denied',
    BLOCKED: 'blocked',
    UNAVAILABLE: 'unavailable',
  },
  checkNotifications: (...args: unknown[]) => mockCheckNotifications(...args),
}))

import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  STORAGE_EVER_SUBSCRIBED,
  __emitPushPermissionIfChangedForTests,
  __establishPushBaselineForTests,
  __resetMeheryPushPermissionTrackingForTests,
  shouldEmitPushPermissionTransition,
} from '../pushPermissionEvents'

const { sendMeheryCustomEvent } = jest.requireMock('../sendCustomEvent') as {
  sendMeheryCustomEvent: jest.Mock
}

describe('shouldEmitPushPermissionTransition', () => {
  it('blocks until baseline ready', () => {
    expect(shouldEmitPushPermissionTransition(false, null, true)).toBe(false)
  })

  it('emits when denied → granted after baseline', () => {
    expect(shouldEmitPushPermissionTransition(true, false, true)).toBe(true)
  })

  it('emits when null → granted after baseline (post-prompt)', () => {
    expect(shouldEmitPushPermissionTransition(true, null, true)).toBe(true)
  })

  it('skips when unchanged', () => {
    expect(shouldEmitPushPermissionTransition(true, true, true)).toBe(false)
  })
})

describe('pushPermissionEvents emit path', () => {
  beforeEach(() => {
    __resetMeheryPushPermissionTrackingForTests()
    sendMeheryCustomEvent.mockClear()
    mockCheckNotifications.mockReset()
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(null)
    ;(AsyncStorage.setItem as jest.Mock).mockClear()
  })

  it('does not emit until baseline is ready', async () => {
    mockCheckNotifications.mockResolvedValue({ status: 'granted' })
    await __emitPushPermissionIfChangedForTests()
    expect(sendMeheryCustomEvent).not.toHaveBeenCalled()
  })

  it('emits subscribed when permission flips denied → granted', async () => {
    mockCheckNotifications.mockResolvedValueOnce({ status: 'denied' })
    await __establishPushBaselineForTests()
    sendMeheryCustomEvent.mockClear()
    mockCheckNotifications.mockResolvedValue({ status: 'granted' })
    await __emitPushPermissionIfChangedForTests()
    expect(sendMeheryCustomEvent).toHaveBeenCalledWith(
      'push_notification_subscribed',
      { push_enabled: true },
      'LOG'
    )
  })

  it('emits subscribed once on first-ever already-granted baseline', async () => {
    mockCheckNotifications.mockResolvedValue({ status: 'granted' })
    await __establishPushBaselineForTests()
    expect(sendMeheryCustomEvent).toHaveBeenCalledWith(
      'push_notification_subscribed',
      { push_enabled: true },
      'LOG'
    )
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      STORAGE_EVER_SUBSCRIBED,
      '1'
    )
  })

  it('does not re-emit first-ever grant when already marked', async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue('1')
    mockCheckNotifications.mockResolvedValue({ status: 'granted' })
    await __establishPushBaselineForTests()
    expect(sendMeheryCustomEvent).not.toHaveBeenCalled()
  })
})
