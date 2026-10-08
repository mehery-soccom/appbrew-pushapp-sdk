jest.mock('@gauntlet/types', () => ({
  AnalyticsEvent: {
    ADD_SHIPPING_INFO: 'add_shipping_info',
    ADD_PAYMENT_INFO: 'add_payment_info',
    APPLY_COUPON: 'apply_coupon',
    REMOVE_COUPON: 'remove_coupon',
    BEGIN_CHECKOUT: 'begin_checkout',
    PURCHASE: 'purchase',
  },
}))

import { AnalyticsEvent } from '@gauntlet/types'
import {
  CHECKOUT_BRIDGE_EVENTS,
  PUSHAPP_CHECKOUT_EVENTS,
  SHOPIFY_PIXEL_EVENTS,
  mergeCheckoutPayloadWithCart,
  resolveCheckoutBridgeAction,
  couponFromCheckoutPixel,
  toPushAppCheckoutEventName,
} from '../checkoutBridge'

describe('toPushAppCheckoutEventName', () => {
  it('maps Shopify pixel names to PushApp / GA4 names', () => {
    expect(toPushAppCheckoutEventName('checkout_started')).toBe('begin_checkout')
    expect(toPushAppCheckoutEventName('checkout_completed')).toBe('purchase')
    expect(toPushAppCheckoutEventName('payment_info_submitted')).toBe(
      'add_payment_info'
    )
    expect(toPushAppCheckoutEventName('checkout_shipping_info_submitted')).toBe(
      'add_shipping_info'
    )
    expect(toPushAppCheckoutEventName('checkout_address_info_submitted')).toBe(
      'add_shipping_info'
    )
    expect(toPushAppCheckoutEventName('checkout_discount_code_applied')).toBe(
      'apply_coupon'
    )
    expect(toPushAppCheckoutEventName('checkout_discount_code_removed')).toBe(
      'remove_coupon'
    )
  })

  it('passes already-aligned GA4 names through', () => {
    expect(toPushAppCheckoutEventName('begin_checkout')).toBe('begin_checkout')
    expect(toPushAppCheckoutEventName('purchase')).toBe('purchase')
  })
})

describe('mergeCheckoutPayloadWithCart', () => {
  it('prefers pixel fields and falls back to cart items', () => {
    expect(
      mergeCheckoutPayloadWithCart(
        { value: 99, currency: 'INR', items: [] },
        {
          value: 50,
          currency: 'INR',
          coupon: 'SAVE10',
          items: [{ item_id: 'v1', handle: 'tee' }],
        }
      )
    ).toEqual(
      expect.objectContaining({
        value: 99,
        currency: 'INR',
        coupon: 'SAVE10',
        items: [{ item_id: 'v1', handle: 'tee' }],
      })
    )
  })
})

describe('resolveCheckoutBridgeAction', () => {
  it('maps Shopify shipping pixel to ADD_SHIPPING_INFO with cart fallback', () => {
    const action = resolveCheckoutBridgeAction(
      SHOPIFY_PIXEL_EVENTS.SHIPPING_INFO_SUBMITTED,
      { currency: 'USD' },
      {
        currency: 'USD',
        value: 40,
        items: [{ item_id: 'v1' }],
      }
    )
    expect(action).toEqual({
      type: 'analytics',
      event: AnalyticsEvent.ADD_SHIPPING_INFO,
      payload: expect.objectContaining({
        currency: 'USD',
        value: 40,
        items: [{ item_id: 'v1' }],
      }),
    })
  })

  it('maps payment_info_submitted to ADD_PAYMENT_INFO', () => {
    const action = resolveCheckoutBridgeAction(
      SHOPIFY_PIXEL_EVENTS.PAYMENT_INFO_SUBMITTED,
      { currency: 'INR', value: 100 },
      null
    )
    expect(action).toEqual({
      type: 'analytics',
      event: AnalyticsEvent.ADD_PAYMENT_INFO,
      payload: expect.objectContaining({ currency: 'INR', value: 100 }),
    })
  })

  it('maps discount applied to APPLY_COUPON', () => {
    const action = resolveCheckoutBridgeAction(
      CHECKOUT_BRIDGE_EVENTS.DISCOUNT_CODE_APPLIED,
      { code: 'WELCOME' },
      { coupon: 'WELCOME' }
    )
    expect(action).toEqual({
      type: 'analytics',
      event: AnalyticsEvent.APPLY_COUPON,
      payload: { coupon: 'WELCOME', isApplicable: true },
    })
  })

  it('maps checkout_started to BEGIN_CHECKOUT', () => {
    const action = resolveCheckoutBridgeAction(
      CHECKOUT_BRIDGE_EVENTS.CHECKOUT_STARTED,
      {},
      { value: 10, currency: 'INR' }
    )
    expect(action.type).toBe('analytics')
    if (action.type === 'analytics') {
      expect(action.event).toBe(AnalyticsEvent.BEGIN_CHECKOUT)
      expect(action.payload).toEqual(
        expect.objectContaining({ value: 10, currency: 'INR' })
      )
    }
  })

  it('accepts already-aligned begin_checkout', () => {
    const action = resolveCheckoutBridgeAction(
      PUSHAPP_CHECKOUT_EVENTS.BEGIN_CHECKOUT,
      { value: 5 },
      null
    )
    expect(action.type).toBe('analytics')
    if (action.type === 'analytics') {
      expect(action.event).toBe(AnalyticsEvent.BEGIN_CHECKOUT)
    }
  })

  it('ignores purchase / checkout_completed (owned by purchase path)', () => {
    expect(
      resolveCheckoutBridgeAction(
        CHECKOUT_BRIDGE_EVENTS.CHECKOUT_COMPLETED,
        {},
        null
      )
    ).toEqual({ type: 'ignore' })
    expect(
      resolveCheckoutBridgeAction(PUSHAPP_CHECKOUT_EVENTS.PURCHASE, {}, null)
    ).toEqual({ type: 'ignore' })
  })
})

describe('couponFromCheckoutPixel', () => {
  it('reads discountApplications DISCOUNT_CODE title', () => {
    expect(
      couponFromCheckoutPixel({
        discountApplications: [
          { type: 'AUTOMATIC', title: 'auto' },
          { type: 'DISCOUNT_CODE', title: 'SAVE10' },
        ],
      })
    ).toBe('SAVE10')
  })
})
