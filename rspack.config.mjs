import path from 'node:path'
import { createRequire } from 'node:module'
import { createAppConfig } from '@app-brew/build-tools/rspack-config.mjs'
import rspack from '@rspack/core'

const require = createRequire(import.meta.url)
const meheryPkgJson = require.resolve(
  'react-native-mehery-event-sender/package.json'
)
/** Real AsyncStorage 3.x entry — used by the v2 multi* compat shim. */
const asyncStorageReal = require.resolve(
  '@react-native-async-storage/async-storage'
)
const asyncStorageCompat = path.resolve(
  import.meta.dirname,
  'src/mehery/asyncStorageCompat.ts'
)

const baseConfigFactory = createAppConfig({
  name: 'natori',
  appDir: import.meta.dirname,
  monorepoRoot: import.meta.dirname,
  extraPlugins: [
    new rspack.NormalModuleReplacementPlugin(/package\.json$/, (resource) => {
      if (
        resource.context.includes(
          `${path.sep}react-native-mehery-event-sender${path.sep}lib${path.sep}module${path.sep}helpers`
        ) &&
        (resource.request === '../../package.json' ||
          resource.request.endsWith(`${path.sep}lib${path.sep}package.json`))
      ) {
        resource.request = meheryPkgJson
      }
    }),
    // Keep dynamic import() in the main bundle — ScriptManager chunk exec
    // fails on RN (`self` / native exec). Single chunk still defers eval
    // until import() after App mount.
    new rspack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
  ],
})

export default (env) => {
  const config = baseConfigFactory(env)
  config.output = {
    ...config.output,
    globalObject: 'globalThis',
  }
  // Mehery (and peers) still call AsyncStorage.multiGet/Set/Remove; 3.x
  // legacy export only has getMany/setMany/removeMany. Route all package
  // imports through a thin v2-compat wrapper.
  config.resolve = {
    ...config.resolve,
    alias: {
      ...config.resolve?.alias,
      'async-storage-real$': asyncStorageReal,
      '@react-native-async-storage/async-storage$': asyncStorageCompat,
    },
  }
  return config
}
