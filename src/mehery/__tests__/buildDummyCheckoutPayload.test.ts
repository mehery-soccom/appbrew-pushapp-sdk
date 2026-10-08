// The demo code imports from the package entry; keep the pure item helpers real.
jest.mock('react-native-pushapp-appbrew/appbrew', () => ({
  ...jest.requireActual('../../../vendor/react-native-pushapp-appbrew/src/appbrew/itemPayload'),
  getCartId: () => 'gid://shopify/Cart/abc',
  getShopifyId: () => '882211',
  resolveShopDomain: () => 'natori-appbrew.myshopify.com',
}))

import { buildDummyCheckoutPayload } from '../dummyCheckout/buildDummyCheckoutPayload'

describe('buildDummyCheckoutPayload', () => {
  const cart = {
    id: 'gid://shopify/Cart/abc',
    webUrl: 'https://shop.example/cart',
    lineItems: [
      {
        variantId: 'gid://shopify/ProductVariant/99',
        productId: 'gid://shopify/Product/11',
        productHandle: 'silk-robe',
        title: 'Silk Robe',
        image: 'https://cdn.example/robe.jpg',
        priceAfterDiscount: '100',
        originalPrice: '120',
        quantity: 2,
        vendor: 'Natori',
        productType: 'Lounge',
        sku: 'ROBE-1',
      },
    ],
    payment: {
      total: '200',
      lineItemsSubTotal: '240',
      subTotal: '200',
      currencyCode: 'INR',
    },
    discount: { code: 'SAVE10' },
  }

  it('includes cart_id, shopify_id, items, and cart-like fields', () => {
    const payload = buildDummyCheckoutPayload(cart)
    expect(payload).toMatchObject({
      url: 'https://shop.example/cart',
      value: 200,
      sub_total: 240,
      currency: 'INR',
      coupon: 'SAVE10',
      cart_id: 'gid://shopify/Cart/abc',
      shopify_id: '882211',
    })
    expect(payload.items).toEqual([
      expect.objectContaining({
        handle: 'silk-robe',
        item_name: 'Silk Robe',
        quantity: 2,
      }),
    ])
  })

  it('merges purchase ids from extras', () => {
    const payload = buildDummyCheckoutPayload(cart, {
      transaction_id: 'demo_txn_1',
      shopify_order_id: 'gid://shopify/Order/demo_1',
    })
    expect(payload.transaction_id).toBe('demo_txn_1')
    expect(payload.shopify_order_id).toBe('gid://shopify/Order/demo_1')
  })
})
