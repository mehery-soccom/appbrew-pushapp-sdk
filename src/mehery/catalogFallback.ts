import {
  ShopifyAuthProvider,
  ShopifyCartProvider,
  ShopifyCatalogGeneric,
  ShopifyCheckoutProvider,
  ShopifySearchProviderV2,
} from '@gauntlet/shopify'
import { LocalStorage } from '@gauntlet/local-storage'
import { useAppStore } from '@gauntlet/state'
import type { AppConfig } from '@gauntlet/types'

/**
 * Public Storefront token from the App Brew Natori demo theme.
 * mehery2.myshopify.com currently returns 0 products on Storefront
 * (files exist in Admin; catalog is not published to this Headless token).
 * Swap this out once mehery2 products are published to Storefront.
 */
const FALLBACK_SHOP = {
  domain: 'natori-appbrew.myshopify.com',
  storefrontAccessToken: '5d281e71d22c0199b3c89f5ed0b3fcb1',
} as const

const STOREFRONT_API = '2025-01'
const COLLECTION_GID_RE = /gid:\/\/shopify\/Collection\/\d+/g

type StorefrontJson = {
  data?: {
    products?: { edges?: Array<{ node?: { id?: string } }> }
    collections?: {
      edges?: Array<{
        node?: {
          id?: string
          products?: { edges?: Array<unknown> }
        }
      }>
    }
  }
}

