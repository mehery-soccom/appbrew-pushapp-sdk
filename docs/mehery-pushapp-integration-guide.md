# Mehery PushApp Integration Guide (App Brew / Natori)

**Audience:** Client engineering team integrating or maintaining PushApp in this host app.  
**Branch:** `pushapp_neilo`  
**Host app:** App Brew Natori (`com.app.appbrew`)  
**SDK (read-only):** `react-native-mehery-event-sender` from local path `../msdk/react-native-mehery-event-sender`  
**Date:** 2026-08-10

This document explains **what we changed**, **where**, **why**, and **how to repeat or extend** the integration. The Mehery SDK source itself was **not** modified.

---

## 1. Purpose and architecture

PushApp (Mehery) provides:

- Device registration and authenticated API access (`pushappAuth` + `initSdk`)
- Rich push (Android native FCM service; iOS NSE + NCE carousel / action categories)
- In-app poll overlays (`PollOverlayProvider`)
- Event / journey tracking (`sendCustomEvent`, login link, page lifecycle)

App Brew already had Firebase Analytics / `@gauntlet/firebase-push` / Notifee. This integration:

1. Boots Mehery on cold start.
2. **Dual-sends** every Excel/GA4 commerce event to Mehery via a new `MeheryTracker` on `AnalyticsProvider` (no patches to `@gauntlet/*` call sites).
3. Lets **Mehery own PushApp rich tray UI** while keeping `modules['push'] = FirebasePush.getInstance` for the AppBrew push module contract.

```
User action → AnalyticsProvider
                ├─ FirebaseTracker / AppbrewTracker / FacebookTracker  (release only, !__DEV__)
                └─ MeheryTracker → sendCustomEvent (always, including __DEV__)

FCM data push → Android MyFirebaseMessagingService (Mehery)
             → iOS ImageNotification NSE + ImagePreviewExtension NCE
```

---

## 2. Prerequisites checklist

Before shipping:

- [ ] Firebase configs present (`android/app/google-services.json`, `ios/GoogleService-Info.plist`) — currently sample Natori project; replace for production
- [ ] Google Services Gradle plugin applied (already present)
- [ ] Peer packages installed: `@react-native-firebase/app`, `@react-native-firebase/messaging`, `@react-native-async-storage/async-storage`, `react-native-push-notification`
- [x] Real PushApp credentials in Info.plist + `strings.xml` (client `pa_` / `pas_` set in all three envs)
- [x] Real channel id in `src/mehery/bootstrap.ts` (`MEHERY_CHANNEL_ID` = `ecommerce_1786525308082`)
- [ ] Android: RNFB default messaging service removed (`tools:node="remove"`) — **done**
- [ ] iOS: Push capability + `UIBackgroundModes` → `remote-notification` — **done**
- [ ] iOS: Notification content extension target signed (ImagePreviewExtension)
- [ ] Cold start: credentials → `pushappAuth` → `initSdk` before events — **wired**
- [ ] `PollOverlayProvider` mounted — **done**

---

## 3. Package install

### Dependency lines added to `package.json`

```json
"react-native-mehery-event-sender": "file:../msdk/react-native-mehery-event-sender",
"react-native-push-notification": "^8.1.1",
"@react-native-async-storage/async-storage": "^3.1.1"
```

Existing (kept): `@react-native-firebase/app` and `@react-native-firebase/messaging` at `23.3.1`.

### Commands

```bash
cd "/Users/neil/Desktop/APP Brew"
pnpm add react-native-mehery-event-sender@file:../msdk/react-native-mehery-event-sender \
  react-native-push-notification \
  @react-native-async-storage/async-storage

pnpm pod-install   # ios: bundle install && bundle exec pod install
```

CocoaPods includes `MeheryEventSender (0.0.49)` after install.

---

## 4. Android native edits

### 4.1 `android/app/src/main/AndroidManifest.xml`

**Added:**

- `WAKE_LOCK` permission
- Service removal so Mehery’s `MyFirebaseMessagingService` owns FCM:

```xml
<service
  android:name="io.invertase.firebase.messaging.ReactNativeFirebaseMessagingService"
  android:exported="false"
  tools:node="remove" />
```

**Why:** React Native Firebase registers a no-op messaging service. If both remain, background rich push (images, carousel, CTAs) can hit the wrong service.

**Already present:** `INTERNET`, `POST_NOTIFICATIONS`, Firebase default channel / icon meta-data. Mehery SDK merges its own service/receivers from the library manifest.

