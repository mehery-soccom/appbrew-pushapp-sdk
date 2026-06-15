# Testing and Publishing

## Local development

After [creating an integration](./05-creating-an-integration.md), develop inside `packages/<name>/src/`. The app automatically picks up local packages during development.

Changes to your source trigger hot reload via Metro.

If you just created a new integration, restart Metro with cache cleared:

```bash
pnpm start --reset-cache
```

## Testing your integration

1. Wire it into `src/app/App.tsx` and/or `src/app/register-blocks.ts`
2. Run the app: `pnpm run-ios` or `pnpm run-android`
3. Verify your blocks render and trackers receive events

## Publishing to npm

When your integration is ready:

1. Update the `name` field in `packages/<name>/package.json` to your npm scope:

   ```json
   {
     "name": "@your-org/your-integration",
     "version": "1.0.0"
   }
   ```

2. Publish:

   ```bash
   cd packages/<name>
   npm publish --access public
   ```

## Verifying the published version

After publishing, confirm it works when installed from npm (not from local `packages/`):

1. Remove the local package:

   ```bash
   rm -rf packages/<name>
   ```

2. Add the published package to the root `package.json`:

   ```json
   "@your-org/your-integration": "1.0.0"
   ```

3. Reinstall and test:

   ```bash
   pnpm install
   pnpm start --reset-cache
   pnpm run-ios
   ```

## What to include in your published package

Your npm package must include:

| File | Purpose |
|------|---------|
| `src/` | Raw TypeScript source (Metro compiles at build time) |
| `package.json` | Metadata, `main`, peer dependencies, `files` field |

The `files` field in `package.json` should list:

```json
"main": "src/index.ts",
"files": ["src/"]
```

Peer dependencies should include at minimum:

```json
"peerDependencies": {
  "@gauntlet/brewery": "*"
}
```

Add any other native libraries your integration requires as peer dependencies (e.g., `react-native-webview` for checkout integrations).

## What to deliver to the Appbrew team

Along with your published npm package, provide:

1. The package name and version
2. Integration config schema (what goes in `config.integrations.<your-key>`)
3. Block config schema (if your integration includes blocks)
4. Setup instructions (which blocks to register, how to wire trackers)
5. Any native dependencies that need linking or pod install
