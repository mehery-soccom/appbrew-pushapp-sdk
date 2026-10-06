/**
 * Canonical PushApp page names for host OnPageOpen wiring.
 * Campaigns should target these exact strings.
 */

export const HOME_PAGE_NAME = 'home'
export const ACCOUNT_PAGE_OPEN_NAME = 'account'

/** Route / screen ids (and common titles) that map to a Mehery page_open name. */
const PAGE_OPEN_ALIASES: Record<string, string> = {
  home: HOME_PAGE_NAME,
  hometabs: HOME_PAGE_NAME,
  account: ACCOUNT_PAGE_OPEN_NAME,
  profile: ACCOUNT_PAGE_OPEN_NAME,
}

/**
 * Map a navigation route name or analytics screen title to a PushApp page name.
 * Returns null when this host does not own an explicit OnPageOpen for that screen.
 */
export function resolveMeheryPageOpenName(
  routeOrScreenName?: string | null
): string | null {
  if (!routeOrScreenName) {
    return null
  }
  const key = routeOrScreenName.trim().toLowerCase()
  return PAGE_OPEN_ALIASES[key] ?? null
}

/** Tab-shell routes where falling back to bottomBar.activeTab is safe. */
const TAB_SHELL_ROUTES = new Set(['home', 'hometabs', ''])

/**
 * Page open for the listener: prefer the focused route; only use activeTab
 * while on the tab shell. Never attribute Search Suggestions / PDP / etc. to home.
 */
export function resolveOwnedMeheryPageOpen(opts: {
  routeName?: string | null
  activeTab?: string | null
}): string | null {
  const routeKey = (opts.routeName ?? '').trim().toLowerCase()
  const fromRoute = resolveMeheryPageOpenName(opts.routeName)
  if (fromRoute) {
    return fromRoute
  }
  if (!TAB_SHELL_ROUTES.has(routeKey)) {
    return null
  }
  return resolveMeheryPageOpenName(opts.activeTab)
}
