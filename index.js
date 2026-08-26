/**
 * @format
 *
 * ScriptManager must resolve chunks with `platform` query (dev server 404s without it).
 * Mehery is loaded via dynamic import() after App mount so its ESM graph is not
 * evaluated during AppRegistry / initial bundle execution.
 */

import { ScriptManager, Script } from '@callstack/repack/client'
import { AppRegistry, Platform } from 'react-native'
import App from './src/app/App'
import { name as appName } from './app.json'

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
