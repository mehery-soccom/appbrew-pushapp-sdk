import * as React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useLink } from '@gauntlet/state'
import { sendMeheryCustomEvent } from 'react-native-pushapp-appbrew/appbrew'
import { trackOrderEvent } from './orderEvents'
import { listLocalOrders, LocalOrder } from './store'

/**
 * Compact Account entry for MMKV demo orders.
 * Tapping a row opens the order-details screen (Track order page).
 */
export function DemoOrdersEntry() {
  const { gotoLink } = useLink()
  const [open, setOpen] = React.useState(false)
  const [orders, setOrders] = React.useState<LocalOrder[]>([])

  const refresh = React.useCallback(() => {
    setOrders(listLocalOrders())
  }, [])

  React.useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => {
          const next = !open
          void sendMeheryCustomEvent(
            'order_click',
            {
              action: next ? 'open_demo_orders' : 'close_demo_orders',
              click_label: 'Demo orders',
            },
            'LOG'
          )
          setOpen(next)
        }}
        style={styles.header}
        accessibilityLabel="demo-orders"
      >
        <Text style={styles.headerText}>Demo orders</Text>
        <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.body}>
          {!orders.length ? (
            <Text style={styles.empty}>
              No demo orders yet. Checkout from cart to place one.
            </Text>
          ) : (
            orders.map((o) => (
              <Pressable
                key={o.id}
                style={styles.row}
                onPress={() => {
                  trackOrderEvent('order_click', o, {
                    action: 'select_order',
                    click_label: o.id,
                  })
                  gotoLink({
                    kind: 'screen',
                    value: 'order-details',
                    params: { orderId: o.id },
                  })
                }}
              >
                <Text style={styles.rowTitle}>{o.id}</Text>
                <Text style={styles.meta}>
                  {o.status.replace(/_/g, ' ')} · {o.currency} {o.value}
                </Text>
                <Text style={styles.link}>View / track →</Text>
              </Pressable>
            ))
          )}
          <Pressable
            onPress={() => {
              void sendMeheryCustomEvent(
                'order_click',
                { action: 'refresh_orders', click_label: 'Refresh' },
                'LOG'
              )
              refresh()
            }}
          >
            <Text style={styles.refresh}>Refresh</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void sendMeheryCustomEvent(
                'order_click',
                { action: 'open_order_history', click_label: 'Order history' },
                'LOG'
              )
              gotoLink({ kind: 'screen', value: 'order-history' })
            }}
          >
            <Text style={styles.refresh}>Open order history →</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16, marginBottom: 8 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
  },
  headerText: { fontSize: 15, fontWeight: '600', color: '#111' },
  chevron: { fontSize: 14, color: '#666' },
  body: { paddingBottom: 8 },
  empty: { fontSize: 13, color: '#888', marginTop: 4 },
  row: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  rowTitle: { fontSize: 13, fontWeight: '500', color: '#111' },
  meta: { fontSize: 12, color: '#666', marginTop: 2 },
  link: { fontSize: 12, fontWeight: '600', color: '#111', marginTop: 4 },
  refresh: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '500',
    color: '#111',
  },
})
