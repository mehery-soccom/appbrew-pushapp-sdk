import { useAppStore } from '@gauntlet/state'
import { upsertLocalCartLine } from './store'

/** Natori demo: mirror an add-to-cart press into the local (MMKV) demo cart. */
export function mirrorProductToLocalCart(productData: any, qty = 1): void {
  const variantId =
    productData?.selectedVariantId ?? productData?.defaultVariantId
  if (!variantId && !productData?.handle) return
  const variant = variantId ? productData?.variants?.items?.[variantId] : undefined
  const price = Number(variant?.price?.amount ?? variant?.price ?? 0)
  const original = Number(
    variant?.compareAtPrice?.amount ?? variant?.compareAtPrice ?? price
  )
  const img =
    variant?.image?.url ??
    productData?.images?.items?.[0]?.url ??
    productData?.images?.[0]
  let currency: string | undefined
  try {
    currency = useAppStore.getState().localization.data.selectedCountry?.currency?.isoCode
  } catch {
    /* ignore */
  }
  upsertLocalCartLine({
    variantId: String(variantId || productData.handle),
    productId: productData?.id != null ? String(productData.id) : undefined,
    productHandle: productData?.handle,
    title: productData?.title || 'Product',
    image: typeof img === 'string' ? img : undefined,
    price,
    originalPrice: original,
    quantity: qty,
    vendor: productData?.vendor,
    productType: productData?.productType,
    sku: variant?.sku,
    currency: currency || 'INR',
  })
}
