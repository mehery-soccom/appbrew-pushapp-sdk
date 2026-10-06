# Changelog

## 0.0.50 — 2026-08-31

### Features

- **Pending custom event queue:** `sendCustomEvent` now queues events when the user is not linked yet (no effective `user_id`, or interactive events blocked before `/device/link`). Events flush automatically after login/link, with a cap of 50 (oldest dropped). Public helper: `flushPendingCustomEvents()`.
- **Silent keep-alive:** FCM/APNs `silent_keepalive` messages no longer show a tray notification. The SDK replies with `POST /pushapp/silent/ping` (deduped) so the server can update `last_active`.
- **README:** Replaced the old DOCUMENTATION files with a single setup-focused README (Firebase, credentials, `initSdk` order, `PollOverlayProvider`).

### Fixes

- Richer silent keep-alive logs on JS and Android FCM so ping/pong failures are easier to diagnose.
- Example iOS `CFBundleVersion` bumped to 15.

### Notes for integrators

- No breaking public API changes. `flushPendingCustomEvents` is newly exported; you do not need to call it if you already use `OnUserLogin`.
- Keep calling `readCredentialsForEnvironment` → `pushappAuth` → `initSdk` on every cold start, then login/link so queued events can flush.
