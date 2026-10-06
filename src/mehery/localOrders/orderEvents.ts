import { sendMeheryCustomEvent } from '../sendCustomEvent'
import type { LocalOrder } from './store'

/** Shared order identity props for every Track-order Mehery event. */
export function buildOrderEventPayload(
  order: LocalOrder,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    transaction_id: order.id,
    shopify_order_id: order.shopify_order_id,
    shopify_id: order.shopify_id,
    cart_id: order.cart_id,
    value: order.value,
    currency: order.currency,
    status: order.status,
    items: order.items,
    ...extra,
  }
}

export function trackOrderEvent(
  name: string,
  order: LocalOrder,
  extra: Record<string, unknown> = {}
): void {
  void sendMeheryCustomEvent(name, buildOrderEventPayload(order, extra), 'LOG')
}
