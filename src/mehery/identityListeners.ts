import { EVENTS, EventEmitter } from '@gauntlet/event-emitter'
import { useAppStore } from '@gauntlet/state'
import { getMeheryTracker } from './MeheryTracker'

let unsubscribers: Array<() => void> = []

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
      void tracker.setUserDetails(customer)
    })
  )

  unsubscribers.push(
    emitter.subscribe(EVENTS.SIGNOUT_SUCCESS, () => {
      console.log('[Mehery] SIGNOUT_SUCCESS → clear linked user')
      void tracker.setUserDetails(undefined)
    })
  )

  unsubscribers.push(
    useAppStore.subscribe(
      (state) => state.user.data.userDetails,
      (userDetails) => {
        if (userDetails?.status === 'idle' && userDetails?.data) {
          void tracker.setUserDetails(userDetails.data)
        } else if (
          userDetails?.status === 'error' ||
          (userDetails?.status === 'idle' && !userDetails?.data)
        ) {
          void tracker.setUserDetails(undefined)
        }
      }
    )
  )
}
