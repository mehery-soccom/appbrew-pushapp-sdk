import { Linking } from 'react-native'
import { loadMeherySdk } from './sdk'

/**
 * Route PushApp notification URLs into the host app via React Native Linking.
 */
export async function configureMeheryDeepLinks() {
  const sdk = await loadMeherySdk()
  sdk.configureNotificationLinkRewrites([
    {
      httpsHost: 'mehery2.myshopify.com',
      appScheme: 'mehery2',
    },
    {
      httpsHost: 'www.mehery2.myshopify.com',
      appScheme: 'mehery2',
    },
  ])

  sdk.setNotificationUrlHandler(async (url: string) => {
    try {
      await Linking.openURL(url)
    } catch (e) {
      console.warn('[Mehery] open notification url failed', url, e)
    }
  })
}
