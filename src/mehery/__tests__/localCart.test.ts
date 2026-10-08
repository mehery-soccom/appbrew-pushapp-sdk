jest.mock('@gauntlet/local-storage', () => {
  const store: Record<string, unknown> = {}
  return {
    LocalStorage: {
      getInstance: () => ({
        getJson: (key: string) => store[key],
        set: (key: string, value: unknown) => {
          store[key] = value
        },
        delete: (key: string) => {
          delete store[key]
        },
      }),
    },
  }
})

jest.mock('react-native-pushapp-appbrew/appbrew', () => ({
  getCartId: () => 'local_cart_test',
  getShopifyId: () => 'natori-appbrew.myshopify.com',
}))

import {
  clearLocalCartForTests,
  getLocalCartLines,
  seedDemoLocalCartIfEmpty,
  upsertLocalCartLine,
} from '../localCart/store'

describe('localCart store', () => {
  beforeEach(() => {
    clearLocalCartForTests()
  })

  it('seeds demo lines when empty', () => {
    const db = seedDemoLocalCartIfEmpty()
    expect(db.lines.length).toBeGreaterThanOrEqual(2)
    expect(getLocalCartLines().length).toBe(db.lines.length)
  })

  it('upserts quantity for same variant', () => {
    clearLocalCartForTests()
    upsertLocalCartLine({
      variantId: 'v1',
      title: 'Tee',
      price: 100,
      quantity: 1,
      currency: 'INR',
    })
    upsertLocalCartLine({
      variantId: 'v1',
      title: 'Tee',
      price: 100,
      quantity: 2,
      currency: 'INR',
    })
    expect(getLocalCartLines()).toHaveLength(1)
    expect(getLocalCartLines()[0].quantity).toBe(3)
  })
})
