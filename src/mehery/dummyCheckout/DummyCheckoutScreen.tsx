import * as React from 'react'
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  useBlock,
  useBlockTestID,
  useLink,
  useResetCart,
} from '@gauntlet/state'
import { BaseBlockProps } from '@gauntlet/types'
import { allocateDemoOrderIds, getShopifyId, sendMeheryCustomEvent, PUSHAPP_CHECKOUT_EVENTS } from 'react-native-pushapp-appbrew/appbrew'
import { buildDummyCheckoutPayload } from './buildDummyCheckoutPayload'
import {
  LocalOrder,
  LocalOrderAddress,
  createLocalOrder,
} from '../localOrders/store'
import { LocalOrderDetail } from '../localOrders/LocalOrderDetail'
import {
  clearLocalCart,
  localCartToCheckoutShape,
  seedDemoLocalCartIfEmpty,
  subscribeLocalCart,
} from '../localCart/store'

type Step =
  | 'review'
  | 'shipping'
  | 'payment'
  | 'coupon'
  | 'confirmation'
  | 'track'

const DEFAULT_SHIPPING: LocalOrderAddress = {
  name: 'Demo Customer',
  address: '12 Demo Street',
  city: 'Mumbai',
  pincode: '400001',
}

const PAYMENT_METHODS = ['COD', 'Card'] as const

