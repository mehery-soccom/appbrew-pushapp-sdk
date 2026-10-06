/**
 * MMKV-backed local demo orders for PushApp QA (dummy checkout / transit / refund).
 */

import { LocalStorage } from '@gauntlet/local-storage'

export type LocalOrderStatus =
  | 'placed'
  | 'confirmed'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'refunded'

export type LocalOrderAddress = {
  name: string
  address: string
  city: string
  pincode: string
}

export type LocalOrderItem = Record<string, unknown>

export type LocalOrder = {
  id: string
  shopify_order_id: string
  cart_id?: string
  shopify_id: string
  createdAt: number
  status: LocalOrderStatus
  statusHistory: { status: LocalOrderStatus; at: number }[]
  currency: string
  value: number
  items: LocalOrderItem[]
  shipping?: LocalOrderAddress
  paymentMethod?: string
  coupon?: string
  refundReason?: string
}

const STORAGE_KEY = 'mehery_local_orders'

const TRANSIT_ORDER: LocalOrderStatus[] = [
  'placed',
  'confirmed',
  'in_transit',
  'out_for_delivery',
  'delivered',
]

type OrdersBag = { orders: LocalOrder[] }

function readBag(): OrdersBag {
  try {
    const raw = LocalStorage.getInstance().getJson<OrdersBag>(STORAGE_KEY)
    if (raw && Array.isArray(raw.orders)) {
      return { orders: raw.orders }
    }
  } catch {
    /* ignore */
  }
  return { orders: [] }
}

function writeBag(db: OrdersBag): void {
  LocalStorage.getInstance().set(STORAGE_KEY, db)
}

export function listLocalOrders(): LocalOrder[] {
  return [...readBag().orders].sort((a, b) => b.createdAt - a.createdAt)
}

export function getLocalOrder(id: string): LocalOrder | undefined {
  return readBag().orders.find((o) => o.id === id)
}

export function saveLocalOrder(order: LocalOrder): void {
  const db = readBag()
  const idx = db.orders.findIndex((o) => o.id === order.id)
  if (idx >= 0) {
    db.orders[idx] = order
  } else {
    db.orders.unshift(order)
  }
  writeBag(db)
}

export function createLocalOrder(
  input: Omit<LocalOrder, 'createdAt' | 'status' | 'statusHistory'> & {
    status?: LocalOrderStatus
  }
): LocalOrder {
  const now = Date.now()
  const status = input.status ?? 'placed'
  const order: LocalOrder = {
    ...input,
    createdAt: now,
    status,
    statusHistory: [{ status, at: now }],
  }
  saveLocalOrder(order)
  return order
}

export function advanceLocalOrderStatus(id: string): LocalOrder | undefined {
  const order = getLocalOrder(id)
  if (!order || order.status === 'refunded') {
    return order
  }
  const idx = TRANSIT_ORDER.indexOf(order.status)
  if (idx < 0 || idx >= TRANSIT_ORDER.length - 1) {
    return order
  }
  const next = TRANSIT_ORDER[idx + 1]
  const updated: LocalOrder = {
    ...order,
    status: next,
    statusHistory: [...order.statusHistory, { status: next, at: Date.now() }],
  }
  saveLocalOrder(updated)
  return updated
}

export function refundLocalOrder(
  id: string,
  reason: string
): LocalOrder | undefined {
  const order = getLocalOrder(id)
  if (!order || order.status === 'refunded') {
    return order
  }
  const updated: LocalOrder = {
    ...order,
    status: 'refunded',
    refundReason: reason,
    statusHistory: [
      ...order.statusHistory,
      { status: 'refunded', at: Date.now() },
    ],
  }
  saveLocalOrder(updated)
  return updated
}

export function nextTransitStatus(
  status: LocalOrderStatus
): LocalOrderStatus | null {
  if (status === 'refunded') {
    return null
  }
  const idx = TRANSIT_ORDER.indexOf(status)
  if (idx < 0 || idx >= TRANSIT_ORDER.length - 1) {
    return null
  }
  return TRANSIT_ORDER[idx + 1]
}

export function clearLocalOrdersForTests(): void {
  try {
    LocalStorage.getInstance().delete(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export { TRANSIT_ORDER }
