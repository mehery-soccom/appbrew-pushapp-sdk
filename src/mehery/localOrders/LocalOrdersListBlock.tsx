import * as React from 'react'
import { useBlock, useBlockTestID } from '@gauntlet/state'
import { BaseBlockProps } from '@gauntlet/types'
import { LocalOrdersListView } from './LocalOrdersListView'

/**
 * Order history list (overrides CMS orders-list-v4/v5).
 * Tapping a row navigates to the order-details screen (Track order).
 */
export function LocalOrdersListBlock(props: BaseBlockProps) {
  const block = useBlock(props.screenId, props.componentId, props.instanceId)
  const testID = useBlockTestID(block, props.screenId)
  return <LocalOrdersListView testID={testID} />
}
