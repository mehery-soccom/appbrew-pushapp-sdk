import { loadMeherySdk } from './sdk'

/** Returns cancel fn from SDK OnPageOpen (call on blur / unmount if needed). */
export function meheryOnPageOpen(pageName: string) {
  // Sync API surface; load is cached after bootstrap.
  void loadMeherySdk().then((sdk) => sdk.OnPageOpen(pageName))
  return () => {
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
