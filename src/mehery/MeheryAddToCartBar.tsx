import * as React from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Toast from 'react-native-toast-message'
import { AddToCart } from '@gauntlet/components/molecules/product-components/add-to-cart'
import {
  useBlockSettings,
  useBlockStyle,
} from '@gauntlet/components/style-utils'
import {
  useAppStore,
  useBlock,
  useBlockTestID,
  useLink,
  useProductByHandle,
} from '@gauntlet/state'
import { BaseBlockProps, ProductHandle } from '@gauntlet/types'
import { sendMeheryCustomEvent } from './sendCustomEvent'
import { cartPayloadFromProduct } from './itemPayload'
import { resolveShopDomain } from './shopDomain'
import { getCartId } from './commerceIds'
import { buildDummyCheckoutPayload } from './dummyCheckout/buildDummyCheckoutPayload'
import { PUSHAPP_CHECKOUT_EVENTS } from './checkoutBridge'
import {
  localCartToCheckoutShape,
  upsertLocalCartLine,
} from './localCart/store'

type Props = BaseBlockProps & {
  productHandle?: ProductHandle
  setDynamicFooter?: (el: React.ReactElement | null) => void
}

function resolveHandle(props: Props): string | undefined {
  if (props.productHandle) return String(props.productHandle)
  try {
    const route = useAppStore.getState().route.current?.() as
      | { params?: { productHandle?: string } }
      | undefined
    const fromRoute = route?.params?.productHandle
    if (fromRoute) return String(fromRoute)
  } catch {
    /* ignore */
  }
  return undefined
}

/**
 * PDP footer: Add to cart + Buy Now + Cart.
 * Must NOT use position:absolute — screen footer collapses to 0 height otherwise.
 */
export function MeheryAddToCartBar(props: Props) {
  const { screenId, componentId, instanceId } = props
  const block = useBlock(screenId, componentId, instanceId)
  const style = useBlockStyle(block)
  const settings = useBlockSettings(block)
  const testID = useBlockTestID(block, screenId)
  const source = (block as any)?.source
  const insets = useSafeAreaInsets()
  const { gotoLink } = useLink()

  const productHandle = resolveHandle(props)
  const product = useProductByHandle(productHandle)
  const [busy, setBusy] = React.useState(false)
  const addItemsToCart = useAppStore((store) => store.cart.addItemsToCart)

  const productData = product.status === 'idle' ? product.data : undefined
  const variantId =
    productData?.selectedVariantId ?? productData?.defaultVariantId
  const quantity = Number(productData?.lineItem?.quantity ?? 1) || 1

  const addToLocalAndEvents = React.useCallback(() => {
    if (!productData || !variantId) return
    const variant = productData.variants?.items?.[variantId]
    const price = Number(variant?.price?.amount ?? variant?.price ?? 0)
    const original = Number(
      variant?.compareAtPrice?.amount ?? variant?.compareAtPrice ?? price
    )
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
      price: price || 2800,
      originalPrice: original || price || 2800,
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
      void sendMeheryCustomEvent('add_to_cart', payload, 'LOG')
    }
  }, [productData, variantId, quantity])

  const handleBuyNow = React.useCallback(async () => {
    if (!productData || !variantId || busy) return
    setBusy(true)
    try {
      addToLocalAndEvents()
      try {
        await addItemsToCart([{ variantId, quantity }])
      } catch {
        /* Shopify optional */
      }
      void sendMeheryCustomEvent(
        PUSHAPP_CHECKOUT_EVENTS.BEGIN_CHECKOUT,
        buildDummyCheckoutPayload(localCartToCheckoutShape()),
        'LOG'
      )
      Toast.show({ type: 'success', text1: 'Buy Now', text2: 'Opening checkout…' })
      gotoLink({
        kind: 'screen',
        value: 'payment',
        params: { redirectTo: 'cart' },
      })
    } catch (e) {
      console.warn('[Mehery] Buy Now failed', e)
      Toast.show({ type: 'error', text1: 'Buy Now failed' })
    } finally {
      setBusy(false)
    }
  }, [
    productData,
    variantId,
    busy,
    addToLocalAndEvents,
    addItemsToCart,
    quantity,
    gotoLink,
  ])

  const handleCheckout = () => {
    if (productData && variantId) {
      addToLocalAndEvents()
    }
    void sendMeheryCustomEvent(
      PUSHAPP_CHECKOUT_EVENTS.BEGIN_CHECKOUT,
      buildDummyCheckoutPayload(localCartToCheckoutShape()),
      'LOG'
    )
    gotoLink({
      kind: 'screen',
      value: 'payment',
      params: { redirectTo: 'cart' },
    })
  }

  const handleGoCart = () => {
    if (productData && variantId) {
      addToLocalAndEvents()
    }
    gotoLink({ kind: 'screen', value: 'cart' })
  }

  // Fallback bar even if product still loading — always show checkout actions.
  if (!productData) {
    return (
      <View
        testID={testID}
        style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}
      >
        <ActionBtn label="Cart" onPress={handleGoCart} secondary />
        <ActionBtn label="Checkout" onPress={handleCheckout} />
      </View>
    )
  }

  const addToCartOptions = {
    ...settings?.options?.addToCart,
    buttonTitle: source?.buttonText || 'Add to cart',
  }

  return (
    <View
      testID={testID}
      style={[
        styles.bar,
        { paddingBottom: Math.max(insets.bottom, 12) },
        style?.root,
      ]}
    >
      <View style={styles.atcWrap}>
        <AddToCart
          productData={productData}
          style={{
            root: {
              marginHorizontal: 0,
              alignSelf: 'stretch',
              ...style?.addToCartButton?.root,
            },
            ...style?.addToCartButton,
          }}
          options={addToCartOptions}
          testID={testID ? `${testID}-atc` : undefined}
        />
      </View>
      <ActionBtn
        label={busy ? '…' : 'Buy Now'}
        onPress={handleBuyNow}
        disabled={busy}
        testID={testID ? `${testID}-buy-now` : 'buy-now'}
      />
      <ActionBtn
        label="Checkout"
        onPress={handleCheckout}
        testID={testID ? `${testID}-checkout` : 'pdp-checkout'}
      />
    </View>
  )
}

function ActionBtn({
  label,
  onPress,
  secondary,
  disabled,
  testID,
}: {
  label: string
  onPress: () => void
  secondary?: boolean
  disabled?: boolean
  testID?: string
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.btn,
        secondary ? styles.btnSecondary : styles.btnPrimary,
        disabled && styles.btnDisabled,
      ]}
    >
      <Text style={secondary ? styles.btnSecondaryText : styles.btnText}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 10,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5e5',
    gap: 8,
  },
  atcWrap: { flex: 1.2, minWidth: 0 },
  btn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: '#111' },
  btnSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#111',
  },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  btnSecondaryText: { color: '#111', fontWeight: '700', fontSize: 13 },
})
