const mockSet = jest.fn()
const mockGetNumber = jest.fn()
const mockDelete = jest.fn()

jest.mock('@gauntlet/local-storage', () => ({
  LocalStorage: {
    getInstance: () => ({
      getNumber: mockGetNumber,
      set: mockSet,
      delete: mockDelete,
    }),
  },
}))

jest.mock('@gauntlet/state', () => ({
  useAppStore: {
    getState: jest.fn(() => ({
      cart: { data: { id: 'gid://shopify/Cart/xyz' } },
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

const mockGetItem = jest.fn()

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: (...args: unknown[]) => mockGetItem(...args),
}))

jest.mock('../shopDomain', () => ({
  MEHERY_FALLBACK_SHOP_DOMAIN: 'natori-appbrew.myshopify.com',
  resolveShopDomain: () => 'shop.example.com',
}))

import { useAppStore } from '@gauntlet/state'
import {
  allocateDemoOrderIds,
  fetchMeheryUserId,
  getCartId,
  getShopifyId,
} from '../commerceIds'

describe('commerceIds', () => {
  beforeEach(() => {
    mockSet.mockClear()
    mockGetNumber.mockClear()
    mockDelete.mockClear()
    mockGetNumber.mockReturnValue(2)
  })

  it('getCartId reads Shopify cart id', () => {
    expect(getCartId()).toBe('gid://shopify/Cart/xyz')
  })

  it('getShopifyId is the Mehery user id, not the shop web address', () => {
    expect(getShopifyId()).toBe('882211')
    expect(getShopifyId()).not.toMatch(/myshopify|https?:\/\//i)
  })

  it('fetchMeheryUserId reads the stored Mehery user id when Shopify customer is absent', async () => {
    ;(useAppStore.getState as jest.Mock).mockReturnValueOnce({
      cart: { data: {} },
      user: { data: { userDetails: { data: undefined } } },
    })
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'UserLoggedIn') return Promise.resolve('true')
      if (key === 'user_id') return Promise.resolve('gid://shopify/Customer/990011')
      if (key === 'registered_user_id') return Promise.resolve('guest-9')
      return Promise.resolve(null)
    })
    await expect(fetchMeheryUserId()).resolves.toBe('990011')
  })

  it('allocateDemoOrderIds bumps counter and returns paired ids', () => {
    const ids = allocateDemoOrderIds()
    expect(ids.shopify_order_id).toBe('gid://shopify/Order/demo_3')
    expect(ids.transaction_id).toMatch(/^demo_txn_\d+_3$/)
    expect(mockSet).toHaveBeenCalledWith('mehery_demo_shopify_order_seq', 3)
  })
})
