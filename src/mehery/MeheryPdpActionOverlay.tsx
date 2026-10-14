import * as React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Toast from 'react-native-toast-message'
import { useAppStore, useLink, useProductByHandle } from '@gauntlet/state'
import { sendMeheryCustomEvent, cartPayloadFromProduct, resolveShopDomain, getCartId, PUSHAPP_CHECKOUT_EVENTS } from 'react-native-pushapp-appbrew/appbrew'
import { buildDummyCheckoutPayload } from './dummyCheckout/buildDummyCheckoutPayload'
import {
  localCartToCheckoutShape,
  upsertLocalCartLine,
} from './localCart/store'

/**
 * Always-on PDP footer overlay (independent of CMS add-to-cart-bar / footer).
 * Shows Add to cart + Buy Now + Checkout when on the products screen.
 */
export function MeheryPdpActionOverlay() {
  const insets = useSafeAreaInsets()
  const { gotoLink } = useLink()
  const routeName = useAppStore((s) => s.route.name)
  const productHandle = useAppStore((s) => {
    try {
      const cur = s.route.current?.() as
        | { params?: { productHandle?: string } }
        | undefined
      return cur?.params?.productHandle
    } catch {
      return undefined
    }
  })
  const product = useProductByHandle(productHandle)
  const addItemsToCart = useAppStore((s) => s.cart.addItemsToCart)
  const [busy, setBusy] = React.useState(false)

  const onProducts =
    typeof routeName === 'string' &&
    (routeName === 'products' ||
      routeName.toLowerCase().includes('product'))

  if (!onProducts) {
    return null
  }

  const productData = product.status === 'idle' ? product.data : undefined
  const variantId =
    productData?.selectedVariantId ?? productData?.defaultVariantId
  const quantity = Number(productData?.lineItem?.quantity ?? 1) || 1

  const addLocal = () => {
    if (!productData || !variantId) {
      // Still allow checkout with seeded cart
      return
    }
    const variant = productData.variants?.items?.[variantId]
    const price = Number(variant?.price?.amount ?? variant?.price ?? 0) || 2800
    const original =
      Number(
        variant?.compareAtPrice?.amount ?? variant?.compareAtPrice ?? price
      ) || price
    const img =
      variant?.image?.url ??
      productData.images?.items?.[0]?.url ??
      productData.images?.[0]
    upsertLocalCartLine({
      variantId: String(variantId),
      productId: productData.id != null ? String(productData.id) : undefined,
      productHandle: productData.handle,
      title: productData.title || 'Product',
      image: typeof img === 'string' ? img : undefined,
      price,
      originalPrice: original,
      quantity,
      vendor: productData.vendor,
      productType: productData.productType,
      sku: variant?.sku,
      currency: 'INR',
    })
    const payload = cartPayloadFromProduct(productData, {
      currency: 'INR',
      shopDomain: resolveShopDomain(),
      cartId: getCartId(),
    })
    if (payload) {
      void sendMeheryCustomEvent('add_to_cart', payload)
    }
  }

  const onAddToCart = async () => {
    addLocal()
    if (variantId) {
      try {
        await addItemsToCart([{ variantId, quantity }])
      } catch {
        /* ignore */
      }
    }
    Toast.show({ type: 'success', text1: 'Added to cart' })
  }

  const onBuyNow = async () => {
    if (busy) return
    setBusy(true)
    try {
      addLocal()
      if (variantId) {
        try {
          await addItemsToCart([{ variantId, quantity }])
        } catch {
          /* ignore */
        }
      }
      void sendMeheryCustomEvent(
        PUSHAPP_CHECKOUT_EVENTS.BEGIN_CHECKOUT,
        buildDummyCheckoutPayload(localCartToCheckoutShape())
      )
      gotoLink({
        kind: 'screen',
        value: 'payment',
        params: { redirectTo: 'cart' },
      })
    } finally {
      setBusy(false)
    }
  }

  const onCheckout = () => {
    addLocal()
    void sendMeheryCustomEvent(
      PUSHAPP_CHECKOUT_EVENTS.BEGIN_CHECKOUT,
      buildDummyCheckoutPayload(localCartToCheckoutShape())
    )
    gotoLink({
      kind: 'screen',
      value: 'payment',
      params: { redirectTo: 'cart' },
    })
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.overlay, { paddingBottom: Math.max(insets.bottom, 10) }]}
    >
      <View style={styles.bar}>
        <Pressable style={[styles.btn, styles.secondary]} onPress={onAddToCart}>
          <Text style={styles.secondaryText}>Add to cart</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.primary]}
          onPress={onBuyNow}
          disabled={busy}
        >
          <Text style={styles.primaryText}>{busy ? '…' : 'Buy Now'}</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.primary]} onPress={onCheckout}>
          <Text style={styles.primaryText}>Checkout</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
  },
  bar: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingTop: 10,
    gap: 8,
  },
  btn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: '#111' },
  secondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#111',
  },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  secondaryText: { color: '#111', fontWeight: '700', fontSize: 13 },
})
