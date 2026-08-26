import { AnalyticsEvent } from '@gauntlet/types'
import { useAppStore } from '@gauntlet/state'
import { quantitySelectorInterceptors } from '@gauntlet/components/molecules/quantity-selector'
import {
  AddToCart,
  atcInterceptors,
} from '@gauntlet/components/molecules/product-components/add-to-cart'
import { productCardComponentsMap } from '@gauntlet/components/molecules/generic-product-card/cardV2'
import { ProductQuantitySelector } from '@gauntlet/components/molecules/product-components/quantity-selector'
import * as React from 'react'
import { Pressable, View } from 'react-native'
import { sendMeheryCustomEvent } from './sendCustomEvent'
import { toAppBrewEventName } from './eventNames'

function currencyCode(): string | undefined {
  try {
    return useAppStore.getState().localization.data.selectedCountry?.currency
      ?.isoCode
  } catch {
    return undefined
  }
}

function cartPayloadFromLineItem(item: {
  variantId?: string
  title?: string
  image?: string
  priceAfterDiscount?: string
  originalPrice?: string | null
  productHandle?: string
  quantity?: number
}): Record<string, unknown> {
  const price = Number(item.priceAfterDiscount ?? 0)
  const original = Number(item.originalPrice ?? price)
  return {
    currency: currencyCode(),
    value: price,
    items: [
      {
        item_id: item.variantId,
        handle: item.productHandle,
        item_name: item.title,
        item_variant: item.variantId,
        price,
        original_price: original,
        discount: original > price ? original - price : 0,
        img_url: item.image,
        quantity: 1,
      },
    ],
  }
}

function cartPayloadFromProduct(productData: any): Record<string, unknown> {
  const variantId =
    productData?.selectedVariantId ?? productData?.defaultVariantId
  const variant = variantId
    ? productData?.variants?.items?.[variantId]
    : undefined
  const price = Number(variant?.price?.amount ?? variant?.price ?? 0)
  const original = Number(
    variant?.compareAtPrice?.amount ?? variant?.compareAtPrice ?? price
  )
  return {
    currency: currencyCode() ?? variant?.price?.currencyCode,
    value: price,
    items: [
      {
        item_id: variantId,
        handle: productData?.handle,
        item_name: productData?.title,
        item_variant: variantId,
        price,
        original_price: original,
        discount: original > price ? original - price : 0,
        img_url: productData?.images?.items?.[0]?.url,
        sku: variant?.sku,
        quantity: productData?.lineItem?.quantity ?? 1,
      },
    ],
  }
}

function emitCartCustomEvent(
  ga4Name: 'add_to_cart' | 'remove_from_cart',
  payload: Record<string, unknown>
): void {
  void sendMeheryCustomEvent(toAppBrewEventName(ga4Name), payload)
}

function TrackedProductQuantitySelector(props: any) {
  const quantity = Number(props.productData?.lineItem?.quantity ?? 1)
  const handle = props.productData?.handle
  const updateQuantity = useAppStore(
    (s) => s.products.updateSelectedVariantQuantity
  )

  return (
    <View>
      <View style={{ position: 'relative' }}>
        <ProductQuantitySelector {...props} />
        <Pressable
          accessibilityLabel="track-remove-from-cart"
          onPress={() => {
            emitCartCustomEvent(
              'remove_from_cart',
              cartPayloadFromProduct(props.productData)
            )
            if (quantity > 1 && handle) {
              updateQuantity(quantity - 1, handle)
            }
          }}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 48,
          }}
        />
        <Pressable
          accessibilityLabel="track-add-to-cart"
          onPress={() => {
            emitCartCustomEvent(
              'add_to_cart',
              cartPayloadFromProduct(props.productData)
            )
            if (handle) {
              updateQuantity(quantity + 1, handle)
            }
          }}
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: 48,
          }}
        />
      </View>
    </View>
  )
}

function TrackedAddToCart(props: any) {
  const variantId =
    props.productData?.selectedVariantId ?? props.productData?.defaultVariantId
  const available =
    props.productData?.variants?.items?.[variantId]?.availableForSale !== false

  if (available) {
    return <AddToCart {...props} />
  }

  return (
    <Pressable
      onPress={() =>
        emitCartCustomEvent(
          'add_to_cart',
          cartPayloadFromProduct(props.productData)
        )
      }
    >
      <AddToCart {...props} />
    </Pressable>
  )
}

let installed = false

/**
 * Fire AppBrew-add_to_cart / AppBrew-remove_from_cart on every plus/minus
 * (and OOS add-to-cart tap) via sendCustomEvent, even if Shopify rejects the mutation.
 */
export function installMeheryCartPressTracking(): void {
  if (installed) return
  installed = true

  quantitySelectorInterceptors.push(async (lineItem, newQuantity) => {
    const next = Number(newQuantity)
    const prev = Number(lineItem.quantity)
    if (!Number.isFinite(next) || next === prev) {
      return undefined
    }
    emitCartCustomEvent(
      next > prev ? 'add_to_cart' : 'remove_from_cart',
      cartPayloadFromLineItem(lineItem)
    )
    return undefined
  })

  atcInterceptors.push(async (productData) => {
    emitCartCustomEvent('add_to_cart', cartPayloadFromProduct(productData))
    return undefined
  })

  productCardComponentsMap['quantity-selector'] =
    TrackedProductQuantitySelector as typeof ProductQuantitySelector
  productCardComponentsMap['add-to-cart'] =
    TrackedAddToCart as typeof AddToCart
}
