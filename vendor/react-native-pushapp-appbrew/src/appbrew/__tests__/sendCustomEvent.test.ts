const mockSend = jest.fn(() => Promise.resolve(true))

// @ts-expect-error RN global used by host send path
global.__DEV__ = false

jest.mock('react-native', () => ({
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
  Platform: { OS: 'ios', Version: 17 },
}))

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => {
    if (key === 'UserLoggedIn') return Promise.resolve('true')
    if (key === 'user_id') return Promise.resolve('gid://shopify/Customer/882211')
    if (key === 'registered_user_id') return Promise.resolve('guest-1')
    return Promise.resolve('guest-1')
  }),
  setItem: jest.fn(() => Promise.resolve()),
}))

jest.mock('react-native-device-info', () => ({
  getVersion: () => '1.0.0',
}))

jest.mock('../eventNames', () => ({
  toGa4EventName: (name: string) => name,
}))

jest.mock('../sdk', () => ({
  ensureSdkReady: jest.fn(() =>
    Promise.resolve({
      sendCustomEvent: mockSend,
      flushPendingCustomEvents: jest.fn(() => Promise.resolve()),
    })
  ),
}))

jest.mock('@gauntlet/local-storage', () => ({
  LocalStorage: {
    getInstance: () => ({
      getNumber: jest.fn(() => 0),
      set: jest.fn(),
      delete: jest.fn(),
    }),
  },
}))

jest.mock('@gauntlet/state', () => ({
  useAppStore: {
    getState: jest.fn(() => ({
      cart: { data: { id: 'gid://shopify/Cart/test' } },
      config: { data: {} },
    })),
  },
}))

jest.mock('../shopDomain', () => ({
  MEHERY_FALLBACK_SHOP_DOMAIN: 'natori-appbrew.myshopify.com',
  resolveShopDomain: () => 'natori-appbrew.myshopify.com',
}))

jest.mock('../enrichEventData', () => ({
  enrichEventData: (data: Record<string, unknown>) => ({
    ...data,
    shopify_id: data.shopify_id ?? 'natori-appbrew.myshopify.com',
    ...(data.cart_id
      ? {}
      : { cart_id: 'gid://shopify/Cart/test' }),
  }),
}))

import {
  resetMeheryCustomEventDedupeForTests,
  sendMeheryCustomEvent,
} from '../sendCustomEvent'

describe('sendMeheryCustomEvent', () => {
  beforeEach(() => {
    mockSend.mockClear()
    mockSend.mockResolvedValue(true)
    resetMeheryCustomEventDedupeForTests()
  })

  it('defaults to INTERACTIVE event type', async () => {
    await sendMeheryCustomEvent('login', { method: 'otp' })
    expect(mockSend).toHaveBeenCalledWith(
      'login',
      expect.objectContaining({
        method: 'otp',
        shopify_id: '882211',
        cart_id: 'gid://shopify/Cart/test',
      }),
      { eventType: 'INTERACTIVE' }
    )
  })

  it('does not drop updateUserProfile when name changes with same email within 400ms', async () => {
    await sendMeheryCustomEvent(
      'updateUserProfile',
      { name: 'Old Name', email: 'a@b.com', phone: '+1' },
      'LOG'
    )
    await sendMeheryCustomEvent(
      'updateUserProfile',
      { name: 'New Name', email: 'a@b.com', phone: '+1' },
      'LOG'
    )
    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(mockSend.mock.calls[1][1]).toMatchObject({ name: 'New Name' })
  })

  it('dedupes identical updateUserProfile within 400ms', async () => {
    const payload = { name: 'Same', email: 'a@b.com', phone: '+1' }
    await sendMeheryCustomEvent('updateUserProfile', payload, 'LOG')
    await sendMeheryCustomEvent('updateUserProfile', payload, 'LOG')
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it('dedupes add_to_cart within 1000ms (press + analytics dual path)', async () => {
    const payload = {
      currency: 'INR',
      value: 100,
      items: [{ item_id: 'v1', item_variant: 'v1' }],
    }
    await sendMeheryCustomEvent('add_to_cart', payload, 'LOG')
    await new Promise((r) => setTimeout(r, 450))
    await sendMeheryCustomEvent('add_to_cart', payload, 'LOG')
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it('skips commerce events when items is {} or empty', async () => {
    const ok = await sendMeheryCustomEvent(
      'view_item',
      { currency: 'INR', value: 10, items: {} },
      'LOG'
    )
    expect(ok).toBe(false)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('prefers rich add_to_cart over empty follow-up in dedupe window', async () => {
    await sendMeheryCustomEvent(
      'add_to_cart',
      {
        currency: 'INR',
        value: 100,
        items: [{ item_id: 'v1', item_variant: 'v1' }],
      },
      'LOG'
    )
    await sendMeheryCustomEvent(
      'add_to_cart',
      { currency: 'INR', value: 100, items: {} },
      'LOG'
    )
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it('does not drop distinct widget_open compares within 400ms', async () => {
    await sendMeheryCustomEvent(
      'widget_open',
      { compare: 'account_inline' },
      'LOG'
    )
    await sendMeheryCustomEvent(
      'widget_open',
      { compare: 'account_tooltip' },
      'LOG'
    )
    expect(mockSend).toHaveBeenCalledTimes(2)
  })
})
