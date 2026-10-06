/**
 * @format
 *
 * ScriptManager must resolve chunks with `platform` query (dev server 404s without it).
 * Mehery is loaded via dynamic import() after App mount so its ESM graph is not
 * evaluated during AppRegistry / initial bundle execution.
 */

import { ScriptManager, Script } from '@callstack/repack/client'
import { AppRegistry, NativeModules, Platform } from 'react-native'
import messaging from '@react-native-firebase/messaging'
import App from './src/app/App'
import { name as appName } from './app.json'

// Must be registered before AppRegistry (RN Firebase). Dynamic-import Mehery
// inside the handler so cold start does not evaluate push-notification-ios.
try {
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    try {
      if (Platform.OS === 'ios' && !NativeModules.RNCPushNotificationIOS) {
        return
      }
      const { loadMeherySdk } = await import('./src/mehery/sdk')
      const sdk = await loadMeherySdk()
      if (typeof sdk.handleBackgroundFcmMessage === 'function') {
        await sdk.handleBackgroundFcmMessage(remoteMessage)
      }
    } catch (e) {
      console.warn('[Mehery] background FCM handler failed', e)
    }
  })
} catch (e) {
  console.warn('[Mehery] setBackgroundMessageHandler failed', e)
}

ScriptManager.shared.addResolver(async (scriptId) => {
  if (__DEV__) {
    return {
      url: Script.getDevServerURL(scriptId),
      query: { platform: Platform.OS },
      cache: false,
    }
  }
  return {
    url: Script.getFileSystemURL(scriptId),
  }
})

AppRegistry.registerComponent(appName, () => App)
