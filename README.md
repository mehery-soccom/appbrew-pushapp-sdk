# Sample Appbrew App

A sample React Native app for building and testing third-party integrations for [Appbrew](https://appbrew.tech)-powered mobile apps. Read the full guide in **[docs/index.md](./docs/index.md)**.

## Prerequisites

- **macOS** with **Xcode** (for iOS) and/or **Android Studio** (for Android) — see React Native's [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment).
- **[mise](https://mise.jdx.dev)** — pins the toolchain (Node, pnpm, Ruby, Java). Install with `brew install mise`.
- **Registry access** — `.npmrc` ships a **read-only** token for Appbrew's package registry (`npm.appbrew.tech`). If `pnpm install` returns a 401, ask the Appbrew team for a fresh token.

## Quick start

```bash
git clone git@github.com:appbrew-community/sample-appbrew-app.git
cd sample-appbrew-app

mise install        # install the pinned toolchain (run `mise trust` if prompted)
pnpm install

pnpm run-ios        # boots a simulator, installs Pods, builds + launches
pnpm run-android    # boots an emulator (or uses a connected device), builds + launches
```

`run-ios` / `run-android` handle the whole loop — toolchain, pod/gradle build, the bundler, and launch.

### Other commands

| Command | What it does |
| --- | --- |
| `pnpm start` | Start the Re.Pack/Metro dev server only |
| `pnpm pod-install` | (Re)install CocoaPods |
| `pnpm clean-ios` / `pnpm clean-android` | Wipe native build output |

## Create an integration

```bash
pnpm create-integration my-integration
```

Scaffolds `packages/my-integration/` (a workspace package) with a `package.json` + `src/index.ts`. Build your blocks/trackers there, then wire them into `src/app/App.tsx` / `src/app/register-blocks.ts`. See **[docs/05-creating-an-integration.md](./docs/05-creating-an-integration.md)**.

## Connecting a store & editing config

The app is **config-driven** — screens, blocks, theme, and navigation come from app config served by Appbrew, keyed by an `APP_ID` + `APP_THEME_ID` in `.env`.

**Out of the box:** the repo ships a working `APP_ID` / `APP_THEME_ID` (the Natori demo store), so it builds and runs as-is — good for exploring the app and developing integrations against a real config.

**To edit the config yourself** (change screens/blocks live via the Appbrew dashboard) you need your own store + studio access:

1. Install the **Appbrew** mobile-builder app from the Shopify App Store into your Shopify store and finish the setup.
2. Copy your `APP_ID` and `APP_THEME_ID` from the Appbrew dashboard into `.env`, and set `ENV=debug`.
3. Rebuild (`pnpm run-ios` / `pnpm run-android`). The app now loads your store's config — edit screens/blocks in the dashboard and see the changes live on the device.

No Shopify store? **Get in touch with the Appbrew team** for studio dashboard access. Full walkthrough in [docs/11-connecting-your-store.md](./docs/11-connecting-your-store.md).

## Documentation

**PushApp (Mehery) SDK:** see [vendor/react-native-pushapp-appbrew/README.md](./vendor/react-native-pushapp-appbrew/README.md) for what to add to an App Brew app, and where.

The `docs/` folder is the full integration developer guide — prerequisites, how Appbrew apps work, screens & blocks, building integrations / blocks / trackers, metafields, checkout, testing & publishing, and connecting your store. Start at **[docs/index.md](./docs/index.md)**.

For the hosted version, see the **Appbrew Integration Developer Docs**:
👉 https://app.notion.com/p/app-brew/Appbrew-Integration-Developer-Docs-344eca13d6e180e4af03f524b3daafcd