export function DummyCheckoutScreen(props: BaseBlockProps) {
  const block = useBlock(props.screenId, props.componentId, props.instanceId)
  const testID = useBlockTestID(block, props.screenId)
  const resetCart = useResetCart()
  const { gotoLink } = useLink()

  const [step, setStep] = React.useState<Step>('review')
  const [shipping, setShipping] =
    React.useState<LocalOrderAddress>(DEFAULT_SHIPPING)
  const [paymentMethod, setPaymentMethod] =
    React.useState<(typeof PAYMENT_METHODS)[number]>('COD')
  const [coupon, setCoupon] = React.useState('')
  const [appliedCoupon, setAppliedCoupon] = React.useState<string | undefined>()
  const [placedOrder, setPlacedOrder] = React.useState<LocalOrder | null>(null)
  const beginCheckoutSent = React.useRef(false)
  const [, bump] = React.useState(0)

  React.useEffect(() => {
    seedDemoLocalCartIfEmpty()
    bump((n) => n + 1)
  }, [])

  React.useEffect(() => subscribeLocalCart(() => bump((n) => n + 1)), [])

  const cart = localCartToCheckoutShape()
  const lineItems = cart.lineItems
  const currency = cart.payment.currencyCode
  const total = cart.payment.total

  React.useEffect(() => {
    if (beginCheckoutSent.current) return
    if (!lineItems.length) return
    beginCheckoutSent.current = true
    void sendMeheryCustomEvent(
      PUSHAPP_CHECKOUT_EVENTS.BEGIN_CHECKOUT,
      buildDummyCheckoutPayload(cart),
      'LOG'
    )
  }, [cart, lineItems.length])

  const fireCartLike = React.useCallback(
    (name: string, extras: Record<string, unknown> = {}) => {
      const payload = buildDummyCheckoutPayload(localCartToCheckoutShape(), {
        ...(appliedCoupon ? { coupon: appliedCoupon } : {}),
        ...extras,
      })
      void sendMeheryCustomEvent(name, payload)
    },
    [appliedCoupon]
  )

  const onContinueShipping = () => {
    fireCartLike(PUSHAPP_CHECKOUT_EVENTS.ADD_SHIPPING_INFO)
    setStep('payment')
  }

  const onContinuePayment = () => {
    fireCartLike(PUSHAPP_CHECKOUT_EVENTS.ADD_PAYMENT_INFO, {
      payment_method: paymentMethod,
    })
    setStep('coupon')
  }

  const onApplyCoupon = () => {
    const code = coupon.trim()
    if (!code) return
    setAppliedCoupon(code)
    void sendMeheryCustomEvent(
      PUSHAPP_CHECKOUT_EVENTS.APPLY_COUPON,
      {
        coupon: code,
        isApplicable: true,
        ...buildDummyCheckoutPayload(localCartToCheckoutShape(), {
          coupon: code,
        }),
      },
      'LOG'
    )
  }

  const onRemoveCoupon = () => {
    if (!appliedCoupon) return
    void sendMeheryCustomEvent(
      PUSHAPP_CHECKOUT_EVENTS.REMOVE_COUPON,
      { coupon: appliedCoupon },
      'LOG'
    )
    setAppliedCoupon(undefined)
    setCoupon('')
  }

  const onPlaceOrder = async () => {
    const ids = allocateDemoOrderIds()
    const shape = localCartToCheckoutShape()
    const payload = buildDummyCheckoutPayload(shape, {
      ...(appliedCoupon ? { coupon: appliedCoupon } : {}),
      transaction_id: ids.transaction_id,
      shopify_order_id: ids.shopify_order_id,
    })
    const order = createLocalOrder({
      id: ids.transaction_id,
      shopify_order_id: ids.shopify_order_id,
      cart_id:
        typeof payload.cart_id === 'string' ? payload.cart_id : undefined,
      shopify_id: getShopifyId(),
      currency: String(payload.currency ?? currency),
      value: Number(payload.value ?? total),
      items: Array.isArray(payload.items)
        ? (payload.items as Record<string, unknown>[])
        : [],
      shipping,
      paymentMethod,
      coupon: appliedCoupon,
    })
    await sendMeheryCustomEvent(
      PUSHAPP_CHECKOUT_EVENTS.PURCHASE,
      payload,
      'LOG'
    )
    clearLocalCart()
    try {
      await resetCart()
    } catch (e) {
      console.warn('[Mehery] resetCart after dummy purchase failed', e)
    }
    setPlacedOrder(order)
    setStep('confirmation')
  }

  if (step === 'track' && placedOrder) {
    return (
      <View style={styles.root} testID={testID}>
        <LocalOrderDetail
          orderId={placedOrder.id}
          onBack={() => setStep('confirmation')}
          onContinueShopping={() =>
            gotoLink({ kind: 'screen', value: 'home' })
          }
        />
      </View>
    )
  }

  if (step === 'confirmation' && placedOrder) {
    return (
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        testID={testID}
      >
        <Text style={styles.title}>Order placed</Text>
        <Text style={styles.sub}>
          Thank you! Your demo order is confirmed.
        </Text>
        <Text style={styles.meta}>Order: {placedOrder.id}</Text>
        <Text style={styles.meta}>
          Shopify: {placedOrder.shopify_order_id}
        </Text>
        <PrimaryButton
          label="Track order"
          onPress={() => {
            void sendMeheryCustomEvent(
              'order_click',
              {
                action: 'track_order',
                click_label: 'Track order',
                transaction_id: placedOrder.id,
                shopify_order_id: placedOrder.shopify_order_id,
                shopify_id: placedOrder.shopify_id,
                cart_id: placedOrder.cart_id,
                value: placedOrder.value,
                currency: placedOrder.currency,
                status: placedOrder.status,
                items: placedOrder.items,
              },
              'LOG'
            )
            setStep('track')
          }}
        />
        <PrimaryButton
          label="View all orders"
          onPress={() => {
            void sendMeheryCustomEvent(
              'order_click',
              {
                action: 'view_all_orders',
                click_label: 'View all orders',
                transaction_id: placedOrder.id,
                shopify_order_id: placedOrder.shopify_order_id,
                shopify_id: placedOrder.shopify_id,
                status: placedOrder.status,
              },
              'LOG'
            )
            // Prefer Order History screen (CMS); Account as fallback via second tap if needed.
            gotoLink({ kind: 'screen', value: 'order-history' })
          }}
        />
        <SecondaryButton
          label="Continue shopping"
          onPress={() => {
            void sendMeheryCustomEvent(
              'order_click',
              {
                action: 'continue_shopping',
                click_label: 'Continue shopping',
                transaction_id: placedOrder.id,
                shopify_order_id: placedOrder.shopify_order_id,
                shopify_id: placedOrder.shopify_id,
                status: placedOrder.status,
              },
              'LOG'
            )
            gotoLink({ kind: 'screen', value: 'home' })
          }}
        />
      </ScrollView>
    )
  }

  if (!lineItems.length && step === 'review') {
    return (
      <View style={[styles.root, styles.center]} testID={testID}>
        <Text style={styles.title}>Your cart is empty</Text>
        <Text style={styles.sub}>Add items from Cart or Home first.</Text>
        <PrimaryButton
          label="Go to cart"
          onPress={() => gotoLink({ kind: 'screen', value: 'cart' })}
        />
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      testID={testID}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Checkout</Text>
      <StepIndicator step={step} />

      {step === 'review' && (
        <>
          <Text style={styles.section}>Review cart</Text>
          {lineItems.map((item: any, idx: number) => (
            <View key={String(item.variantId ?? idx)} style={styles.row}>
              {item.image ? (
                <Image source={{ uri: item.image }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbPlaceholder]} />
              )}
              <View style={styles.rowBody}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.meta}>
                  Qty {item.quantity ?? 1} · {currency}{' '}
                  {item.priceAfterDiscount ?? '0'}
                </Text>
              </View>
            </View>
          ))}
          <Text style={styles.total}>
            Total: {currency} {total}
          </Text>
          {__DEV__ ? (
            <Text style={styles.debug}>cart_id: {String(cart.id)}</Text>
          ) : null}
          <PrimaryButton
            label="Continue to shipping"
            onPress={() => setStep('shipping')}
          />
        </>
      )}

      {step === 'shipping' && (
        <>
          <Text style={styles.section}>Shipping</Text>
          <Field
            label="Name"
            value={shipping.name}
            onChange={(name) => setShipping((s) => ({ ...s, name }))}
          />
          <Field
            label="Address"
            value={shipping.address}
            onChange={(address) => setShipping((s) => ({ ...s, address }))}
          />
          <Field
            label="City"
            value={shipping.city}
            onChange={(city) => setShipping((s) => ({ ...s, city }))}
          />
          <Field
            label="Pincode"
            value={shipping.pincode}
            onChange={(pincode) => setShipping((s) => ({ ...s, pincode }))}
            keyboardType="number-pad"
          />
          <PrimaryButton label="Continue" onPress={onContinueShipping} />
          <SecondaryButton label="Back" onPress={() => setStep('review')} />
        </>
      )}

      {step === 'payment' && (
        <>
          <Text style={styles.section}>Payment</Text>
          <View style={styles.chips}>
            {PAYMENT_METHODS.map((m) => (
              <Pressable
                key={m}
                onPress={() => setPaymentMethod(m)}
                style={[
                  styles.chip,
                  paymentMethod === m && styles.chipActive,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    paymentMethod === m && styles.chipTextActive,
                  ]}
                >
                  {m}
                </Text>
              </Pressable>
            ))}
          </View>
          <PrimaryButton label="Continue" onPress={onContinuePayment} />
          <SecondaryButton label="Back" onPress={() => setStep('shipping')} />
        </>
      )}

      {step === 'coupon' && (
        <>
          <Text style={styles.section}>Coupon</Text>
          <Field
            label="Code"
            value={coupon}
            onChange={setCoupon}
            autoCapitalize="characters"
          />
          <View style={styles.rowActions}>
            <PrimaryButton label="Apply" onPress={onApplyCoupon} />
            <SecondaryButton label="Remove" onPress={onRemoveCoupon} />
          </View>
          {appliedCoupon ? (
            <Text style={styles.meta}>Applied: {appliedCoupon}</Text>
          ) : null}
          <Text style={styles.total}>
            Total: {currency} {total}
          </Text>
          <PrimaryButton label="Place order" onPress={onPlaceOrder} />
          <SecondaryButton label="Back" onPress={() => setStep('payment')} />
        </>
      )}
    </ScrollView>
  )
}

