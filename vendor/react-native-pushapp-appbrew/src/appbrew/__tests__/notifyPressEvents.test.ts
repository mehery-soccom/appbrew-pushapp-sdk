jest.mock('../sendCustomEvent', () => ({
  sendMeheryCustomEvent: jest.fn(() => Promise.resolve(true)),
}))

jest.mock('@gauntlet/state', () => ({
  useAppStore: {
    getState: jest.fn(() => ({
      localization: {
        data: { selectedCountry: { currency: { isoCode: 'USD' } } },
      },
      config: { data: undefined },
    })),
  },
}))

import {
  emitNotifyBackInStockFromProduct,
  notifyPayloadFromProduct,
} from '../notifyPayload'

const { sendMeheryCustomEvent } = jest.requireMock('../sendCustomEvent') as {
  sendMeheryCustomEvent: jest.Mock
}

const product = {
  handle: 'silk-robe',
  title: 'Silk Robe',
  vendor: 'Natori',
  productType: 'Lounge',
  selectedVariantId: 'v1',
  defaultVariantId: 'v1',
  variants: {
    items: {
      v1: {
        price: { amount: '40', currencyCode: 'USD' },
        compareAtPrice: { amount: '50' },
        sku: 'R1',
      },
    },
  },
  images: { items: [{ url: 'https://cdn.example/r.jpg' }] },
}

describe('notifyPayloadFromProduct / emitNotifyBackInStockFromProduct', () => {
  beforeEach(() => {
    sendMeheryCustomEvent.mockClear()
  })

  it('builds Excel items (currency, value, full items[])', () => {
    const payload = notifyPayloadFromProduct(product, {
      shopDomain: 'shop.example',
      currency: 'USD',
    })
    expect(payload).toEqual(
      expect.objectContaining({
        currency: 'USD',
        value: 40,
        items: [
          expect.objectContaining({
            item_id: 'v1',
            handle: 'silk-robe',
            item_name: 'Silk Robe',
            item_variant: 'v1',
            price: 40,
            original_price: 50,
            discount: 10,
            url: 'https://shop.example/products/silk-robe',
            sku: 'R1',
            item_category: 'Lounge',
            item_brand: 'Natori',
            img_url: 'https://cdn.example/r.jpg',
          }),
        ],
      })
    )
  })

  it('emits notify_back_in_stock via LOG', () => {
    expect(emitNotifyBackInStockFromProduct(product)).toBe(true)
    expect(sendMeheryCustomEvent).toHaveBeenCalledWith(
      'notify_back_in_stock',
      expect.objectContaining({
        items: [expect.objectContaining({ handle: 'silk-robe' })],
      }),
      'LOG'
    )
  })

  it('skips when handle or variant missing', () => {
    expect(notifyPayloadFromProduct({})).toBeNull()
    expect(notifyPayloadFromProduct({ handle: 'tee' })).toBeNull()
    expect(emitNotifyBackInStockFromProduct({})).toBe(false)
    expect(sendMeheryCustomEvent).not.toHaveBeenCalled()
  })
})
