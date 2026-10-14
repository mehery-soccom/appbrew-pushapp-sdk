import * as React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  useBlock,
  useBlockTestID,
  useLink,
} from '@gauntlet/state'
import { BaseBlockProps } from '@gauntlet/types'
import { sendMeheryCustomEvent, PUSHAPP_CHECKOUT_EVENTS } from 'react-native-pushapp-appbrew/appbrew'
import { buildDummyCheckoutPayload } from '../dummyCheckout/buildDummyCheckoutPayload'
import {
  getLocalCartLines,
  localCartToCheckoutShape,
  seedDemoLocalCartIfEmpty,
} from './store'

/**
 * Host override of checkout-bar: always routes to dummy payment checkout.
 */
export function DummyCheckoutBar(props: BaseBlockProps) {
  const block = useBlock(props.screenId, props.componentId, props.instanceId)
  const testID = useBlockTestID(block, props.screenId)
  const { gotoLink } = useLink()
  const settings = (block as any)?.settings || (block as any)?.source
  const buttonTitle =
    settings?.source?.buttonTitle ||
    settings?.options?.buttonTitle ||
    'CHECKOUT'

  const onPress = () => {
    seedDemoLocalCartIfEmpty()
    const shape = localCartToCheckoutShape()
    if (!getLocalCartLines().length) {
      return
    }
    void sendMeheryCustomEvent(
      PUSHAPP_CHECKOUT_EVENTS.BEGIN_CHECKOUT,
      buildDummyCheckoutPayload(shape)
    )
    gotoLink({
      kind: 'screen',
      value: 'payment',
      params: { redirectTo: 'cart' },
    })
  }

  return (
    <View style={styles.wrap} testID={testID}>
      <Pressable style={styles.btn} onPress={onPress}>
        <Text style={styles.text}>{buttonTitle}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
  },
  btn: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  text: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
