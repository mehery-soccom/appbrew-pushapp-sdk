/**
 * Ensure PushApp receives GA4 `search` + `search_term` when the user commits
 * a search (collection results), not merely opens the suggestions screen.
 *
 * Opening "Search suggestions" is intentionally `screen_view` only — Excel
 * `search` requires a non-empty `search_term` from keyboard submit, suggestion
 * tap, past-search tap, or search_collection loading.
 *
 * Gauntlet `SearchInput` / suggestions / past-searches navigate via `gotoLink`
 * without always calling `getSearchResults` first. We hook those commits here
 * and also emit when `search_collection` enters `loading` (deduped with
 * MeheryTracker when AnalyticsEvent.SEARCH does fire).
 */

import { useAppStore } from '@gauntlet/state'
import { sendMeheryCustomEvent } from './sendCustomEvent'

let installed = false
let lastTerm = ''
let lastAt = 0

export function emitMeherySearchEvent(searchTerm?: string): void {
  const term = (searchTerm ?? '').trim()
  if (!term) {
    return
  }
  const now = Date.now()
  if (term === lastTerm && now - lastAt < 800) {
    return
  }
  lastTerm = term
  lastAt = now
  void sendMeheryCustomEvent('search', { search_term: term }, 'LOG')
}

function termFromSearchLink(link: {
  kind?: string
  value?: string
  params?: { searchQuery?: unknown }
}): string {
  if (link?.kind !== 'screen' || link?.value !== 'search') {
    return ''
  }
  const fromParams =
    typeof link.params?.searchQuery === 'string' ? link.params.searchQuery : ''
  if (fromParams.trim()) {
    return fromParams
  }
  try {
    return useAppStore.getState().search?.searchParams?.searchKey ?? ''
  } catch {
    return ''
  }
}

/** Wrap route.gotoLink so keyboard submit / suggestion / past-search commit emit. */
function installGotoLinkSearchCommitHook(): void {
  try {
    const route = useAppStore.getState().route as {
      gotoLink: (link: any, navigate?: any) => any
    }
    const original = route.gotoLink.bind(route)
    route.gotoLink = (link: any, navigate?: any) => {
      try {
        const term = termFromSearchLink(link ?? {})
        if (term.trim()) {
          emitMeherySearchEvent(term)
        }
      } catch {
        /* ignore */
      }
      return original(link, navigate)
    }
  } catch (e) {
    console.warn('[Mehery] gotoLink search commit hook failed', e)
  }
}

/** Subscribe when search results fetch starts (committed query). */
export function installMeherySearchTracking(): void {
  if (installed) {
    return
  }
  installed = true

  installGotoLinkSearchCommitHook()

  try {
    useAppStore.subscribe(
      (state) =>
        state.filter?.collections?.['search_collection']?.status as
          | string
          | undefined,
      (status) => {
        if (status !== 'loading') {
          return
        }
        try {
          const term =
            useAppStore.getState().search?.searchParams?.searchKey ?? ''
          emitMeherySearchEvent(term)
        } catch {
          /* ignore */
        }
      }
    )
  } catch (e) {
    console.warn('[Mehery] installMeherySearchTracking failed', e)
  }
}

/** @internal test helpers */
export function __resetMeherySearchTrackingForTests(): void {
  installed = false
  lastTerm = ''
  lastAt = 0
}

export { termFromSearchLink }
