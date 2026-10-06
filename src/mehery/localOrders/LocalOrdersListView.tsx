import * as React from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useLink } from '@gauntlet/state'
import { trackOrderEvent } from './orderEvents'
import { listLocalOrders, LocalOrder } from './store'

type Props = {
  testID?: string
  title?: string
}

/**
 * Shared order history UI — navigates to order-details (Track order) on tap.
 */
export function LocalOrdersListView({
  testID,
  title = 'Order history',
}: Props) {
  const { gotoLink } = useLink()
  const [orders, setOrders] = React.useState<LocalOrder[]>(() =>
    listLocalOrders()
  )

  const refresh = React.useCallback(() => {
    setOrders(listLocalOrders())
  }, [])

  React.useEffect(() => {
    refresh()
  }, [refresh])

  const openOrder = (o: LocalOrder) => {
    trackOrderEvent('order_click', o, {
      action: 'select_order',
      click_label: o.id,
    })
    gotoLink({
      kind: 'screen',
      value: 'order-details',
      params: { orderId: o.id },
    })
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      testID={testID}
    >
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.sub}>
        Demo orders from checkout. Tap to track status or refund.
      </Text>
      {!orders.length ? (
        <Text style={styles.empty}>No orders yet. Place one from cart.</Text>
      ) : (
        orders.map((o) => (
          <Pressable
            key={o.id}
            style={styles.card}
            onPress={() => openOrder(o)}
          >
            <Text style={styles.cardTitle}>{o.id}</Text>
            <Text style={styles.meta}>{o.shopify_order_id}</Text>
            <Text style={styles.meta}>
              {o.status.replace(/_/g, ' ')} · {o.currency} {o.value}
            </Text>
            <Text style={styles.viewDetails}>View details →</Text>
          </Pressable>
        ))
      )}
      <Pressable onPress={refresh} style={styles.refresh}>
        <Text style={styles.refreshText}>Refresh</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 4 },
  sub: { fontSize: 13, color: '#666', marginBottom: 16 },
  empty: { fontSize: 14, color: '#888', marginTop: 12 },
  card: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#111' },
  meta: { fontSize: 12, color: '#666', marginTop: 2 },
  viewDetails: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#111',
  },
  refresh: { alignItems: 'center', padding: 12 },
  refreshText: { color: '#111', fontWeight: '500' },
})
