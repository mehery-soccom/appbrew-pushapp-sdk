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
import {
  cartPayloadFromLineItem,
  cartPayloadFromProduct,
} from './itemPayload'
import { resolveShopDomain } from './shopDomain'
import { getCartId } from './commerceIds'
import { TrackedNotifyAddToCartShell } from './notifyPressEvents'
import { peekPushAppConfig } from './config'

function currencyCode(): string | undefined {
  try {
    return useAppStore.getState().localization.data.selectedCountry?.currency
      ?.isoCode
  } catch {
    return undefined
  }
}

function cartOptions() {
  return {
    currency: currencyCode(),
    shopDomain: resolveShopDomain(),
    cartId: getCartId(),
  }
}

function mirrorProductToLocalCart(productData: any, qty = 1): void {
  try {
    peekPushAppConfig()?.onAddToCart?.(productData, qty)
  } catch (e) {
    console.warn('[Mehery] onAddToCart hook failed', e)
  }
}

function emitCartCustomEvent(
  ga4Name: 'add_to_cart' | 'remove_from_cart',
  payload: Record<string, unknown> | null
): void {
  if (!payload) {
    return
  }
  // LOG so Event Analytics POSTs without waiting for /device/link
  void sendMeheryCustomEvent(ga4Name, payload, 'LOG')
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
              cartPayloadFromProduct(props.productData, cartOptions())
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
              cartPayloadFromProduct(props.productData, cartOptions())
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

  // OOS + Notify Me: dual-send notify_back_in_stock (not empty ATC shells).
  return (
    <TrackedNotifyAddToCartShell productData={props.productData}>
      <AddToCart {...props} />
    </TrackedNotifyAddToCartShell>
  )
}

let installed = false

/**
 * Fire add_to_cart / remove_from_cart on every plus/minus
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
      cartPayloadFromLineItem(lineItem, cartOptions())
    )
    return undefined
  })

  atcInterceptors.push(async (productData) => {
    emitCartCustomEvent(
      'add_to_cart',
      cartPayloadFromProduct(productData, cartOptions())
    )
    mirrorProductToLocalCart(productData, 1)
    // If Zustand still holds a cart id from a previous shop (catalog fallback
    // race), clear it so createEmptyCart runs on the active Storefront shop.
    try {
      const cart = useAppStore.getState().cart
      const id = cart?.data?.id != null ? String(cart.data.id).trim() : ''
      const lines = cart?.data?.lineItems?.length ?? 0
      if (id && lines === 0) {
        console.warn(
          '[Mehery] Clearing stale empty cart id before ATC',
          id
        )
        cart.resetCart()
      }
    } catch {
      /* ignore */
    }
    return undefined
  })

  productCardComponentsMap['quantity-selector'] =
    TrackedProductQuantitySelector as typeof ProductQuantitySelector
  productCardComponentsMap['add-to-cart'] =
    TrackedAddToCart as typeof AddToCart
}

export { cartPayloadFromLineItem, cartPayloadFromProduct }
