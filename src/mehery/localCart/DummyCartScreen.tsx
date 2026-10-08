import * as React from 'react'
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useLink } from '@gauntlet/state'
import { BaseBlockProps } from '@gauntlet/types'
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
} from './store'

/**
 * Host override of `cart-list` (also covered by MeheryCartOverlay).
 * No useBlock — avoids CMS/block crashes hiding the cart.
 */
export function DummyCartScreen(_props: BaseBlockProps) {
  const { gotoLink } = useLink()
  const [, bump] = React.useState(0)

  React.useEffect(() => subscribeLocalCart(() => bump((n) => n + 1)), [])

  React.useEffect(() => {
    seedDemoLocalCartIfEmpty()
    bump((n) => n + 1)
  }, [])

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
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Your cart</Text>
      <Text style={styles.sub}>
        {lines.length} item{lines.length === 1 ? '' : 's'}
      </Text>
      {lines.map((line) => (
        <View key={line.id} style={styles.row}>
          {line.image ? (
            <Image source={{ uri: line.image }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]} />
          )}
          <View style={styles.rowBody}>
            <Text style={styles.itemTitle}>{line.title}</Text>
            <Text style={styles.meta}>
              {line.currency} {line.price} · Qty {line.quantity}
            </Text>
            <View style={styles.qtyRow}>
              <Pressable
                style={styles.qtyBtn}
                onPress={() => {
                  setLocalCartLineQuantity(line.id, line.quantity - 1)
                  bump((n) => n + 1)
                }}
              >
                <Text>−</Text>
              </Pressable>
              <Text style={styles.qtyNum}>{line.quantity}</Text>
              <Pressable
                style={styles.qtyBtn}
                onPress={() => {
                  setLocalCartLineQuantity(line.id, line.quantity + 1)
                  bump((n) => n + 1)
                }}
              >
                <Text>+</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  removeLocalCartLine(line.id)
                  bump((n) => n + 1)
                }}
              >
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ))}
      <Text style={styles.total}>
        Subtotal: {currency} {total}
      </Text>
      <Pressable style={styles.checkoutBtn} onPress={onCheckout}>
        <Text style={styles.checkoutText}>Checkout</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff', minHeight: 400 },
  content: { padding: 16, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: '700', color: '#111' },
  sub: { fontSize: 13, color: '#666', marginBottom: 16, marginTop: 4 },
  row: { flexDirection: 'row', marginBottom: 16 },
  thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#eee' },
  thumbPlaceholder: { backgroundColor: '#ddd' },
  rowBody: { flex: 1, marginLeft: 12 },
  itemTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  meta: { fontSize: 13, color: '#666', marginTop: 4 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  qtyBtn: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyNum: { fontWeight: '600', marginHorizontal: 4 },
  removeText: { color: '#b00020', marginLeft: 8 },
  total: { fontSize: 16, fontWeight: '700', marginVertical: 12 },
  checkoutBtn: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  checkoutText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})
