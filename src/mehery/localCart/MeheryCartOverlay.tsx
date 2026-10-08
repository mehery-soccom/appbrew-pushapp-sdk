import * as React from 'react'
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAppStore, useLink } from '@gauntlet/state'
import { sendMeheryCustomEvent, PUSHAPP_CHECKOUT_EVENTS } from 'react-native-pushapp-appbrew/appbrew'
import { buildDummyCheckoutPayload } from '../dummyCheckout/buildDummyCheckoutPayload'
import {
  LocalCartLine,
  getLocalCartLines,
  getLocalCartTotal,
  localCartToCheckoutShape,
  removeLocalCartLine,
  seedDemoLocalCartIfEmpty,
  setLocalCartLineQuantity,
  subscribeLocalCart,
  upsertLocalCartLine,
} from './store'

/**
 * Full-screen cart overlay when route is `cart`.
 * Bypasses CMS EmptyCart — always shows local demo / added lines.
 */
export function MeheryCartOverlay() {
  const insets = useSafeAreaInsets()
  const { gotoLink } = useLink()
  const routeName = useAppStore((s) => s.route.name)
  const [, bump] = React.useState(0)
  const viewCartSent = React.useRef(false)

  React.useEffect(() => subscribeLocalCart(() => bump((n) => n + 1)), [])

  const onCart =
    typeof routeName === 'string' &&
    (routeName === 'cart' || routeName.toLowerCase() === 'cart')

  React.useEffect(() => {
    if (!onCart) return
    seedDemoLocalCartIfEmpty()
    bump((n) => n + 1)
  }, [onCart])

  React.useEffect(() => {
    if (!onCart || viewCartSent.current) return
    const lines = getLocalCartLines()
    if (!lines.length) return
    viewCartSent.current = true
    void sendMeheryCustomEvent(
      'view_cart',
      buildDummyCheckoutPayload(localCartToCheckoutShape()),
      'LOG'
    )
  }, [onCart])

  if (!onCart) {
    return null
  }

  const lines = getLocalCartLines()
  const total = getLocalCartTotal()
  const currency = lines[0]?.currency || 'INR'

  const onCheckout = () => {
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

  return (
    <View
      style={[
        styles.overlay,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 },
      ]}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => gotoLink({ kind: 'screen', value: 'home' })}
          hitSlop={12}
        >
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Cart</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sub}>
          {lines.length} item{lines.length === 1 ? '' : 's'} · Demo cart
        </Text>

        {lines.map((line) => (
          <CartLineRow
            key={line.id}
            line={line}
            onBump={() => bump((n) => n + 1)}
          />
        ))}

        <Pressable
          style={styles.addMore}
          onPress={() => {
            upsertLocalCartLine({
              variantId: `demo_extra_${Date.now()}`,
              title: 'Extra Demo Item',
              price: 1500,
              quantity: 1,
              currency: 'INR',
            })
            bump((n) => n + 1)
          }}
        >
          <Text style={styles.addMoreText}>+ Add another demo item</Text>
        </Pressable>

        <View style={styles.totals}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>
            {currency} {total.toFixed(0)}
          </Text>
        </View>

        <Pressable style={styles.checkoutBtn} onPress={onCheckout}>
          <Text style={styles.checkoutText}>Checkout</Text>
        </Pressable>

        <Pressable
          style={styles.secondaryBtn}
          onPress={() => gotoLink({ kind: 'screen', value: 'home' })}
        >
          <Text style={styles.secondaryText}>Continue shopping</Text>
        </Pressable>
      </ScrollView>
    </View>
  )
}

function CartLineRow({
  line,
  onBump,
}: {
  line: LocalCartLine
  onBump: () => void
}) {
  return (
    <View style={styles.row}>
      {line.image ? (
        <Image source={{ uri: line.image }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]} />
      )}
      <View style={styles.rowBody}>
        <Text style={styles.itemTitle} numberOfLines={2}>
          {line.title}
        </Text>
        <Text style={styles.meta}>
          {line.currency} {line.price}
        </Text>
        <View style={styles.qtyRow}>
          <Pressable
            style={styles.qtyBtn}
            onPress={() => {
              setLocalCartLineQuantity(line.id, line.quantity - 1)
              onBump()
            }}
          >
            <Text style={styles.qtyBtnText}>−</Text>
          </Pressable>
          <Text style={styles.qtyNum}>{line.quantity}</Text>
          <Pressable
            style={styles.qtyBtn}
            onPress={() => {
              setLocalCartLineQuantity(line.id, line.quantity + 1)
              onBump()
            }}
          >
            <Text style={styles.qtyBtnText}>+</Text>
          </Pressable>
          <Pressable
            style={styles.removeBtn}
            onPress={() => {
              removeLocalCartLine(line.id)
              onBump()
            }}
          >
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
    elevation: 10000,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  back: { fontSize: 22, color: '#111', width: 28 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
  content: { padding: 16, paddingBottom: 40 },
  sub: { fontSize: 13, color: '#666', marginBottom: 16 },
  row: {
    flexDirection: 'row',
    marginBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    paddingBottom: 12,
  },
  thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#eee' },
  thumbPlaceholder: { backgroundColor: '#ddd' },
  rowBody: { flex: 1, marginLeft: 12 },
  itemTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  meta: { fontSize: 13, color: '#666', marginTop: 4 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: { fontSize: 18, color: '#111' },
  qtyNum: { marginHorizontal: 10, fontSize: 15, fontWeight: '600' },
  removeBtn: { marginLeft: 12 },
  removeText: { color: '#b00020', fontSize: 13 },
  addMore: { paddingVertical: 10, marginBottom: 8 },
  addMoreText: { color: '#111', fontWeight: '600', fontSize: 14 },
  totals: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 16,
  },
  totalLabel: { fontSize: 16, fontWeight: '600', color: '#111' },
  totalValue: { fontSize: 16, fontWeight: '700', color: '#111' },
  checkoutBtn: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  checkoutText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  secondaryText: { color: '#111', fontWeight: '500', fontSize: 15 },
})
