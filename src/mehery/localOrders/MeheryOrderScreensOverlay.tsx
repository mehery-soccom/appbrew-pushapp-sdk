import * as React from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAppStore, useLink } from '@gauntlet/state'
import { LocalOrderDetail } from './LocalOrderDetail'
import { LocalOrdersListView } from './LocalOrdersListView'
import { getLocalOrder } from './store'

const ORDER_HISTORY_ROUTES = new Set([
  'orders',
  'order-history',
  'orderhistory',
  'past-purchases',
  'pastpurchases',
  'my-orders',
  'myorders',
])

function isOrderHistoryRoute(name?: string | null): boolean {
  if (!name || typeof name !== 'string') return false
  const key = name.trim().toLowerCase().replace(/_/g, '-')
  if (ORDER_HISTORY_ROUTES.has(key)) return true
  return key.includes('order') && key.includes('histor')
}

function isOrderDetailsRoute(name?: string | null): boolean {
  if (!name || typeof name !== 'string') return false
  const key = name.trim().toLowerCase().replace(/_/g, '-')
  return key === 'order-details' || key === 'orderdetails'
}

/**
 * Full-screen overlays so Order History → Track order works for local demo
 * orders even when CMS still mounts empty Shopify order blocks.
 */
export function MeheryOrderScreensOverlay() {
  const insets = useSafeAreaInsets()
  const { back, gotoLink } = useLink()
  const routeName = useAppStore((s) => s.route.name)
  const orderId = useAppStore(
    (s) => (s.route.current()?.params as { orderId?: string } | undefined)?.orderId
  )

  if (isOrderDetailsRoute(routeName) && orderId) {
    const local = getLocalOrder(String(orderId))
    if (local) {
      return (
        <View
          style={[
            styles.overlay,
            { paddingTop: insets.top, paddingBottom: insets.bottom },
          ]}
          pointerEvents="box-none"
        >
          <LocalOrderDetail
            orderId={String(orderId)}
            onBack={() => back()}
            onContinueShopping={() =>
              gotoLink({ kind: 'screen', value: 'home' })
            }
          />
        </View>
      )
    }
  }

  if (isOrderHistoryRoute(routeName)) {
    return (
      <View
        style={[
          styles.overlay,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <LocalOrdersListView />
      </View>
    )
  }

  return null
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9990,
    elevation: 9990,
    backgroundColor: '#fff',
  },
})
