import {
  buildExcelItem,
  cartPayloadFromLineItem,
  cartPayloadFromProduct,
  enrichAnalyticsItem,
  enrichListUrl,
  ensureCommerceCurrencyAndValue,
  hasExcelItemIdentity,
  normalizeAnalyticsItems,
  rebuildAnalyticsItem,
  resolveProductUrl,
} from '../itemPayload'

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
      cart: { data: { id: 'gid://shopify/Cart/test-cart' } },
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

describe('resolveProductUrl', () => {
  it('prefers onlineStoreUrl when present', () => {
    expect(
      resolveProductUrl({
        onlineStoreUrl: 'https://shop.example/products/tee',
        handle: 'tee',
        shopDomain: 'shop.example',
      })
    ).toBe('https://shop.example/products/tee')
  })

  it('builds https product url from shop domain + handle', () => {
    expect(
      resolveProductUrl({
        handle: 'silk-robe',
        shopDomain: 'natori-appbrew.myshopify.com',
      })
    ).toBe('https://natori-appbrew.myshopify.com/products/silk-robe')
  })
})

describe('normalizeAnalyticsItems / hasExcelItemIdentity', () => {
  it('turns Gauntlet items:{} into items:[]', () => {
    expect(
      normalizeAnalyticsItems({
        currency: 'INR',
        value: 10,
        items: {},
      })
    ).toEqual({ currency: 'INR', value: 10, items: [] })
  })

  it('drops items without handle or item_id', () => {
    expect(
      normalizeAnalyticsItems({
        items: [{ price: 0 }, { item_id: 'v1', handle: 'tee' }],
      })
    ).toEqual({
      items: [{ item_id: 'v1', handle: 'tee' }],
    })
  })

  it('hasExcelItemIdentity requires handle or item_id', () => {
    expect(hasExcelItemIdentity({ price: 1 } as any)).toBe(false)
    expect(hasExcelItemIdentity({ handle: 'tee' })).toBe(true)
    expect(hasExcelItemIdentity({ item_id: 'v1' })).toBe(true)
  })
})

describe('buildExcelItem', () => {
  it('includes url, brand, category, img_url when inputs exist', () => {
    expect(
      buildExcelItem({
        item_id: 'v1',
        handle: 'silk-robe',
        item_name: 'Silk Robe',
        item_variant: 'v1',
        price: 100,
        original_price: 120,
        sku: 'SKU-1',
        quantity: 2,
        img_url: 'https://cdn.example/a.jpg',
        item_brand: 'Natori',
        item_category: 'Lounge',
        shopDomain: 'shop.example',
      })
    ).toEqual(
      expect.objectContaining({
        url: 'https://shop.example/products/silk-robe',
        item_brand: 'Natori',
        item_category: 'Lounge',
        img_url: 'https://cdn.example/a.jpg',
        discount: 20,
        quantity: 2,
      })
    )
  })

  it('omits empty optional fields', () => {
    const item = buildExcelItem({
      item_id: 'v1',
      handle: 'tee',
      price: 10,
      item_brand: '',
      item_category: null,
    })
    expect(item.item_brand).toBeUndefined()
    expect(item.item_category).toBeUndefined()
    expect(item.url).toBeUndefined()
  })
})

describe('enrichAnalyticsItem', () => {
  it('maps vendor / productType aliases and fills url', () => {
    expect(
      enrichAnalyticsItem(
        {
          handle: 'silk-robe',
          vendor: 'Natori',
          productType: 'Lounge',
          image: 'https://cdn.example/x.jpg',
        },
        'shop.example'
      )
    ).toEqual(
      expect.objectContaining({
        url: 'https://shop.example/products/silk-robe',
        item_brand: 'Natori',
        item_category: 'Lounge',
        img_url: 'https://cdn.example/x.jpg',
      })
    )
  })

  it('maps brand / categories aliases used by ProductInfo', () => {
    expect(
      enrichAnalyticsItem(
        {
          handle: 'tee',
          brand: 'Natori',
          categories: 'Tops',
        },
        'shop.example'
      )
    ).toEqual(
      expect.objectContaining({
        item_brand: 'Natori',
        item_category: 'Tops',
        url: 'https://shop.example/products/tee',
      })
    )
  })
})

