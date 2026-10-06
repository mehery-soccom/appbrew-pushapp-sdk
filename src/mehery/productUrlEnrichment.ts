import { useAppStore } from '@gauntlet/state'
import { enrichOnlineStoreUrl } from './enrichOnlineStoreUrl'
import { resolveShopDomain } from './shopDomain'

let installed = false

/**
 * Headless / demo catalogs often omit Shopify `onlineStoreUrl`.
 * Default AddToWishlist (PDP, tags, wishlist bar) silently no-ops without it,
 * so add_to_wishlist never fires. Fill a canonical product URL from
 * shop domain + handle whenever a product lands idle without one.
 */
export function installMeheryProductUrlEnrichment(): void {
  if (installed) return
  installed = true

  useAppStore.subscribe(
    (state) => state.products.items,
    (items) => {
      const domain = resolveShopDomain()
      if (!domain || !items) {
        return
      }

      const handlesToFix: string[] = []
      for (const [handle, entry] of Object.entries(items)) {
        const data = (
          entry as { status?: string; data?: { onlineStoreUrl?: string } }
        )?.data
        if (
          (entry as { status?: string })?.status === 'idle' &&
          data &&
          !String(data.onlineStoreUrl ?? '').trim()
        ) {
          handlesToFix.push(handle)
        }
      }
      if (handlesToFix.length === 0) {
        return
      }

      useAppStore.setState((state) => {
        for (const handle of handlesToFix) {
          const entry = state.products.items[handle]
          if (entry?.status === 'idle' && entry.data) {
            const url = enrichOnlineStoreUrl(
              {
                handle,
                onlineStoreUrl: entry.data.onlineStoreUrl,
              },
              domain
            )
            if (url && entry.data.onlineStoreUrl !== url) {
              entry.data.onlineStoreUrl = url
            }
          }
        }
      })
    },
    { fireImmediately: true }
  )
}
