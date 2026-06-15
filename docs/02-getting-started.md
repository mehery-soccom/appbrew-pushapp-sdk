# Getting Started

## Prerequisites

- **macOS** with **Xcode** (for iOS) and/or **Android Studio** (for Android).
- **[mise](https://mise.jdx.dev)** — pins the toolchain (Node, pnpm, Ruby, Java). Install with `brew install mise`.

## Registry access

The app pulls Appbrew's shared libraries (`@gauntlet/*`, `@app-brew/*`) from Appbrew's internal registry (`npm.appbrew.tech`). The repo's `.npmrc` already ships a **read-only** token, so there's no per-machine setup. If `pnpm install` returns a 401, ask the Appbrew team for a fresh token and replace the `//npm.appbrew.tech/:_authToken=` line in `.npmrc`.

## Clone and install

```bash
git clone git@github.com:appbrew-community/sample-appbrew-app.git
cd sample-appbrew-app
mise install        # pinned toolchain (run `mise trust` if prompted)
pnpm install
```

## Run on iOS

```bash
pnpm run-ios
```

`run-ios` installs Pods and builds + launches on a simulator. Pick a specific one with `pnpm run-ios --simulator="iPhone 17 Pro"`.

## Run on Android

Start an Android emulator from Android Studio (or connect a device), then:

```bash
pnpm run-android
```

## What you should see

The app launches the Natori store — a real Shopify store connected via Appbrew. You'll see a home screen with product grids, a bottom navigation bar, and screens for collections, cart, account, etc. All of it is driven by a JSON config fetched from the Appbrew backend.

## Troubleshooting

**Metro can't resolve a module**
```bash
pnpm start --reset-cache
```

**iOS build fails after dependency changes**
```bash
pnpm clean-ios && pnpm run-ios
```

**Android build fails**
```bash
pnpm clean-android && pnpm run-android
```

**Stale Xcode cache (path errors referencing old node_modules)**

Delete DerivedData:
```bash
rm -rf ~/Library/Developer/Xcode/DerivedData/natori-*
```
Then rebuild.
