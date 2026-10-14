import React from 'react'
import { AppState } from 'react-native'

/**
 * Mounts PollOverlayProvider as soon as the SDK module loads, independent of
 * startMehery: a bootstrap timeout/throw (slow iOS APNs register) must not
 * leave overlays queued forever. startMehery runs alongside and is retried
 * on foreground while it keeps failing.
 * Loaded lazily so the SDK is never evaluated during AppRegistry.
 */
export function MeheryPollOverlay() {
  const [Provider, setProvider] = React.useState<React.ComponentType | null>(
    null
  )

  React.useEffect(() => {
    let cancelled = false
    let started = false

    const start = () =>
      import('./startMehery')
        .then((m) => m.startMehery())
        .then(() => {
          started = true
        })
        .catch((e) => {
          // Release builds log too: this is the only trace of a dead in-app pipeline.
          console.warn('[Mehery] startMehery failed — will retry on foreground', e)
        })

    import('./sdk')
      .then((m) => m.loadMeherySdk())
      .then((sdk) => {
        if (!sdk || cancelled) {
          return
        }
        const Comp = sdk.PollOverlayProvider
        if (Comp) {
          setProvider(() => Comp)
        } else {
          console.warn('[Mehery] PollOverlayProvider missing')
        }
      })
      .catch((e) => {
        console.warn('[Mehery] PollOverlayProvider load failed', e)
      })
      .then(start)

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !started && !cancelled) {
        void start()
      }
    })

    return () => {
      cancelled = true
      sub.remove()
    }
  }, [])

  return Provider ? <Provider /> : null
}
