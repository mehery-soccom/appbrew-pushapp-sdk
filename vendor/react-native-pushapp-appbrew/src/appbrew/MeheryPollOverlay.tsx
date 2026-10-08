import React from 'react'

/**
 * Starts PushApp once (idempotent) and mounts PollOverlayProvider after init.
 * Loaded lazily so the SDK is never evaluated during AppRegistry.
 */
export function MeheryPollOverlay() {
  const [Provider, setProvider] = React.useState<React.ComponentType | null>(
    null
  )

  React.useEffect(() => {
    let cancelled = false
    import('./startMehery')
      .then((m) => m.startMehery())
      .then(() => import('./sdk'))
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
    return () => {
      cancelled = true
    }
  }, [])

  return Provider ? <Provider /> : null
}
