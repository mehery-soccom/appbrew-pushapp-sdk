import { Linking } from 'react-native'
import { loadMeherySdk } from './sdk'
import { getPushAppConfig } from './config'

/**
 * Route PushApp notification URLs into the host app via React Native Linking.
 */
export async function configureMeheryDeepLinks() {
  const sdk = await loadMeherySdk()
  const { appScheme, httpsHosts } = getPushAppConfig()
  if (appScheme && httpsHosts?.length) {
    sdk.configureNotificationLinkRewrites(
      httpsHosts.flatMap((host) => [
        { httpsHost: host, appScheme },
        { httpsHost: `www.${host}`, appScheme },
      ])
    )
  }

  sdk.setNotificationUrlHandler(async (url: string) => {
    try {
      await Linking.openURL(url)
    } catch (e) {
      console.warn('[Mehery] open notification url failed', url, e)
    }
  })
}
