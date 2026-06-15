# Connecting Your Store

The app is **config-driven**: its screens, blocks, theme, and navigation come from app config served by the Appbrew backend, keyed by an `APP_ID` and `APP_THEME_ID` in `.env`.

## It works out of the box

The repo ships a working `APP_ID` / `APP_THEME_ID` (the **Natori** demo store), so you can build and run the sample app immediately and develop integrations against a real config — no Shopify store or account required.

## To edit the config yourself

Editing the app config (changing screens/blocks and seeing them live on the device) happens in the **Appbrew studio dashboard**, which needs your own store + dashboard access. Two ways to get it:

- **Connect your own Shopify store** (below), or
- **Get in touch with the Appbrew team** for studio dashboard access.

### 1. Install the Appbrew app on your Shopify store

Install the **Appbrew** mobile-builder app from the Shopify App Store into your store and finish the setup. This connects your store to the Appbrew backend and provisions your app + a theme.

### 2. Get your credentials from the Appbrew dashboard

From the dashboard, copy your:

- **APP_ID** — your app's unique identifier (e.g. `app_XXXXXXXXXXXXX`)
- **APP_THEME_ID** — the theme config to load (e.g. `theme_XXXXXXXXXXXXX`)

### 3. Update `.env`

Edit `.env` in the repo root — set `ENV=debug` so the app loads the editable (non-live) theme you're working on in the dashboard:

```
ENV=debug
APP_ID="app_YOUR_APP_ID"
APP_NAME="Your Store"
APP_THEME_ID="theme_YOUR_THEME_ID"
APP_SERVICE_URL="https://edge.app.appbrew.tech"
```

`APP_SERVICE_URL` is the Appbrew edge API — don't change it.

### 4. Rebuild and run

```bash
pnpm start --reset-cache
pnpm run-ios        # or pnpm run-android
```

The app now loads your store's config. Edit screens/blocks in the Appbrew dashboard and watch them update live on the device — the full end-to-end config flow.

## Notes

- `ENV=debug` points the app at the theme you're editing in the dashboard. `ENV=release` loads the published (live) theme.
- The Firebase config (`GoogleService-Info.plist`, `google-services.json`) in the repo is for the sample app — push notifications and Firebase Analytics still point to the sample project. That's fine for development.
- To test checkout with real payments, configure your Shopify store's payment settings accordingly.