### 4.2 `android/app/src/main/res/values/strings.xml`

Added credential placeholders:

| String resource | Purpose |
|---|---|
| `mehery_prod_app_id` / `mehery_prod_app_key` | Production (`initSdk` env `false`) |
| `mehery_sandbox_app_id` / `mehery_sandbox_app_key` | Sandbox (`true`) |
| `mehery_dev_app_id` / `mehery_dev_app_key` | Development (`'development'`) |

Client dashboard App ID / App Key are set in all three env slots. Rotating credentials requires a store update.

### 4.3 Unchanged but required

- `android/build.gradle` — `com.google.gms:google-services`
- `android/app/build.gradle` — `apply plugin: "com.google.gms.google-services"`
- `android/app/google-services.json`

### 4.4 Android notification types (provisioned by Mehery native path)

| Type | How it triggers |
|---|---|
| Simple banner | title/body, no multi-image |
| BigPicture | single `image` / `imageUrl` / `image_url` |
| Carousel | `imageUrls` / `image_urls` / `carousel_images` / `image1`… (max 4); Prev/Next |
| Live tray | `message1` + `message2` + `message3` (+ progress / hero) |
| CTA buttons | `cta_buttons` or `titleN`/`urlN`/`actionN` |
| Deep link | `notification_url` / `notificationUrl` |
| Local test | JS `triggerCarouselNotification({ title, body, images })` (Android-only) |

**Payload rule:** Background rich UI requires **data-only**, high-priority FCM. A top-level FCM `notification` block shows the stock OS tray and skips Mehery’s service.

Verify:

```bash
adb logcat -s MyFirebaseMessagingService:I
```

Example carousel `data` map:

```json
{
  "title": "New arrivals",
  "body": "Swipe looks",
  "imageUrls": "[\"https://example.com/1.jpg\",\"https://example.com/2.jpg\"]",
  "notification_url": "https://natori-appbrew.myshopify.com/collections/all",
  "title1": "Shop",
  "url1": "https://natori-appbrew.myshopify.com/collections/all",
  "action1": "SHOP"
}
```

---

## 5. iOS native edits

### 5.1 `ios/natori/Info.plist`

**Added:**

- `MeheryProdAppId` / `MeheryProdAppKey`
- `MeherySandboxAppId` / `MeherySandboxAppKey`
- `MeheryDevAppId` / `MeheryDevAppKey`
- `UIBackgroundModes`: `remote-notification`, `fetch`
- `NSSupportsLiveActivities` (+ frequent updates) for Live Activity

Entitlements already include `aps-environment`.

### 5.2 `ios/natori/AppDelegate.swift`

**Added:**

- `registerNotificationCategories()` — all PushApp 2-button and 3-button categories (including `CAROUSEL_CATEGORY`, `THREE_CAROUSEL_CATEGORY`, …)
- `userNotificationCenter(_:willPresent:)` — show banner/list/sound/badge in foreground
- `userNotificationCenter(_:didReceive:)` — open `notification_url` / related keys via `urlForNotificationBody`

### 5.3 Notification Service Extension (`ios/ImageNotification/`)

**Replaced** Firebase `Messaging.serviceExtension().populateNotificationContent` with Mehery’s multi-image NSE (`NotificationService.swift` from the SDK example).

**Updated** `Info.plist` with `NSAppTransportSecurity` → `NSAllowsArbitraryLoads` so the extension can download media.

**Podfile:** ImageNotification target no longer depends on Firebase Messaging (Mehery NSE is pure UserNotifications).

### 5.4 Notification Content Extension (`ios/ImagePreviewExtension/`)

**Copied** from Mehery example (carousel / category UI). Categories declared in extension `Info.plist` match AppDelegate.

**Xcode:** `ImagePreviewExtension` native target added (`com.app.appbrew.ImagePreviewExtension`), embedded in the app. **You must** create a matching provisioning profile / App Store Connect capability for the new bundle id before release builds.

### 5.5 Live Activity (`ios/DeliveryActivity/`)

**Status: wired and compiling** (simulator build of `DeliveryActivityExtension` succeeded).

| Item | Value |
|------|------|
| Xcode target | `DeliveryActivityExtension` (embedded in `natori`) |
| Bundle ID | `com.app.appbrew.DeliveryActivity` |
| App Group | `group.com.app.appbrew.NotificationLiveActivity` (main + extension) |
| Start/update | `ios/natori/MeheryLiveActivity.swift` via `didReceiveRemoteNotification` |
| UI | `DeliveryActivityLiveActivity.swift` (Lock Screen / Dynamic Island) |

