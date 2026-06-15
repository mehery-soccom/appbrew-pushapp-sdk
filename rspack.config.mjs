import { createAppConfig } from '@app-brew/build-tools/rspack-config.mjs'

export default createAppConfig({
  name: 'natori',
  appDir: import.meta.dirname,
  monorepoRoot: import.meta.dirname,
})
