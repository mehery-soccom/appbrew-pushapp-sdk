---
name: mehery-pushapp-integration
description: >-
  Integrates react-native-pushapp-appbrew (PushApp) into App Brew host apps:
  local package install, native Android/iOS, dual-send GA4 events via MeheryTracker,
  rich push (carousel/CTA/live), coexistence with FirebasePush/Notifee, and client
  handoff docs. Use when working on Mehery, PushApp, pushapp_neilo, mehery-event-sender,
  dual-send analytics, or PushApp notification extensions.
---

# Mehery PushApp integration (App Brew)

## Non-negotiables

1. **Never edit** `Desktop/msdk/react-native-pushapp-appbrew/**` (SDK is read-only).
2. Install from local path: `file:../msdk/react-native-pushapp-appbrew`.
3. Cold-start order is mandatory:
   `readCredentialsForEnvironment(env)` → `pushappAuth` → `await initSdk` → mount `PollOverlayProvider`.
4. Dual-send every Excel/GA4 event through `MeheryTracker` → `sendCustomEvent(exactGa4Name, payload)`.
5. Mehery owns PushApp rich tray; keep `modules['push'] = FirebasePush.getInstance`.
6. Android: remove RNFB default messaging service (`tools:node="remove"`). Background rich push needs **data-only** high-priority FCM.

Default env on `pushapp_neilo`: `'development'` → host `pushapp.co.in`.

## Host layout (this repo)

| Area | Path |
|------|------|
| JS helpers | `src/mehery/` |
| App wire | `src/app/App.tsx`, `index.js` |
| Android | `android/app/src/main/AndroidManifest.xml`, `.../values/strings.xml` |
| iOS credentials / modes | `ios/natori/Info.plist` |
| iOS categories + URL body | `ios/natori/AppDelegate.swift` |
| iOS NSE | `ios/ImageNotification/` (Mehery multi-image NSE) |
| iOS NCE | `ios/ImagePreviewExtension/` |
| Live Activity sources | `ios/DeliveryActivity/` (target may need Xcode/App Groups) |
| Client guide | `docs/mehery-pushapp-integration-guide.md` (+ `.pdf`, `.docx`) |

## Bootstrap checklist

- [ ] Peer deps: `react-native-push-notification`, `@react-native-async-storage/async-storage`
- [ ] Credentials in Info.plist + `strings.xml` (prod/sandbox/dev)
- [ ] `UIBackgroundModes` → `remote-notification`
- [ ] `registerFcmBackgroundHandler()` in `index.js` before `AppRegistry`
- [ ] `MeheryTracker` registered in **and out of** `__DEV__`
- [ ] `PollOverlayProvider` once at root
- [ ] Android RNFB messaging service removed from merged manifest
- [ ] iOS notification categories registered (carousel + all 2/3-button categories)
- [ ] Dual-send: all 22 Excel events (see [reference.md](reference.md))

## Dual-send rules

- Prefer **exact GA4 event names** (`add_to_cart`, `purchase`, …).
- `paramsWhitelist` = all Excel property keys (include nested `items[]` fields).
- `setUserDetails` → `OnUserLogin` + `updateUserProfile`; logout → `OnUserLogOut`.
- Profile: host `{ name, phones: [string], email }` → SDK PUT string `name`, `phones[].phone`, `additionalInfo.email`. Never invent `source` from mobile; `alt_emails` → `additionalInfo.alt_emails`. See [reference.md](reference.md) and `.cursor/rules/mehery-pushapp-profile.mdc`.
- Call `OnAppLaunch` / `OnAppOpen` after `initSdk` (outside analytics bus).
- Interactive events before device link are queued by SDK (cap 50).

## Notification matrix (summary)

**Android (native `MyFirebaseMessagingService`):** simple, BigPicture, carousel (Prev/Next), live tray (`message1`–`message3`), CTAs, `notification_url`, local `triggerCarouselNotification`.

**iOS:** plain / single-image NSE / carousel NCE (`CAROUSEL_CATEGORY`, `THREE_CAROUSEL_CATEGORY`) / all action categories / silent daily ping / Live Activity when provisioned.

Payload keys and E2E steps: [reference.md](reference.md).

## Coexistence

- Keep FirebasePush module contract.
- Suppress duplicate Notifee foreground tray for PushApp payloads (`src/mehery/pushCoexistence.ts`).
- Do not patch `@gauntlet/*` call sites for dual-send — use tracker fan-out only.

## After integrating

Update `docs/mehery-pushapp-integration-guide.md` with the real file inventory, then export PDF + DOCX for the client.