**Client must still:** create the App Group + App IDs/profiles in Apple Developer and assign signing for `DeliveryActivityExtension`.

Trigger: background/content-available push with `activity_id` plus live template fields (`message1`–`message3`, `live_activity`, progress, or image URL). See `ios/DeliveryActivity/README-NATORI.md`.

Example app sources `DeliveryActivity.swift` / ControlWidget were left on disk for reference but are **not** compiled (iOS 18 ControlWidget / AppIntent home-widget sample).

### 5.6 Pods

```bash
pnpm pod-install
```

Confirms `MeheryEventSender (0.0.49)` and extension targets integrate.

---

## 6. JavaScript / TypeScript wiring

### 6.1 `index.js`

```js
import { registerFcmBackgroundHandler } from 'react-native-mehery-event-sender';
registerFcmBackgroundHandler();
// then AppRegistry.registerComponent(...)
```

Must run **before** `AppRegistry.registerComponent`.

### 6.2 `src/mehery/` module folder

| File | Role |
|---|---|
| `bootstrap.ts` | Credentials → `pushappAuth` → `initSdk` → `waitForSdkReady` → deep links → Android permission → `OnAppLaunch` / `OnAppOpen` |
| `MeheryTracker.ts` | Dual-send GA4 events + identity via `setUserDetails` |
| `identity.ts` | Thin wrappers for login / logout / profile |
| `navigation.ts` | `OnPageOpen` / `OnPageClose` helpers |
| `deepLinks.ts` | `setNotificationUrlHandler` + host rewrites for Shopify hosts |
| `pushCoexistence.ts` | Android permission + PushApp payload heuristic |
| `index.ts` | Public exports |

**Defaults (change before prod):**

- `MEHERY_ENVIRONMENT = 'development'` → host `pushapp.co.in`
- `MEHERY_CHANNEL_ID = 'ecommerce_1786525308082'`

### 6.3 `src/app/App.tsx`

- Registers `new MeheryTracker()` on `AnalyticsProvider` **inside and outside** `__DEV__` (Firebase/Appbrew/Facebook stay `!__DEV__` only).
- Keeps `modules['push'] = FirebasePush.getInstance`.
- `useEffect` calls `bootstrapMeherySdk()`.
- Mounts `<PollOverlayProvider />` beside `Shell`.

### 6.4 Optional in-app poll surfaces

`PollOverlayProvider` is required for overlay polls. Optionally place:

- `InlinePollContainer`
- `TooltipPollContainer`

Poll styles supported by the SDK: roadblock, floater, banner, picture-in-picture, bottomsheet, inline, tooltip.

---

## 7. Credential and environment matrix

| `initSdk` env | Host | iOS keys | Android strings |
|---|---|---|---|
| `false` | `pushapp.ai` | `MeheryProdAppId` / `MeheryProdAppKey` | `mehery_prod_*` |
| `true` | `pushapp.net.in` | `MeherySandboxAppId` / `MeherySandboxAppKey` | `mehery_sandbox_*` |
| `'development'` | `pushapp.co.in` | `MeheryDevAppId` / `MeheryDevAppKey` | `mehery_dev_*` |

**Always** call `readCredentialsForEnvironment(environment)` then `pushappAuth` with the **same** environment you pass to `initSdk`.

---

## 8. Bootstrap sequence (mandatory)

On every cold start:

1. `readCredentialsForEnvironment(env)`
2. `pushappAuth(xApiId, xApiKey)`
3. `await initSdk(null, '<tenant>_<channel>', env, logs)`
4. `await waitForSdkReady()`
5. Mount / keep `PollOverlayProvider`
6. Then fire identity / page / custom events

Implemented in `src/mehery/bootstrap.ts` and invoked from `App.tsx`.

---

## 9. Dual-send: GA4 / Excel events → Mehery

Mechanism: `MeheryTracker` extends `AnalyticsTrackerV2` and implements `sendEvent` → `sendCustomEvent(exactGa4Name, payload, { eventType: 'INTERACTIVE' })`.

`app_install_ios` / `app_install_android` are remapped to GA4 name `app_install`.

`setUserDetails` → `OnUserLogin` + `updateUserProfile`; clearing user → `OnUserLogOut`.

Interactive events fired before device link are **queued** by the SDK (cap 50) and flushed after successful login.

### Full event catalog (from `App-brew events with properties.xlsx`)

