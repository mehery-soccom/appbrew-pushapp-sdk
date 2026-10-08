import React, { useEffect } from 'react'
import { useAppStore } from '@gauntlet/state'
import { meheryOnPageOpen } from './navigation'
import { resolveOwnedMeheryPageOpen } from './pageOpenConstants'
import {
  ACCOUNT_PAGE_NAME,
  accountInlinePlaceholderId,
  accountTooltipPlaceholderId,
} from './accountPollConstants'

/**
 * Fires OnPageOpen('home' | 'account') when those tabs/screens are focused.
 * Account also emits widget_open for Inline + Tooltip placeholder ids.
 *
 * Depends on the *resolved* page name, not raw routeName/activeTab — alias
 * flips (account ↔ profile) must not OnPageClose + re-open (inline blink).
 * Does not fall back to activeTab on stack screens like "Search Suggestions".
 *
 * Tooltip: only the mounted primary id (not alias list) — alias fan-out was
 * causing continuous widget_open / tooltip re-delivery.
 */
export function MeheryPageOpenListener() {
  const routeName = useAppStore((s) => s.route.name)
  const activeTab = useAppStore((s) => s.route.bottomBar?.activeTab)
  const page = resolveOwnedMeheryPageOpen({ routeName, activeTab })

  useEffect(() => {
    if (!page) {
      return
    }
    const widgetOpenCompares =
      page === ACCOUNT_PAGE_NAME
        ? [accountInlinePlaceholderId(), accountTooltipPlaceholderId()]
        : undefined
    return meheryOnPageOpen(page, { widgetOpenCompares })
  }, [page])

  return null
}
