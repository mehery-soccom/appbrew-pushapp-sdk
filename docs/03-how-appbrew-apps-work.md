# How Appbrew Apps Work

## Overview

Appbrew apps are config-driven React Native apps. The entire UI -- screens, navigation, blocks, themes -- is defined by a JSON config served from the Appbrew backend. The app fetches this config on launch and renders everything dynamically.

```
┌─────────────────────────────────────────────────────────┐
│                  Appbrew Backend                        │
│  (manages config, themes, integrations per store)       │
└──────────────────────┬──────────────────────────────────┘
                       │  JSON config
                       ▼
┌─────────────────────────────────────────────────────────┐
│                  Mobile App                             │
│                                                         │
│  ┌──────────┐    ┌───────────────┐    ┌──────────────┐  │
│  │  Config  │───>│     Shell     │───>│   Screens    │  │
│  │  (JSON)  │    │  (navigation  │    │  (ordered    │  │
│  │          │    │   + init)     │    │   blocks)    │  │
│  └──────────┘    └───────────────┘    └──────┬───────┘  │
│                                              │          │
│                                     ┌────────▼───────┐  │
│                                     │    Blocks      │  │
│                                     │  (React comps  │  │
│                                     │   from a       │  │
│                                     │   registry)    │  │
│                                     └────────────────┘  │
│                                                         │
│         ┌────────────────────────────────────────┐      │
│         │          Integrations                  │      │
│         │   (trackers, custom blocks, checkout)  │      │
│         └────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

## Key Concepts

**Config** -- a JSON object that defines the app's navigation, screens, blocks, theme, and integration settings. Fetched from `APP_SERVICE_URL` using the `APP_ID` from `.env`. Cached locally for offline access.

**Shell** -- the root component that orchestrates everything: fetches config, sets up navigation, initializes integrations, and manages the splash screen.

**Screens** -- each screen has an ID and contains an ordered list of blocks. Screens map to navigation tabs, routes, and modals. The config determines which screens exist and what they contain.

**Blocks** -- the atomic UI units. Each block has a `componentId` that maps to a React component in the block registry. Blocks receive their data (`source`), styling (`style`), and behavior (`options`) from config.

**Block Registry** -- a map of `componentId -> React component`. Custom integrations extend the app by registering new components here.

**Integrations** -- third-party services configured in the config JSON under `integrations.*`. Your integration reads its config from here (API keys, feature flags, etc.).

## Data Flow

```
User opens app
  │
  ▼
App launches, fetches config from Appbrew backend
  ├── Config cached locally (offline support)
  ├── Registers blocks, trackers, integrations
  └── Sets up navigation from config
  │
  ▼
User navigates to a screen
  │
  ▼
Screen renders its blocks from config
  ├── Block receives source/style/options from config
  └── Block renders UI based on config values
  │
  ▼
User interacts (add to cart, search, checkout, etc.)
  ├── Analytics events fired to all registered trackers
  └── UI updates reactively
```