| Event | Properties dual-sent |
|---|---|
| `app_install` | `version`, `sizeWidth`, `sizeHeight` |
| `screen_view` | `screen_name`, `screen_class` |
| `push_notification_subscribed` | `push_enabled` |
| `push_notification_unsubscribed` | `push_enabled` |
| `login` | `method` |
| `signup` | `method` |
| `logout` | *(none)* |
| `view_item` | `currency`, `value`, `items[]` (`item_id`, `handle`, `item_name`, `item_variant`, `price`, `original_price`, `discount`, `url`, `sku`, `item_category`, `item_brand`, `img_url`) |
| `view_item_list` | `item_list_id`, `handle`, `item_list_name`, `url` |
| `search` | `search_term` |
| `add_to_cart` | `currency`, `value`, `items[]` (incl. `quantity`, `sku`, …) |
| `remove_from_cart` | `currency`, `value`, `items[]` |
| `view_cart` | `url`, `value`, `checkout_token`, `sub_total`, `discount`, `currency`, `coupon`, `items[]` |
| `add_to_wishlist` | `currency`, `value`, `items[]` |
| `remove_from_wishlist` | `currency`, `value`, `items[]` |
| `notify_back_in_stock` | `currency`, `value`, `items[]` |
| `begin_checkout` | cart-like set |
| `add_shipping_info` | cart-like set |
| `apply_coupon` | `coupon`, `isApplicable` |
| `remove_coupon` | `coupon` |
| `purchase` | `transaction_id`, `shopify_order_id`, `url`, `value`, `checkout_token`, `sub_total`, `discount`, `currency`, `coupon`, `items[]` |
| `refund` | `reason`, `transaction_id`, `value`, `currency` |

Lifecycle outside the analytics bus (after init): `OnAppLaunch`, `OnAppOpen`.

---

## 10. Notification matrices

### Android

| Kind | Notes |
|---|---|
| Simple | title/body |
| BigPicture | single image key |
| Carousel | ≥2 images; Prev/Next; at most 1 CTA (action slots) |
| Live tray | `message1`–`message3` |
| CTAs | `cta_buttons` or indexed title/url/action |
| Deep link | `notification_url` |
| Click track | `t` / `click_token` → `/v1/notification/push/track` |
| Local test | `triggerCarouselNotification` |

### iOS

| Kind | Notes |
|---|---|
| Plain banner | APNs alert |
| Single-image rich | NSE attachment |
| Carousel | NSE multi-image + NCE (`CAROUSEL_CATEGORY` / `THREE_CAROUSEL_CATEGORY`) |
| Action categories | Full 2-button and 3-button sets registered in AppDelegate |
| Silent daily ping | payload `type: silent_daily_ping` |
| Body URL | `notification_url` via AppDelegate / JS handler |
| Live Activity | Wired (`DeliveryActivityExtension` + App Group); Apple Developer signing required |

---

## 11. Coexistence with FirebasePush / Notifee

| Layer | Owner |
|---|---|
| AppBrew `modules['push']` API / permissions contract | `@gauntlet/firebase-push` |
| PushApp rich tray (background Android) | Mehery `MyFirebaseMessagingService` |
| PushApp rich tray (iOS) | Mehery NSE + NCE |
| Dual-send analytics | `MeheryTracker` |
| GA4 / Appbrew / Facebook analytics | Existing trackers (`!__DEV__`) |

**Duplicate tray:** When a PushApp data payload arrives in the foreground, Mehery’s JS path may display it. If Notifee/FirebasePush also displays the same FCM message, use `isLikelyPushAppPayload(data)` from `src/mehery/pushCoexistence.ts` in any custom foreground handler to skip a second local notification. Do **not** modify the Mehery SDK to reconcile conflicts.

---

## 12. E2E verification checklist

### Build / SDK / identity

| Check | Status |
|---|---|
| `pnpm install` with local Mehery package | Done |
| `pnpm pod-install` includes `MeheryEventSender` | Done |
| Cold-start bootstrap wired | Done (device run needed to confirm no throw) |
| `PollOverlayProvider` mounted | Done |
| Android manifest RNFB remove | Done |
| Login / logout dual path via tracker | Wired; device login needed |
| Real credentials / channel id | **Blocked** — placeholders pending client |

### Dual-send (22 Excel events)

| Check | Status |
|---|---|
| `MeheryTracker` whitelists all catalog events | Done |
| Registered in `__DEV__` and production | Done |
| Device: each event visible in PushApp / SDK logs | Pending device QA |

### Android notifications

