import {
  resolveProductUrl,
  wishlistPayloadFromProduct,
  WISHLIST_EXCEL_ITEM_KEYS,
} from '../wishlistPayload'
import {
  enrichOnlineStoreUrl,
  needsOnlineStoreUrlEnrichment,
} from '../enrichOnlineStoreUrl'

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

  it('builds https product url from shop domain + handle when onlineStoreUrl missing', () => {
    expect(
      resolveProductUrl({
        handle: 'silk-robe',
        shopDomain: 'natori-appbrew.myshopify.com',
      })
    ).toBe('https://natori-appbrew.myshopify.com/products/silk-robe')
  })

  it('strips protocol and trailing slash from shop domain', () => {
    expect(
      resolveProductUrl({
        handle: 'tee',
        shopDomain: 'https://shop.example/',
      })
    ).toBe('https://shop.example/products/tee')
  })

  it('returns undefined when neither url nor handle+domain available', () => {
    expect(resolveProductUrl({ handle: 'tee' })).toBeUndefined()
    expect(resolveProductUrl({ shopDomain: 'shop.example' })).toBeUndefined()
  })
})

describe('wishlistPayloadFromProduct', () => {
  const product = {
    id: 'gid://shopify/Product/1',
    handle: 'silk-robe',
    title: 'Silk Robe',
    selectedVariantId: 'gid://shopify/ProductVariant/9',
    defaultVariantId: 'gid://shopify/ProductVariant/9',
    productType: 'Lounge',
    vendor: 'Natori',
    onlineStoreUrl: null as string | null,
    images: { items: [{ url: 'https://cdn.example/robe.jpg' }] },
    variants: {
      items: {
        'gid://shopify/ProductVariant/9': {
          price: { amount: '120', currencyCode: 'USD' },
          compareAtPrice: { amount: '150', currencyCode: 'USD' },
          sku: 'ROBE-9',
          image: { url: 'https://cdn.example/robe-v.jpg' },
        },
      },
    },
  }

  it('includes currency, value, and full Excel items[] for wishlist / notify', () => {
    const payload = wishlistPayloadFromProduct(product, {
      shopDomain: 'natori-appbrew.myshopify.com',
      currency: 'USD',
    })

    expect(payload!.currency).toBe('USD')
    expect(payload!.value).toBe(120)
    const item = (payload!.items as Record<string, unknown>[])[0]
    expect(item).toEqual(
      expect.objectContaining({
        item_id: 'gid://shopify/ProductVariant/9',
        handle: 'silk-robe',
        item_name: 'Silk Robe',
        item_variant: 'gid://shopify/ProductVariant/9',
        price: 120,
        original_price: 150,
        discount: 30,
        url: 'https://natori-appbrew.myshopify.com/products/silk-robe',
        sku: 'ROBE-9',
        item_category: 'Lounge',
        item_brand: 'Natori',
        img_url: 'https://cdn.example/robe-v.jpg',
      })
    )
    for (const key of WISHLIST_EXCEL_ITEM_KEYS) {
      expect(item).toHaveProperty(key)
    }
  })

  it('still builds a payload without onlineStoreUrl (event must not be blocked)', () => {
    const payload = wishlistPayloadFromProduct(
      { ...product, onlineStoreUrl: undefined },
      { currency: 'INR' }
    )
    expect((payload!.items as unknown[])[0]).toEqual(
      expect.objectContaining({
        handle: 'silk-robe',
        item_name: 'Silk Robe',
      })
    )
  })

  it('returns null when product has no identity', () => {
    expect(wishlistPayloadFromProduct({ title: 'x' })).toBeNull()
  })
})

describe('enrichOnlineStoreUrl', () => {
  it('detects missing / blank onlineStoreUrl as needing enrichment', () => {
    expect(needsOnlineStoreUrlEnrichment({})).toBe(true)
    expect(needsOnlineStoreUrlEnrichment({ onlineStoreUrl: null })).toBe(true)
    expect(needsOnlineStoreUrlEnrichment({ onlineStoreUrl: '  ' })).toBe(true)
    expect(
      needsOnlineStoreUrlEnrichment({
        onlineStoreUrl: 'https://shop.example/products/x',
      })
    ).toBe(false)
  })

  it('fills url from domain + handle when missing (unblocks AddToWishlist)', () => {
    expect(
      enrichOnlineStoreUrl(
        { handle: 'silk-robe', onlineStoreUrl: null },
        'natori-appbrew.myshopify.com'
      )
    ).toBe('https://natori-appbrew.myshopify.com/products/silk-robe')
  })

  it('keeps existing onlineStoreUrl', () => {
    expect(
      enrichOnlineStoreUrl(
        {
          handle: 'silk-robe',
          onlineStoreUrl: 'https://shop.example/products/silk-robe',
        },
        'natori-appbrew.myshopify.com'
      )
    ).toBe('https://shop.example/products/silk-robe')
  })
})
