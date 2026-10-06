import { navigationRef, useAppStore } from '@gauntlet/state'
import { hasEnsuredWorkingCatalog } from '../mehery/catalogFallback'

const DEFAULT_SIGNIN_SCREEN = 'otp-email-login'
const POLL_MS = 50
const MAX_WAIT_MS = 28000
const LAUNCH_ROUTES = new Set(['home', 'homeTabs'])

/**
 * Cold start: push the theme sign-in screen before Home when the user is
 * not already signed in. Runs under the splash overlay so Home does not flash.
 */
export function presentLoginFirstIfNeeded(): () => void {
  let cancelled = false
  const started = Date.now()

  const schedule = () => {
    if (cancelled) return
    if (Date.now() - started > MAX_WAIT_MS) return
    setTimeout(attempt, POLL_MS)
  }

  const attempt = () => {
    if (cancelled) return
    const store = useAppStore.getState()

    if (store.config.status !== 'idle' || !store.config.data) {
      schedule()
      return
    }
    // Catalog fallback briefly sets status back to `loading` after init.
    // Navigating to sign-in before that finishes remounts Home against a
    // half-swapped Shopify client.
    if (!hasEnsuredWorkingCatalog()) {
      schedule()
      return
    }
    if (!navigationRef.isReady()) {
      schedule()
      return
    }

    if (store.user.isUserAuthenticated()) return
    if (store.route.initialUrl) return

    const signinScreen =
      store.config.data.settings?.['global']?.defaultSigninScreen ??
      DEFAULT_SIGNIN_SCREEN

    const current = navigationRef.getCurrentRoute()?.name
    if (current === signinScreen) return
    if (current && !LAUNCH_ROUTES.has(current)) return

    store.route.gotoLink({ kind: 'screen', value: signinScreen })
  }

  attempt()
  return () => {
    cancelled = true
  }
}