| Check | Status |
|---|---|
| Native service path provisioned via SDK | Done (library merge) |
| Data-only high-priority sends | Pending PushApp / FCM console |
| `triggerCarouselNotification` smoke | Pending device |
| logcat `MyFirebaseMessagingService` | Pending device |

### iOS notifications

| Check | Status |
|---|---|
| Categories registered | Done |
| NSE Mehery multi-image | Done (source swapped) |
| NCE target present | Done (signing profile required) |
| Carousel / CTA device test | Pending device |
| Live Activity | Target builds; device QA after App Group + signing |

### Coexistence

| Check | Status |
|---|---|
| FirebasePush module kept | Done |
| Double-tray guard helper | Done (`isLikelyPushAppPayload`) |
| Deep link rewrites for Shopify hosts | Done |

---

## 13. File change inventory

| Path | Change |
|---|---|
| `package.json` / `pnpm-lock.yaml` | Mehery + peers |
| `index.js` | `registerFcmBackgroundHandler` |
| `src/app/App.tsx` | Bootstrap, tracker, `PollOverlayProvider` |
| `src/mehery/*` | New integration helpers |
| `android/.../AndroidManifest.xml` | WAKE_LOCK + RNFB service remove |
| `android/.../values/strings.xml` | Mehery credentials |
| `ios/natori/Info.plist` | Credentials + background modes + Live Activity flags |
| `ios/natori/AppDelegate.swift` | Categories + presentation + URL open + Live Activity background hook |
| `ios/natori/MeheryLiveActivity.swift` | Start/update Live Activities from push |
| `ios/ImageNotification/*` | Mehery NSE |
| `ios/ImagePreviewExtension/*` | Mehery NCE sources + Xcode target |
| `ios/DeliveryActivity/*` | Live Activity widget extension (compiles; App Group signing pending) |
| `ios/natori/natori.entitlements` | App Group for Live Activity images |
| `ios/Podfile` | Extension targets; drop Firebase from NSE |
| `ios/Podfile.lock` / Pods | MeheryEventSender |
| `.cursor/skills/mehery-pushapp-integration/*` | Agent skill |
| `docs/mehery-pushapp-integration-guide.md` (+ pdf/docx) | This handoff |

**Never edited:** `Desktop/msdk/react-native-mehery-event-sender/**`

---

## 14. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Auth / init fails | Placeholder credentials or wrong env | Match env + native keys + channel id |
| No rich Android background push | Top-level FCM `notification` or dual messaging services | Data-only + confirm RNFB remove; check logcat |
| Carousel missing on iOS | NCE not embedded / not signed / wrong category | Confirm ImagePreviewExtension + category ids |
| Events missing in PushApp | Fired before `initSdk` / before login queue flush | Await bootstrap; login then retry |
| Double foreground notification | Notifee + Mehery both display | Skip Notifee when `isLikelyPushAppPayload` |
| Live Activity not showing | App Group / signing / payload missing `activity_id` | Enable `group.com.app.appbrew.NotificationLiveActivity`; sign `DeliveryActivityExtension`; see `README-NATORI.md` |

---

## 15. What we did not change (and why)

The Mehery SDK under `Desktop/msdk/react-native-mehery-event-sender` is treated as a **vendor package**. All host-specific behavior lives in this App Brew repo so upgrades of the SDK remain clean.

---

## 16. Appendix — public API summary

Auth/init: `readCredentialsForEnvironment`, `pushappAuth`, `initSdk`, `waitForSdkReady`  
Identity: `OnUserLogin`, `OnUserLogOut`, `updateUserProfile`  
Events: `sendCustomEvent`, `flushPendingCustomEvents`, `OnPageOpen`, `OnPageClose`, `OnAppOpen`, `OnAppLaunch`  
Push helpers: `registerFcmBackgroundHandler`, `ensureAndroidNotificationPermission`, `triggerCarouselNotification`, `setNotificationUrlHandler`, `configureNotificationLinkRewrites`, `openNotificationLink`  
UI: `PollOverlayProvider`, `InlinePollContainer`, `TooltipPollContainer`

### Further reading (SDK, read-only)

- `../msdk/react-native-mehery-event-sender/README.md`
- `../msdk/react-native-mehery-event-sender/example/src/App.tsx`
- `../msdk/react-native-mehery-event-sender/example/ios/` (NSE / NCE / DeliveryActivity / AppDelegate categories)

### Agent skill (internal)

`.cursor/skills/mehery-pushapp-integration/SKILL.md` and `reference.md`
