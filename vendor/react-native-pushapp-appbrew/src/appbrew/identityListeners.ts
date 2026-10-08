import AsyncStorage from '@react-native-async-storage/async-storage'
import { EVENTS, EventEmitter } from '@gauntlet/event-emitter'
import { useAppStore } from '@gauntlet/state'
import { getMeheryTracker } from './MeheryTracker'
import { applyRememberedMeheryIdentity } from './buildMeheryProfileInfo'
import { sendMeheryCustomEvent } from './sendCustomEvent'

let unsubscribers: Array<() => void> = []

/**
 * Resolve user_id for logout dual-send. Gauntlet resetUser() clears Zustand
 * before SIGNOUT_SUCCESS, so prefer tracker / AsyncStorage over the store.
 */
async function resolveLogoutUserId(
  tracker: ReturnType<typeof getMeheryTracker>
): Promise<string | undefined> {
  const linked = tracker.getLinkedUserId?.()
  if (linked?.trim()) {
    return linked.trim()
  }
  try {
    const stored = (await AsyncStorage.getItem('user_id'))?.trim()
    if (stored) {
      return stored
    }
  } catch {
    /* ignore */
  }
  try {
    const details = useAppStore.getState().user?.data?.userDetails?.data as
      | { id?: string | number; email?: string }
      | undefined
    if (details?.id != null) {
      return String(details.id)
    }
    if (details?.email) {
      return String(details.email)
    }
  } catch {
    /* ignore */
  }
  return undefined
}

/**
 * Ensure PushApp identity links when Shopify auth succeeds.
 * Re-binds on every startMehery() so Fast Refresh cannot leave us subscribed
 * to a dead handler (which left the dashboard on "Unidentified customer").
 */
export function wireMeheryIdentityListeners(): void {
  for (const unsub of unsubscribers) {
    try {
      unsub()
    } catch {
      /* ignore */
    }
  }
  unsubscribers = []

  const tracker = getMeheryTracker()
  const emitter = EventEmitter.getInstance()

  unsubscribers.push(
    emitter.subscribe(EVENTS.SIGNIN_SUCCESS, (payload: any) => {
      const customer = payload?.customerDetails
      if (!customer) {
        console.warn('[Mehery] SIGNIN_SUCCESS without customerDetails')
        return
      }
      console.log('[Mehery] SIGNIN_SUCCESS → OnUserLogin / updateUserProfile')
      // Re-apply remembered OTP email/phone if SIGNIN payload omitted them.
      void tracker.setUserDetails(applyRememberedMeheryIdentity(customer))
    })
  )

  unsubscribers.push(
    emitter.subscribe(EVENTS.SIGNOUT_SUCCESS, () => {
      console.log('[Mehery] SIGNOUT_SUCCESS → logout / OnUserLogOut + clear')
      void (async () => {
        // Resolve before any delink/clear so Event Analytics keeps user_id.
        const userId = await resolveLogoutUserId(tracker)
        if (userId) {
          const payload = { user_id: userId }
          await sendMeheryCustomEvent('logout', payload, 'LOG')
          await sendMeheryCustomEvent('OnUserLogOut', payload, 'LOG')
        } else {
          // Excel logout has no required props; skip empty OnUserLogOut.
          await sendMeheryCustomEvent('logout', {}, 'LOG')
        }
        await tracker.setUserDetails(undefined)
      })()
    })
  )

  unsubscribers.push(
    useAppStore.subscribe(
      (state) => state.user.data.userDetails,
      (userDetails) => {
        if (userDetails?.status === 'idle' && userDetails?.data) {
          // Name edits refetch userDetails without OTP phone; merge remembered.
          void tracker.setUserDetails(
            applyRememberedMeheryIdentity(userDetails.data)
          )
        }
        // Do not logout on idle-empty or fetch error. Profile name edits
        // refetch userDetails and can briefly clear `data`; that used to
        // OnUserLogOut → /device/delink, then relink only this phone
        // (Device 3→1) and drop subsequent events. Real logout is
        // SIGNOUT_SUCCESS above.
      }
    )
  )
}
