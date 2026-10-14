const mockStore: Record<string, unknown> = {}

jest.mock('@gauntlet/local-storage', () => ({
  LocalStorage: {
    getInstance: () => ({
      getJson: (key: string) => mockStore[key],
      set: (key: string, value: unknown) => {
        mockStore[key] = value
      },
      delete: (key: string) => {
        delete mockStore[key]
      },
    }),
  },
}))

jest.mock('react-native-pushapp-appbrew/appbrew', () => ({
  sendMeheryCustomEvent: jest.fn(() => Promise.resolve(true)),
}))

import {
  advanceLocalOrderStatus,
  clearLocalOrdersForTests,
  createLocalOrder,
  listLocalOrders,
  nextTransitStatus,
  refundLocalOrder,
} from '../localOrders/store'
import { sendMeheryCustomEvent } from 'react-native-pushapp-appbrew/appbrew'

describe('localOrders store', () => {
  beforeEach(() => {
    clearLocalOrdersForTests()
    Object.keys(mockStore).forEach((k) => delete mockStore[k])
    ;(sendMeheryCustomEvent as jest.Mock).mockClear()
  })

  it('persists create and list', () => {
    createLocalOrder({
      id: 'txn-1',
      shopify_order_id: 'gid://shopify/Order/demo_1',
      shopify_id: 'shop.example',
      currency: 'INR',
      value: 100,
      items: [{ item_name: 'Robe', quantity: 1 }],
    })
    expect(listLocalOrders()).toHaveLength(1)
    expect(listLocalOrders()[0].status).toBe('placed')
  })

  it('advances transit statuses', () => {
    createLocalOrder({
      id: 'txn-2',
      shopify_order_id: 'gid://shopify/Order/demo_2',
      shopify_id: 'shop.example',
      currency: 'INR',
      value: 50,
      items: [],
    })
    expect(nextTransitStatus('placed')).toBe('confirmed')
    advanceLocalOrderStatus('txn-2')
    expect(listLocalOrders()[0].status).toBe('confirmed')
    advanceLocalOrderStatus('txn-2')
    expect(listLocalOrders()[0].status).toBe('in_transit')
  })

  it('refunds and sets reason', () => {
    createLocalOrder({
      id: 'txn-3',
      shopify_order_id: 'gid://shopify/Order/demo_3',
      shopify_id: 'shop.example',
      currency: 'INR',
      value: 80,
      items: [],
    })
    const updated = refundLocalOrder('txn-3', 'Damaged')
    expect(updated?.status).toBe('refunded')
    expect(updated?.refundReason).toBe('Damaged')
  })
})

describe('refund event payload shape', () => {
  it('matches PushApp refund contract', async () => {
    const order = createLocalOrder({
      id: 'txn-refund',
      shopify_order_id: 'gid://shopify/Order/demo_9',
      shopify_id: 'natori-appbrew.myshopify.com',
      currency: 'INR',
      value: 199,
      items: [],
    })
    const refunded = refundLocalOrder(order.id, 'Changed mind')!
    await sendMeheryCustomEvent(
      'refund',
      {
        reason: refunded.refundReason,
        transaction_id: refunded.id,
        shopify_order_id: refunded.shopify_order_id,
        shopify_id: refunded.shopify_id,
        value: refunded.value,
        currency: refunded.currency,
      }
    )
    expect(sendMeheryCustomEvent).toHaveBeenCalledWith(
      'refund',
      expect.objectContaining({
        reason: 'Changed mind',
        transaction_id: 'txn-refund',
        shopify_order_id: 'gid://shopify/Order/demo_9',
        shopify_id: 'natori-appbrew.myshopify.com',
        value: 199,
        currency: 'INR',
      })
    )
  })
})

describe('orderEvents payload', () => {
  it('includes order identity on every track event', () => {
    const { buildOrderEventPayload } = require('../localOrders/orderEvents')
    const order = createLocalOrder({
      id: 'txn-view',
      shopify_order_id: 'gid://shopify/Order/demo_view',
      shopify_id: 'natori-appbrew.myshopify.com',
      currency: 'INR',
      value: 50,
      items: [{ item_name: 'Robe', quantity: 1 }],
      cart_id: 'cart_abc',
    })
    expect(buildOrderEventPayload(order, { action: 'view' })).toEqual(
      expect.objectContaining({
        transaction_id: 'txn-view',
        shopify_order_id: 'gid://shopify/Order/demo_view',
        shopify_id: 'natori-appbrew.myshopify.com',
        cart_id: 'cart_abc',
        value: 50,
        currency: 'INR',
        status: 'placed',
        action: 'view',
      })
    )
  })
})