describe('rebuildAnalyticsItem (view_item shape)', () => {
  it('rebuilds via buildExcelItem and fills from catalog when item is sparse', () => {
    const item = rebuildAnalyticsItem(
      { handle: 'silk-robe', price: 80 },
      'shop.example',
      {
        handle: 'silk-robe',
        title: 'Silk Robe',
        vendor: 'Natori',
        productType: 'Lounge',
        onlineStoreUrl: '',
        defaultVariantId: 'v9',
        images: { items: [{ url: 'https://cdn.example/robe.jpg' }] },
        variants: {
          items: {
            v9: {
              sku: 'ROBE-9',
              price: { amount: '80' },
              compareAtPrice: { amount: '100' },
              image: { url: 'https://cdn.example/variant.jpg' },
            },
          },
        },
      }
    )
    expect(item).toEqual(
      expect.objectContaining({
        handle: 'silk-robe',
        item_name: 'Silk Robe',
        item_brand: 'Natori',
        item_category: 'Lounge',
        item_variant: 'v9',
        img_url: 'https://cdn.example/variant.jpg',
        url: 'https://shop.example/products/silk-robe',
        sku: 'ROBE-9',
      })
    )
  })

  it('does not keep empty undefined item shells when item has no object shape', () => {
    // callers filter non-objects; rebuild still returns Excel keys for sparse objects
    const item = rebuildAnalyticsItem({}, 'shop.example')
    expect(item.url).toBeUndefined()
    expect(item.item_brand).toBeUndefined()
  })
})

describe('cartPayloadFromLineItem / cartPayloadFromProduct', () => {
  it('add_to_cart line item includes Excel item keys', () => {
    const payload = cartPayloadFromLineItem(
      {
        variantId: 'gid://shopify/ProductVariant/1',
        title: 'Silk Robe',
        image: 'https://cdn.example/robe.jpg',
        priceAfterDiscount: '100',
        originalPrice: '120',
        productHandle: 'silk-robe',
        vendor: 'Natori',
        productType: 'Lounge',
        sku: 'ROBE-1',
        url: 'https://shop.example/products/silk-robe',
      },
      { currency: 'USD', shopDomain: 'shop.example' }
    )
    expect(payload!.currency).toBe('USD')
    expect(payload!.cart_id).toBe('gid://shopify/Cart/test-cart')
    expect(payload!.shopify_id).toBe('882211')
    expect(payload!.items).toEqual([
      expect.objectContaining({
        handle: 'silk-robe',
        item_name: 'Silk Robe',
        item_brand: 'Natori',
        item_category: 'Lounge',
        img_url: 'https://cdn.example/robe.jpg',
        url: 'https://shop.example/products/silk-robe',
        sku: 'ROBE-1',
        quantity: 1,
      }),
    ])
  })

  it('builds url from handle when line item url is null', () => {
    const payload = cartPayloadFromLineItem(
      {
        variantId: 'v1',
        title: 'Tee',
        priceAfterDiscount: '10',
        productHandle: 'tee',
        vendor: 'Natori',
        productType: 'Tops',
        url: null,
      },
      { shopDomain: 'shop.example' }
    )
    expect(payload!.items).toEqual([
      expect.objectContaining({
        url: 'https://shop.example/products/tee',
        item_brand: 'Natori',
        item_category: 'Tops',
      }),
    ])
  })

  it('remove_from_cart product payload includes Excel item keys', () => {
    const payload = cartPayloadFromProduct(
      {
        handle: 'silk-robe',
        title: 'Silk Robe',
        vendor: 'Natori',
        productType: 'Lounge',
        selectedVariantId: 'v9',
        defaultVariantId: 'v9',
        images: { items: [{ url: 'https://cdn.example/robe.jpg' }] },
        variants: {
          items: {
            v9: {
              price: { amount: '80', currencyCode: 'USD' },
              compareAtPrice: { amount: '100' },
              sku: 'ROBE-9',
            },
          },
        },
      },
      { shopDomain: 'shop.example' }
    )
    expect(payload!.items).toEqual([
      expect.objectContaining({
        item_variant: 'v9',
        item_brand: 'Natori',
        item_category: 'Lounge',
        url: 'https://shop.example/products/silk-robe',
        discount: 20,
      }),
    ])
  })

  it('returns null when line item has no identity', () => {
    expect(
      cartPayloadFromLineItem({ title: 'x', priceAfterDiscount: '10' })
    ).toBeNull()
  })

  it('returns null when product has no handle or variant', () => {
    expect(cartPayloadFromProduct({ title: 'x' })).toBeNull()
  })
})

describe('enrichListUrl', () => {
  it('fills collection url from handle', () => {
    expect(
      enrichListUrl(
        { handle: 'lounge', item_list_name: 'Lounge' },
        'shop.example'
      )
    ).toEqual(
      expect.objectContaining({
        url: 'https://shop.example/collections/lounge',
      })
    )
  })
})

describe('ensureCommerceCurrencyAndValue', () => {
  it('fills missing currency and value from items + fallback', () => {
    expect(
      ensureCommerceCurrencyAndValue(
        {
          items: [
            { price: 40, quantity: 2 },
            { price: 10 },
          ],
        },
        'USD'
      )
    ).toEqual({
      items: [
        { price: 40, quantity: 2 },
        { price: 10 },
      ],
      currency: 'USD',
      value: 90,
    })
  })

  it('keeps existing currency and value', () => {
    expect(
      ensureCommerceCurrencyAndValue(
        { currency: 'INR', value: 5, items: [{ price: 99 }] },
        'USD'
      )
    ).toEqual({ currency: 'INR', value: 5, items: [{ price: 99 }] })
  })
})