async function storefrontGraphql(
  domain: string,
  token: string,
  query: string
): Promise<StorefrontJson> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  try {
    const res = await fetch(`https://${domain}/api/${STOREFRONT_API}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': token,
      },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    })
    return (await res.json()) as StorefrontJson
  } finally {
    clearTimeout(timer)
  }
}

function uniqueCollectionGids(json: string): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const match of json.match(COLLECTION_GID_RE) ?? []) {
    if (!seen.has(match)) {
      seen.add(match)
      ordered.push(match)
    }
  }
  return ordered
}

function remapCollectionGids(
  configJson: string,
  replacements: Record<string, string>
): string {
  let out = configJson
  for (const [from, to] of Object.entries(replacements)) {
    if (from && to && from !== to) {
      out = out.split(from).join(to)
    }
  }
  return out
}

function resetShopifyClients(options?: { keepAuth?: boolean }): void {
  ShopifyCatalogGeneric.resetInstance()
  ShopifyCartProvider.resetInstance()
  ShopifySearchProviderV2.resetInstance()
  if (!options?.keepAuth) {
    ShopifyAuthProvider.resetInstance()
  }
  ;(ShopifyCheckoutProvider as { instance?: unknown }).instance = undefined
  try {
    LocalStorage.getInstance().delete('cart')
  } catch {
    // Storage may be unavailable during tests.
  }
  // Critical: MMKV alone is not enough. Shell may have already created a cart
  // on the original shop while the catalog probe ran; Zustand still holds that
  // cart id. ATC then calls cartLinesAdd against the fallback shop with a
  // foreign cart GID → failure → empty cart UI (while press tracking still
  // fires add_to_cart).
  try {
    useAppStore.getState().cart.resetCart()
  } catch {
    // Store may be unavailable during tests.
  }
}

/**
 * Catalog-only fallback must not move customer auth to the demo shop.
 * OTP / passKey / multipass are issued for the App Brew configured store
 * (e.g. mehery2). Logging in against natori-appbrew yields Shopify's
 * "Unidentified customer".
 */
function lockAuthToOriginalShop(
  config: AppConfig,
  original: { domain: string; storefrontAccessToken: string }
): void {
  const authConfig: AppConfig = JSON.parse(JSON.stringify(config))
  if (!authConfig.integrations) {
    authConfig.integrations = {}
  }
  authConfig.integrations.shopify = {
    ...authConfig.integrations.shopify,
    domain: original.domain,
    storefrontAccessToken: original.storefrontAccessToken,
  }
  ShopifyAuthProvider.resetInstance()
  ShopifyAuthProvider.getInstance(authConfig)
  console.log(
    '[Mehery] Auth locked to',
    original.domain,
    '(catalog may use fallback shop)'
  )
}

async function shopHasProducts(domain: string, token: string): Promise<boolean> {
  const json = await storefrontGraphql(
    domain,
    token,
    '{ products(first: 1) { edges { node { id } } } }'
  )
  return (json.data?.products?.edges?.length ?? 0) > 0
}

async function collectionsWithProducts(
  domain: string,
  token: string
): Promise<string[]> {
  const json = await storefrontGraphql(
    domain,
    token,
    `{
      collections(first: 20) {
        edges {
          node {
            id
            products(first: 1) { edges { node { id } } }
          }
        }
      }
    }`
  )
  const ids: string[] = []
  for (const edge of json.data?.collections?.edges ?? []) {
    const id = edge.node?.id
    const hasProduct = (edge.node?.products?.edges?.length ?? 0) > 0
    if (id && hasProduct) {
      ids.push(id)
    }
  }
  return ids
}

let catalogProbeFinished = false

/**
 * If the live Storefront catalog is empty, point Shopify + theme collection
 * GIDs at a shop that has products so PDP / add-to-cart / remove-from-cart work.
 */

/** True after `ensureWorkingCatalog` has run (success, skip, or failure). */
export function hasEnsuredWorkingCatalog(): boolean {
  return catalogProbeFinished
}

export function markCatalogProbeFinished(): void {
  catalogProbeFinished = true
}

export async function ensureWorkingCatalog(): Promise<void> {
  try {
    await runEnsureWorkingCatalog()
  } finally {
    catalogProbeFinished = true
  }
}

async function runEnsureWorkingCatalog(): Promise<void> {
  const store = useAppStore.getState()
  const config = store.config.data
  const shopify = config?.integrations?.shopify
  if (!config || !shopify?.domain || !shopify.storefrontAccessToken) {
    return
  }

  // Keep Shell from mounting Home against an empty catalog while we probe.
  store.config.setConfigStatus('loading')

  try {
    const hasProducts = await shopHasProducts(
      shopify.domain,
      shopify.storefrontAccessToken
    )
    if (hasProducts) {
      console.log(
        '[Mehery] Storefront catalog has products at',
        shopify.domain
      )
      store.config.setConfigStatus('idle')
      return
    }
  } catch (e) {
    console.warn('[Mehery] Storefront product probe failed', e)
    store.config.setConfigStatus('idle')
    return
  }

  console.warn(
    '[Mehery] Storefront catalog is empty at',
    shopify.domain,
    '— falling back to',
    FALLBACK_SHOP.domain,
    'so product page and cart work. Publish products to the Headless / Storefront channel to use the Mehery shop.'
  )

  const originalAuthShop = {
    domain: shopify.domain,
    storefrontAccessToken: shopify.storefrontAccessToken,
  }

  let fallbackCollectionIds: string[] = []
  try {
    const fallbackHasProducts = await shopHasProducts(
      FALLBACK_SHOP.domain,
      FALLBACK_SHOP.storefrontAccessToken
    )
    if (!fallbackHasProducts) {
      console.warn('[Mehery] Fallback shop also has no products')
      store.config.setConfigStatus('idle')
      return
    }
    fallbackCollectionIds = await collectionsWithProducts(
      FALLBACK_SHOP.domain,
      FALLBACK_SHOP.storefrontAccessToken
    )
  } catch (e) {
    console.warn('[Mehery] Fallback shop probe failed', e)
    store.config.setConfigStatus('idle')
    return
  }

  if (fallbackCollectionIds.length === 0) {
    store.config.setConfigStatus('idle')
    return
  }

  const cloned: AppConfig = JSON.parse(JSON.stringify(config))
  const themeJson = JSON.stringify(cloned)
  const themeCollectionIds = uniqueCollectionGids(themeJson)
  const replacements: Record<string, string> = {}
  themeCollectionIds.forEach((gid, index) => {
    replacements[gid] =
      fallbackCollectionIds[index] ?? fallbackCollectionIds[0]
  })

  const remapped = JSON.parse(
    remapCollectionGids(themeJson, replacements)
  ) as AppConfig

  if (!remapped.integrations) {
    remapped.integrations = {}
  }
  remapped.integrations.shopify = {
    ...remapped.integrations.shopify,
    domain: FALLBACK_SHOP.domain,
    storefrontAccessToken: FALLBACK_SHOP.storefrontAccessToken,
  }
  if (remapped.store) {
    remapped.store.shopifyDomain = FALLBACK_SHOP.domain
    remapped.store.domain = FALLBACK_SHOP.domain
  }

  // Reset catalog/cart/search only, then pin auth to the real OTP shop before
  // publishing the remapped config (otherwise passKey login hits the wrong store).
  resetShopifyClients({ keepAuth: true })
  lockAuthToOriginalShop(config, originalAuthShop)
  store.config.update(remapped, 'idle')
  // Clear again after publish in case an in-flight fetchCart from the original
  // shop resolved and rewrote Zustand with a foreign cart id.
  try {
    store.cart.resetCart()
  } catch {
    /* ignore */
  }
  console.log(
    '[Mehery] Catalog fallback ready — open Home → a product → Add to Bag → Cart to track view_item / add_to_cart / remove_from_cart'
  )
}