function StepIndicator({ step }: { step: Step }) {
  const labels: Step[] = ['review', 'shipping', 'payment', 'coupon']
  if (step === 'confirmation' || step === 'track') return null
  return (
    <View style={styles.steps}>
      {labels.map((s) => (
        <Text
          key={s}
          style={[styles.stepLabel, step === s && styles.stepLabelActive]}
        >
          {s}
        </Text>
      ))}
    </View>
  )
}

function Field(props: {
  label: string
  value: string
  onChange: (v: string) => void
  keyboardType?: 'default' | 'number-pad'
  autoCapitalize?: 'none' | 'characters'
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChange}
        style={styles.input}
        keyboardType={props.keyboardType}
        autoCapitalize={props.autoCapitalize}
      />
    </View>
  )
}

function PrimaryButton({
  label,
  onPress,
}: {
  label: string
  onPress: () => void
}) {
  return (
    <Pressable onPress={onPress} style={styles.primaryBtn}>
      <Text style={styles.primaryBtnText}>{label}</Text>
    </Pressable>
  )
}

function SecondaryButton({
  label,
  onPress,
}: {
  label: string
  onPress: () => void
}) {
  return (
    <Pressable onPress={onPress} style={styles.secondaryBtn}>
      <Text style={styles.secondaryBtnText}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 48 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8, color: '#111' },
  sub: { fontSize: 15, color: '#555', marginBottom: 12 },
  section: {
    fontSize: 17,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 12,
    color: '#111',
  },
  meta: { fontSize: 13, color: '#666', marginBottom: 4 },
  debug: { fontSize: 11, color: '#999', marginBottom: 8 },
  total: { fontSize: 16, fontWeight: '600', marginVertical: 12, color: '#111' },
  row: { flexDirection: 'row', marginBottom: 12, alignItems: 'center' },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#eee' },
  thumbPlaceholder: { backgroundColor: '#ddd' },
  rowBody: { flex: 1, marginLeft: 12 },
  itemTitle: { fontSize: 15, fontWeight: '500', color: '#111' },
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  stepLabel: {
    fontSize: 12,
    color: '#999',
    textTransform: 'capitalize',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stepLabelActive: {
    color: '#111',
    fontWeight: '700',
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
  },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 13, color: '#666', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
  },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  chip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: '#111', borderColor: '#111' },
  chipText: { color: '#111', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  rowActions: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  primaryBtn: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  secondaryBtnText: { color: '#111', fontWeight: '500', fontSize: 15 },
})
