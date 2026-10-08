import { loadMeherySdk } from './sdk'
import { sendMeheryCustomEvent } from './sendCustomEvent'

const PAGE_WIDGET_OPEN_DELAY_MS = 2000
/** Same placeholder must not re-request while still on the page / quick revisit. */
const WIDGET_OPEN_DEDUP_MS = 30_000
const lastWidgetOpenAt = new Map<string, number>()

function shouldEmitWidgetOpen(compare: string): boolean {
  const now = Date.now()
  const last = lastWidgetOpenAt.get(compare) ?? 0
  if (now - last < WIDGET_OPEN_DEDUP_MS) {
    return false
  }
  lastWidgetOpenAt.set(compare, now)
  return true
}

/** @internal test helper */
export function __resetMeheryWidgetOpenDedupeForTests(): void {
  lastWidgetOpenAt.clear()
}

/**
 * Returns a cleanup that cancels the SDK OnPageOpen timer (if still pending)
 * and fires OnPageClose. Call on blur / unmount.
 *
 * Optional `widgetOpenCompares` mirrors the SDK example: after page_open,
 * also emit `widget_open` with each placeholder id so inline/tooltip journeys deliver.
 * Duplicate compares within 30s are skipped (stops tooltip/inline continuous calls).
 */
export function meheryOnPageOpen(
  pageName: string,
  options?: { widgetOpenCompares?: string[] }
) {
  let cancelled = false
  let cancelOpen: (() => void) | undefined
  let widgetTimer: ReturnType<typeof setTimeout> | undefined

  // Sync API surface; load is cached after bootstrap.
  void loadMeherySdk().then((sdk) => {
    const result = sdk.OnPageOpen(pageName)
    if (typeof result === 'function') {
      cancelOpen = result as () => void
      if (cancelled) {
        cancelOpen()
      }
    }
  })

  const compares = Array.from(
    new Set(
      (options?.widgetOpenCompares ?? [])
        .map((id) => id.trim())
        .filter(Boolean)
    )
  )
  if (compares.length > 0) {
    widgetTimer = setTimeout(() => {
      if (cancelled) {
        return
      }
      for (const compare of compares) {
        if (!shouldEmitWidgetOpen(compare)) {
          continue
        }
        void sendMeheryCustomEvent('widget_open', { compare }, 'LOG')
      }
    }, PAGE_WIDGET_OPEN_DELAY_MS)
  }

  return () => {
    cancelled = true
    if (widgetTimer) {
      clearTimeout(widgetTimer)
    }
    cancelOpen?.()
    void loadMeherySdk().then((sdk) => {
      const OnPageClose = sdk.OnPageClose as (page?: string) => unknown
      OnPageClose(pageName)
    })
  }
}

export function meheryOnPageClose(pageName?: string) {
  void loadMeherySdk().then((sdk) => {
    const OnPageClose = sdk.OnPageClose as (page?: string) => unknown
    OnPageClose(pageName)
  })
}
