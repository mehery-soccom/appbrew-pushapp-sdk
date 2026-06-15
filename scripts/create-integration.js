#!/usr/bin/env node

/**
 * Scaffold a new integration package for local development.
 *
 * Usage:
 *   node scripts/create-integration.js <integration-name>
 *   node scripts/create-integration.js okendo-rewards
 *
 * Creates packages/<name>/ with:
 *   - package.json
 *   - src/index.ts (boilerplate export)
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const PACKAGES_DIR = path.join(ROOT, 'packages')

function createIntegration(name) {
  const pkgDir = path.join(PACKAGES_DIR, name)

  if (fs.existsSync(pkgDir)) {
    console.error(`ERROR: packages/${name}/ already exists.`)
    process.exit(1)
  }

  console.log(`\nCreating integration: ${name}\n`)

  // Create directories
  fs.mkdirSync(path.join(pkgDir, 'src'), { recursive: true })

  // package.json
  const pkgJson = {
    name: name,
    version: '1.0.0',
    main: 'src/index.ts',
    files: ['src/'],
    peerDependencies: {
      '@gauntlet/brewery': '*',
    },
  }
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify(pkgJson, null, 2) + '\n',
  )
  console.log('  Created package.json')

  // src/index.ts
  const indexContent = `/**
 * ${name} integration
 *
 * Export your integration's blocks, trackers, and utilities from here.
 *
 * Example:
 *   export { MyBlock } from './blocks/my-block'
 *   export { MyTracker } from './my-tracker'
 */

export const INTEGRATION_NAME = '${name}'
`
  fs.writeFileSync(path.join(pkgDir, 'src', 'index.ts'), indexContent)
  console.log('  Created src/index.ts')

  console.log(`\nDone! Integration created at packages/${name}/\n`)
  console.log('Next steps:')
  console.log(`  1. pnpm install`)
  console.log(`  2. Develop your integration in packages/${name}/src/`)
  console.log(`  3. Import in the app: import { ... } from '${name}'`)
  console.log(`  4. Wire into src/app/App.tsx or src/app/register-blocks.ts`)
  console.log('')
  console.log('When ready to publish:')
  console.log(`  1. Update the "name" field in packages/${name}/package.json to your npm scope`)
  console.log(`     e.g. "@your-org/${name}"`)
  console.log(`  2. cd packages/${name} && npm publish --access public`)
  console.log(`  3. In the consumer app, install from npm and import by package name`)
  console.log('')
}

// ---- Main ----

const args = process.argv.slice(2)
if (args.length !== 1 || args[0].startsWith('-')) {
  console.error('Usage: node scripts/create-integration.js <integration-name>')
  console.error('Example: node scripts/create-integration.js okendo-rewards')
  process.exit(1)
}

const name = args[0].toLowerCase().replace(/[^a-z0-9-]/g, '-')
createIntegration(name)
