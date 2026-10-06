import * as React from 'react'
import { View } from 'react-native'
import { useAppStore, useBlock, useBlockTestID, useLink } from '@gauntlet/state'
import { BaseBlockProps } from '@gauntlet/types'
import { LocalOrderDetail } from './LocalOrderDetail'
import { getLocalOrder, listLocalOrders } from './store'

/**
 * CMS order-details block: reads route params.orderId (or first local order).
 */
export function LocalOrderDetailBlock(props: BaseBlockProps) {
  const block = useBlock(props.screenId, props.componentId, props.instanceId)
  const testID = useBlockTestID(block, props.screenId)
  const { back, gotoLink } = useLink()
  const routeOrderId = useAppStore(
    (s) => (s.route.current()?.params as { orderId?: string } | undefined)?.orderId
  )
  const orderId =
    routeOrderId ||
    (block as { settings?: { source?: { orderId?: string } } })?.settings
      ?.source?.orderId ||
    listLocalOrders()[0]?.id ||
    ''

  if (!orderId || !getLocalOrder(String(orderId))) {
    return <View testID={testID} />
  }

  return (
    <View testID={testID} style={{ flex: 1 }}>
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
