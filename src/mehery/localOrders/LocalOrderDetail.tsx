import * as React from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { trackOrderEvent } from './orderEvents'
import {
  LocalOrder,
  advanceLocalOrderStatus,
  getLocalOrder,
  nextTransitStatus,
  refundLocalOrder,
} from './store'

const REFUND_REASONS = ['Damaged', 'Wrong item', 'Changed mind'] as const

type Props = {
  orderId: string
  onBack?: () => void
  onContinueShopping?: () => void
}

export function LocalOrderDetail({
  orderId,
  onBack,
  onContinueShopping,
}: Props) {
  const [order, setOrder] = React.useState<LocalOrder | undefined>(() =>
    getLocalOrder(orderId)
  )
  const [refundOpen, setRefundOpen] = React.useState(false)
  const viewedRef = React.useRef<string | null>(null)

  const refresh = React.useCallback(() => {
    setOrder(getLocalOrder(orderId))
  }, [orderId])

  React.useEffect(() => {
    const current = getLocalOrder(orderId)
    if (!current) return
    if (viewedRef.current === orderId) return
    viewedRef.current = orderId
    trackOrderEvent('view_order', current, {
      action: 'view',
      click_label: 'Track order',
    })
  }, [orderId])

  if (!order) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>Order not found</Text>
        {onBack ? (
          <Pressable onPress={onBack} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>Back</Text>
          </Pressable>
        ) : null}
      </View>
    )
  }

  const next = nextTransitStatus(order.status)

  const onAdvance = () => {
    const from = order.status
    const updated = advanceLocalOrderStatus(order.id)
    trackOrderEvent('advance_order_status', updated ?? order, {
      action: 'advance_status',
      click_label: next ? `Advance to ${next}` : 'Advance',
      from_status: from,
      to_status: updated?.status ?? from,
    })
    refresh()
  }

  const onOpenRefund = () => {
    trackOrderEvent('request_refund', order, {
      action: 'open_refund',
      click_label: 'Request refund',
    })
    setRefundOpen(true)
  }

  const onRefund = (reason: string) => {
    const updated = refundLocalOrder(order.id, reason)
    if (updated) {
      trackOrderEvent('refund', updated, {
        action: 'confirm_refund',
        click_label: reason,
        reason,
      })
    }
    setRefundOpen(false)
    refresh()
  }

  const onCancelRefund = () => {
    trackOrderEvent('cancel_refund', order, {
      action: 'cancel_refund',
      click_label: 'Cancel',
    })
    setRefundOpen(false)
  }

  const onBackPress = () => {
    trackOrderEvent('order_click', order, {
      action: 'back',
      click_label: 'Back',
    })
    onBack?.()
  }

  const onContinuePress = () => {
    trackOrderEvent('order_click', order, {
      action: 'continue_shopping',
      click_label: 'Continue shopping',
    })
    onContinueShopping?.()
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Track order</Text>
      <Text style={styles.meta}>{order.id}</Text>
      <Text style={styles.meta}>{order.shopify_order_id}</Text>
      <Text style={styles.status}>Status: {order.status.replace(/_/g, ' ')}</Text>

      <Text style={styles.section}>Timeline</Text>
      {order.statusHistory.map((h, i) => (
        <View key={`${h.status}-${h.at}-${i}`} style={styles.timelineRow}>
          <View style={styles.dot} />
          <View>
            <Text style={styles.timelineStatus}>
              {h.status.replace(/_/g, ' ')}
            </Text>
            <Text style={styles.meta}>
              {new Date(h.at).toLocaleString()}
            </Text>
          </View>
        </View>
      ))}

      <Text style={styles.section}>Items</Text>
      {order.items.map((item, idx) => (
        <Text key={idx} style={styles.item}>
          {String(item.item_name ?? item.handle ?? 'Item')} ×{' '}
          {String(item.quantity ?? 1)}
        </Text>
      ))}

      <Text style={styles.total}>
        {order.currency} {order.value}
      </Text>

      {next ? (
        <Pressable onPress={onAdvance} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>
            Advance to {next.replace(/_/g, ' ')}
          </Text>
        </Pressable>
      ) : null}

      {order.status !== 'refunded' ? (
        <Pressable onPress={onOpenRefund} style={styles.dangerBtn}>
          <Text style={styles.dangerBtnText}>Request refund</Text>
        </Pressable>
      ) : (
        <Text style={styles.meta}>
          Refunded: {order.refundReason ?? '—'}
        </Text>
      )}

      {onBack ? (
        <Pressable onPress={onBackPress} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>Back</Text>
        </Pressable>
      ) : null}
      {onContinueShopping ? (
        <Pressable onPress={onContinuePress} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>Continue shopping</Text>
        </Pressable>
      ) : null}

      <Modal visible={refundOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.section}>Refund reason</Text>
            {REFUND_REASONS.map((r) => (
              <Pressable
                key={r}
                onPress={() => onRefund(r)}
                style={styles.reasonRow}
              >
                <Text style={styles.reasonText}>{r}</Text>
              </Pressable>
            ))}
            <Pressable onPress={onCancelRefund} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8, color: '#111' },
  section: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    color: '#111',
  },
  meta: { fontSize: 13, color: '#666', marginBottom: 2 },
  status: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 8,
    textTransform: 'capitalize',
    color: '#111',
  },
  timelineRow: { flexDirection: 'row', marginBottom: 10, alignItems: 'flex-start' },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#111',
    marginTop: 4,
    marginRight: 10,
  },
  timelineStatus: {
    fontSize: 14,
    fontWeight: '500',
    textTransform: 'capitalize',
    color: '#111',
  },
  item: { fontSize: 14, color: '#333', marginBottom: 4 },
  total: { fontSize: 16, fontWeight: '600', marginTop: 12, color: '#111' },
  primaryBtn: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryBtnText: { color: '#fff', fontWeight: '600' },
  dangerBtn: {
    backgroundColor: '#b00020',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  dangerBtnText: { color: '#fff', fontWeight: '600' },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  secondaryBtnText: { color: '#111', fontWeight: '500' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  reasonRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  reasonText: { fontSize: 16, color: '#111' },
})
