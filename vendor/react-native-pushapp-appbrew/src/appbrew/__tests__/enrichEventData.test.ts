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
      cart: { data: { id: 'gid://shopify/Cart/abc' } },
      config: { data: {} },
      user: {
        data: {
          userDetails: {
            data: { id: 'gid://shopify/Customer/882211' },
          },
        },
      },
    })),
  },
}))

jest.mock('../shopDomain', () => ({
  MEHERY_FALLBACK_SHOP_DOMAIN: 'natori-appbrew.myshopify.com',
  resolveShopDomain: () => 'natori-appbrew.myshopify.com',
}))

import { enrichEventData } from '../enrichEventData'

describe('enrichEventData', () => {
  it('sets shopify_id to the Mehery user id', () => {
    expect(enrichEventData({ value: 1 })).toEqual({
      value: 1,
      shopify_id: '882211',
      cart_id: 'gid://shopify/Cart/abc',
    })
  })

  it('replaces a shop web url with the Mehery user id', () => {
    expect(
      enrichEventData({
        shopify_id: 'https://custom.myshopify.com',
        cart_id: 'cart-1',
      })
    ).toEqual({
      shopify_id: '882211',
      cart_id: 'cart-1',
    })
  })

  it('keeps a caller Mehery user id', () => {
    expect(
      enrichEventData({
        shopify_id: '441122',
        cart_id: 'cart-1',
      }).shopify_id
    ).toBe('441122')
  })

  it('can skip cart_id', () => {
    expect(enrichEventData({ value: 2 }, { includeCartId: false })).toEqual({
      value: 2,
      shopify_id: '882211',
    })
  })

  it('accepts cartId override', () => {
    expect(enrichEventData({}, { cartId: 'override-cart' }).cart_id).toBe(
      'override-cart'
    )
  })
})
