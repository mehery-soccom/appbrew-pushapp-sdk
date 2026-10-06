/**
 * In-memory + MMKV local cart. Seed synchronously so first Cart paint has lines.
 */

import { LocalStorage } from '@gauntlet/local-storage'

export type LocalCartLine = {
  id: string
  variantId: string
  productId?: string
  productHandle?: string
  title: string
  image?: string
  price: number
  originalPrice?: number
  quantity: number
  vendor?: string
  productType?: string
  sku?: string
  currency: string
}

type LocalCartDb = {
  id: string
  lines: LocalCartLine[]
  updatedAt: number
}

const STORAGE_KEY = 'mehery_local_cart'
const listeners = new Set<() => void>()

const DEMO_LINES: LocalCartLine[] = [
  {
    id: 'demo_line_robe',
    variantId: 'demo_variant_robe',
    productId: 'demo_product_robe',
    productHandle: 'silk-robe',
    title: 'Silk Robe (Demo)',
    image:
      'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png',
    price: 2800,
    originalPrice: 3500,
    quantity: 1,
    vendor: 'Natori',
    productType: 'Lounge',
    sku: 'DEMO-ROBE',
    currency: 'INR',
  },
  {
    id: 'demo_line_hipster',
    variantId: 'demo_variant_hipster',
    productId: 'demo_product_hipster',
    productHandle: 'peony-hipster',
    title: 'Peony Hipster (Demo)',
    image:
      'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-2_large.png',
    price: 2800,
    originalPrice: 2800,
    quantity: 1,
    vendor: 'Natori',
    productType: 'Underwear',
    sku: 'DEMO-HIPSTER',
    currency: 'INR',
  },
]

let memory: LocalCartDb | null = null

function persist(db: LocalCartDb): void {
  memory = db
  try {
    LocalStorage.getInstance().set(STORAGE_KEY, db)
  } catch {
    /* MMKV optional in tests */
  }
  listeners.forEach((l) => l())
}

function readDb(): LocalCartDb {
  if (memory) return memory
  try {
    const raw = LocalStorage.getInstance().getJson<LocalCartDb>(STORAGE_KEY)
    if (raw && Array.isArray(raw.lines) && raw.lines.length > 0) {
      memory = raw
      return raw
    }
  } catch {
    /* ignore */
  }
  const seeded: LocalCartDb = {
    id: `local_cart_demo`,
    lines: DEMO_LINES.map((l) => ({ ...l })),
    updatedAt: Date.now(),
  }
  persist(seeded)
  return seeded
}

export function subscribeLocalCart(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getLocalCart(): LocalCartDb {
  return readDb()
}

export function getLocalCartLines(): LocalCartLine[] {
  return readDb().lines
}

export function getLocalCartCount(): number {
  return readDb().lines.reduce((n, l) => n + (l.quantity || 0), 0)
}

export function getLocalCartTotal(): number {
  return readDb().lines.reduce(
    (n, l) => n + Number(l.price || 0) * Number(l.quantity || 0),
    0
  )
}

export function upsertLocalCartLine(
  input: Omit<LocalCartLine, 'id'> & { id?: string }
): LocalCartDb {
  const db = { ...readDb(), lines: [...readDb().lines] }
  const idx = db.lines.findIndex(
    (l) =>
      l.variantId === input.variantId ||
      (input.productHandle && l.productHandle === input.productHandle)
  )
  const line: LocalCartLine = {
    id: input.id || `line_${input.variantId}_${Date.now()}`,
    variantId: input.variantId,
    productId: input.productId,
    productHandle: input.productHandle,
    title: input.title,
    image: input.image,
    price: Number(input.price || 0),
    originalPrice: input.originalPrice,
    quantity: Math.max(1, Number(input.quantity || 1)),
    vendor: input.vendor,
    productType: input.productType,
    sku: input.sku,
    currency: input.currency || 'INR',
  }
  if (idx >= 0) {
    db.lines[idx] = {
      ...db.lines[idx],
      ...line,
      id: db.lines[idx].id,
      quantity: db.lines[idx].quantity + line.quantity,
    }
  } else {
    db.lines.push(line)
  }
  db.updatedAt = Date.now()
  persist(db)
  return db
}

export function setLocalCartLineQuantity(
  lineId: string,
  quantity: number
): LocalCartDb {
  const db = { ...readDb(), lines: [...readDb().lines] }
  const idx = db.lines.findIndex((l) => l.id === lineId)
  if (idx < 0) return db
  if (quantity <= 0) {
    db.lines.splice(idx, 1)
  } else {
    db.lines[idx] = { ...db.lines[idx], quantity }
  }
  // Never leave cart empty during QA — reseed demo lines.
  if (db.lines.length === 0) {
    db.lines = DEMO_LINES.map((l) => ({ ...l }))
  }
  db.updatedAt = Date.now()
  persist(db)
  return db
}

export function removeLocalCartLine(lineId: string): LocalCartDb {
  return setLocalCartLineQuantity(lineId, 0)
}

export function clearLocalCart(): void {
  persist({
    id: `local_cart_${Date.now()}`,
    lines: DEMO_LINES.map((l) => ({ ...l })),
    updatedAt: Date.now(),
  })
}

export function seedDemoLocalCartIfEmpty(): LocalCartDb {
  const db = readDb()
  if (db.lines.length > 0) return db
  const seeded: LocalCartDb = {
    id: `local_cart_demo`,
    lines: DEMO_LINES.map((l) => ({ ...l })),
    updatedAt: Date.now(),
  }
  persist(seeded)
  return seeded
}

export function localCartToCheckoutShape(): {
  id: string
  webUrl?: string
  lineItems: Array<Record<string, unknown>>
  payment: {
    total: number
    lineItemsSubTotal: number
    subTotal: number
    currencyCode: string
  }
} {
  const db = readDb()
  const currency = db.lines[0]?.currency || 'INR'
  const total = getLocalCartTotal()
  return {
    id: db.id,
    webUrl: 'https://natori-appbrew.myshopify.com/cart',
    lineItems: db.lines.map((l) => ({
      variantId: l.variantId,
      productId: l.productId,
      productHandle: l.productHandle,
      title: l.title,
      image: l.image,
      priceAfterDiscount: String(l.price),
      originalPrice: String(l.originalPrice ?? l.price),
      quantity: l.quantity,
      vendor: l.vendor,
      productType: l.productType,
      sku: l.sku,
    })),
    payment: {
      total,
      lineItemsSubTotal: total,
      subTotal: total,
      currencyCode: currency,
    },
  }
}

export function clearLocalCartForTests(): void {
  memory = { id: 'test_cart', lines: [], updatedAt: Date.now() }
  try {
    LocalStorage.getInstance().delete(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

// Ensure first import already has demo lines in memory.
seedDemoLocalCartIfEmpty()
