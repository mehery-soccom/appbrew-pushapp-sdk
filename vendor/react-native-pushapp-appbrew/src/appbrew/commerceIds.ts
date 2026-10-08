/**
 * Stable commerce IDs for Mehery / PushApp dual-send.
 * cart_id = live Shopify cart id; shopify_id = Mehery user id; order ids are demo GIDs.
 */

import { toMeheryUserId } from './identity'

const ORDER_SEQ_KEY = 'mehery_demo_shopify_order_seq'

function mmkv(): {
  getNumber: (key: string) => number | undefined
  set: (key: string, value: string | number | boolean | object) => void
  delete: (key: string) => void
} {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { LocalStorage } = require('@gauntlet/local-storage')
  return LocalStorage.getInstance()
}

function appStore(): {
  cart?: { data?: { id?: string | number } }
  user?: { data?: { userDetails?: { data?: unknown } } }
} {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useAppStore } = require('@gauntlet/state')
  return useAppStore.getState()
}

/** Shopify Storefront cart id from Zustand (MMKV-backed by Gauntlet). */
export function getCartId(): string | undefined {
  try {
    const id = appStore().cart?.data?.id
    if (id == null) {
      return undefined
    }
    const trimmed = String(id).trim()
    return trimmed || undefined
  } catch {
    return undefined
  }
}

const USER_ID_KEY = 'user_id'
const REGISTERED_USER_ID_KEY = 'registered_user_id'
const USER_LOGGED_IN_KEY = 'UserLoggedIn'

let cachedMeheryUserId = ''

/** Shop hostname or http(s) address — not a Mehery user id. */
export function isWebUrlOrShopDomain(value: string): boolean {
  const v = value.trim()
  if (!v || v.includes('@')) {
    return false
  }
  if (/^https?:\/\//i.test(v) || /myshopify\.com/i.test(v)) {
    return true
  }
  return /^[a-z0-9](?:[a-z0-9-]{0,62}\.)+[a-z]{2,}$/i.test(v)
}

/** Shopify customer GID → bare Mehery user id. Drops web addresses. */
export function sanitizeMeheryUserId(raw: string): string {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) {
    return ''
  }
  const id = toMeheryUserId(trimmed).trim()
  if (!id || isWebUrlOrShopDomain(id)) {
    return ''
  }
  return id
}

function readCustomerMeheryUserId(): string {
  try {
    const details = appStore().user?.data?.userDetails?.data as
      | {
          id?: string | number
          customerId?: string | number
          email?: string
        }
      | undefined
    if (!details) {
      return ''
    }
    const raw =
      details.id != null
        ? String(details.id)
        : details.customerId != null
        ? String(details.customerId)
        : details.email
        ? String(details.email)
        : ''
    return sanitizeMeheryUserId(raw)
  } catch {
    return ''
  }
}

function rememberMeheryUserId(id: string): string {
  if (id) {
    cachedMeheryUserId = id
  }
  return id
}

/**
 * Mehery user id for the shopify_id event property.
 * Prefer the live Shopify customer (what OnUserLogin sends), then the last
 * id fetched from PushApp storage.
 */
export function getShopifyId(): string {
  return readCustomerMeheryUserId() || cachedMeheryUserId || ''
}

async function readStoredMeheryUserId(): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const storageModule = require('@react-native-async-storage/async-storage') as {
    default?: {
      getItem: (key: string) => Promise<string | null>
      multiGet?: (
        keys: string[]
      ) => Promise<Array<[string, string | null]>>
    }
    getItem?: (key: string) => Promise<string | null>
    multiGet?: (
      keys: string[]
    ) => Promise<Array<[string, string | null]>>
  }
  const AsyncStorage = (storageModule.default ?? storageModule) as {
    getItem: (key: string) => Promise<string | null>
    multiGet?: (
      keys: string[]
    ) => Promise<Array<[string, string | null]>>
  }
  const keys = [USER_ID_KEY, REGISTERED_USER_ID_KEY, USER_LOGGED_IN_KEY]
  const map = new Map<string, string>()
  if (typeof AsyncStorage.multiGet === 'function') {
    const pairs = await AsyncStorage.multiGet(keys)
    for (const [key, value] of pairs) {
      map.set(key, (value ?? '').trim())
    }
  } else {
    const values = await Promise.all(keys.map((key) => AsyncStorage.getItem(key)))
    keys.forEach((key, index) => {
      map.set(key, (values[index] ?? '').trim())
    })
  }
  const loggedIn = (map.get(USER_LOGGED_IN_KEY) ?? '').toLowerCase() === 'true'
  const loginId = sanitizeMeheryUserId(map.get(USER_ID_KEY) ?? '')
  const guestId = sanitizeMeheryUserId(map.get(REGISTERED_USER_ID_KEY) ?? '')
  if (loggedIn && loginId) {
    return loginId
  }
  return guestId || loginId
}

/**
 * Fetch the Mehery user id from the signed-in Shopify customer or PushApp
 * storage (`user_id` while logged in, otherwise `registered_user_id`).
 */
export async function fetchMeheryUserId(): Promise<string> {
  const fromStore = readCustomerMeheryUserId()
  if (fromStore) {
    return rememberMeheryUserId(fromStore)
  }
  try {
    const stored = await readStoredMeheryUserId()
    if (stored) {
      return rememberMeheryUserId(stored)
    }
  } catch {
    /* storage unavailable */
  }
  return cachedMeheryUserId
}

/**
 * Next demo Shopify order GID. Persisted counter in MMKV so QA can correlate
 * purchase → refund across app kills.
 */
export function nextDemoShopifyOrderId(): string {
  const storage = mmkv()
  const prev = storage.getNumber(ORDER_SEQ_KEY) ?? 0
  const next = prev + 1
  storage.set(ORDER_SEQ_KEY, next)
  return `gid://shopify/Order/demo_${next}`
}

/** Local transaction id for dummy purchase / refund. */
export function nextDemoTransactionId(): string {
  const storage = mmkv()
  const prev = storage.getNumber(ORDER_SEQ_KEY) ?? 0
  return `demo_txn_${Date.now()}_${prev + 1}`
}

/** Allocate order + transaction ids together (single counter bump). */
export function allocateDemoOrderIds(): {
  shopify_order_id: string
  transaction_id: string
} {
  const storage = mmkv()
  const prev = storage.getNumber(ORDER_SEQ_KEY) ?? 0
  const next = prev + 1
  storage.set(ORDER_SEQ_KEY, next)
  return {
    shopify_order_id: `gid://shopify/Order/demo_${next}`,
    transaction_id: `demo_txn_${Date.now()}_${next}`,
  }
}

/** Test helper — reset order sequence. */
export function resetDemoOrderSeqForTests(): void {
  try {
    mmkv().delete(ORDER_SEQ_KEY)
  } catch {
    /* ignore */
  }
}
