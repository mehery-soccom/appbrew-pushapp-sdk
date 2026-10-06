/**
 * Proactive Shopify customerAccessToken renew so overnight expiry does not
 * wipe the session via getUserDetails → resetUser.
 */

import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native'
import { LocalStorage } from '@gauntlet/local-storage'
import { useAppStore } from '@gauntlet/state'
import {
  RENEW_WITHIN_MS,
  shouldRenewCustomerAccessToken,
} from './sessionKeepAliveLogic'

export { RENEW_WITHIN_MS, shouldRenewCustomerAccessToken }
export const CUSTOMER_ACCESS_TOKEN_KEY = 'customerAccessToken'

export type StoredCustomerAccessToken = {
  accessToken?: string
  expiresAt?: string
}

function readStoredToken(): StoredCustomerAccessToken | null {
  try {
    const res = LocalStorage.getInstance().getJson(
      CUSTOMER_ACCESS_TOKEN_KEY
    ) as unknown as StoredCustomerAccessToken | null
    if (res && typeof res === 'object' && res.accessToken) {
      return res
    }
  } catch {
    /* ignore */
  }
  return null
}

function persistToken(token: StoredCustomerAccessToken): void {
  if (!token.accessToken) {
    return
  }
  LocalStorage.getInstance().set(CUSTOMER_ACCESS_TOKEN_KEY, token as any)
  try {
    const store = useAppStore.getState()
    if (store.user?.data) {
      store.user.data.customerAccessToken = {
        status: 'idle',
        data: token as any,
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * Renew Shopify CAT when missing/near expiry (or force=true).
 * Returns true when a renew succeeded and was persisted.
 */
export async function renewShopifyCustomerAccessTokenIfNeeded(
  opts: { force?: boolean } = {}
): Promise<boolean> {
  const stored = readStoredToken()
  const accessToken = stored?.accessToken?.trim()
  if (!accessToken) {
    return false
  }

  if (
    !opts.force &&
    !shouldRenewCustomerAccessToken(stored?.expiresAt)
  ) {
    return false
  }

  try {
    const auth = useAppStore
      .getState()
      .modules.getModule<{
        renewCustomerAccessToken: (
          token: string
        ) => Promise<{
          status?: string
          data?: {
            customerAccessTokenRenew?: {
              customerAccessToken?: StoredCustomerAccessToken
            }
          }
        }>
      }>('auth')

    if (!auth?.renewCustomerAccessToken) {
      return false
    }

    const result = await auth.renewCustomerAccessToken(accessToken)
    if (result?.status !== 'success') {
      if (__DEV__) {
        console.log('[Mehery][sessionKeepAlive] renew skipped/failed', {
          status: result?.status,
        })
      }
      return false
    }

    const renewed =
      result.data?.customerAccessTokenRenew?.customerAccessToken
    if (!renewed?.accessToken) {
      return false
    }

    persistToken({
      accessToken: renewed.accessToken,
      expiresAt: renewed.expiresAt,
    })
    if (__DEV__) {
      console.log('[Mehery][sessionKeepAlive] customerAccessToken renewed', {
        expiresAt: renewed.expiresAt,
      })
    }
    return true
  } catch (e) {
    console.warn('[Mehery][sessionKeepAlive] renew error', e)
    return false
  }
}

let installed = false
let appStateSub: NativeEventSubscription | null = null
let renewing: Promise<boolean> | null = null

async function renewSerialized(
  opts?: { force?: boolean }
): Promise<boolean> {
  if (renewing) {
    return renewing
  }
  renewing = renewShopifyCustomerAccessTokenIfNeeded(opts).finally(() => {
    renewing = null
  })
  return renewing
}

function onAppStateChange(next: AppStateStatus): void {
  if (next !== 'active') {
    return
  }
  void renewSerialized()
}

/**
 * Install AppState renew + wrap getUserDetails to renew before fetch
 * (avoids expired CAT → resetUser on cold start).
 */
export function installMeherySessionKeepAlive(): void {
  if (installed) {
    return
  }
  installed = true

  try {
    const user = useAppStore.getState().user
    const original = user.getUserDetails.bind(user)
    user.getUserDetails = async () => {
      await renewSerialized({ force: true })
      return original()
    }
  } catch (e) {
    console.warn('[Mehery][sessionKeepAlive] wrap getUserDetails failed', e)
  }

  appStateSub?.remove()
  appStateSub = AppState.addEventListener('change', onAppStateChange)
  void renewSerialized()
}
