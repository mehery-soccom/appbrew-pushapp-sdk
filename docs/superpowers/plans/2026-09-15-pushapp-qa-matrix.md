# PushApp QA — Events Pass/Fail (no TestFlight)

**Date:** 2026-09-17 (refresh after identity/profile/commerce fix pass)  
**Scope:** Host event dual-send / payloads only. No archive or TestFlight upload.  
**Verification:** Unit tests (`yarn jest src/mehery/__tests__` — 69 passed) + code-path audit.

| Excel / GA4 event | Status | Notes |
|-------------------|--------|-------|
| `app_install` | **Pass** | Host `buildAppInstallPayload` includes `version`, `sizeWidth`, `sizeHeight` (+ `app_version`, `platform`). Sent as LOG after register. |
| `app_launch` / `app_open` | **Pass** | Host lifecycle plan after init (LOG names `app_launch` / `app_open`, not `OnApp*`). SDK `OnAppOpen` only after `/device/link`. |
| `screen_view` | **Pass** | `MeheryTracker.sendScreenView` → LOG; also drives `OnPageOpen` / `OnPageClose`. |
| `OnPageOpen` / page open | **Pass** | Wired from `sendScreenView` (nav screen titles). |
| `OnUserLogin` | **Pass** | After successful new link, host dual-sends LOG `OnUserLogin` + `{ user_id }` (device link alone is not Event Analytics). |
| `login` | **Pass** | Gauntlet `AnalyticsEvent.LOGIN` → tracker `sendEvent` → LOG with `method`. Distinct from SDK `OnAppOpen`. |
| `signup` | **Pass** | Same tracker path when fired. |
| `logout` / `OnUserLogOut` | **Pass** | `SIGNOUT_SUCCESS` resolves `user_id` from `linkedUserId` / AsyncStorage (not cleared Zustand), dual-sends LOG, then SDK delink. |
| `updateUserProfile` | **Pass** | PUT `/v1/customer/profile`; dual-send LOG **only after non-skipped PUT**. Benign skips no longer spam Event Analytics. Dedupe keys `name\|email\|phone`. |
| `search` | **Pass** | `gotoLink` wrap on search commit + `search_collection` loading + tracker. Suggestions-only focus remains `screen_view`. |
| `view_item` / `view_item_list` / `notify_back_in_stock` | **Pass** | Tracker rebuilds `items[]` via `buildExcelItem` + catalog when idle; notify press dual-send via `notifyPressEvents`. |
| `add_to_cart` / `remove_from_cart` | **Pass** | Shared `itemPayload` builders; press tracking uses LOG. |
| `add_to_wishlist` / `remove_from_wishlist` | **Pass** | `wishlistPayloadFromProduct` via `buildExcelItem`; press tracking LOG. |
| `push_notification_subscribed` / `unsubscribed` | **Pass** | Baseline without emit; first denied↔granted transition (incl. post-prompt 5s) emits LOG `{ push_enabled }`. |
| `begin_checkout` | **Pass** | Gauntlet cart checkout hook → `AnalyticsEvent.BEGIN_CHECKOUT` → tracker whitelist LOG. |
| `add_shipping_info` / web coupons / `purchase` | **Partial** | Fire when native/WebView thank-you paths emit; shipping/coupons inside Checkout WebView need bridge — do not invent. |
| `refund` | **Pass (in-app)** | Gauntlet `cancelOrder` → tracker; admin refunds out of app scope. |
| Dual-send event type | **Pass** | Host `sendMeheryCustomEvent` defaults to **LOG** (not INTERACTIVE). |
| Daily session keep-alive | **Pass** | Host renews Shopify CAT on foreground + before `getUserDetails`. |
| Account Inline / Tooltip placeholders | **Pass** | Env-configurable ids; campaigns must match. |
| Device count on name edit | **Pass (hardened)** | No logout on idle-empty profile refetch; no `/device/link` when already linked; profile PUT never sends `devices`. |

## Manual Metro (optional, simulator OK)

Confirm `/v1/event` names after: cold start (`app_install` / `app_open`), ATC, committed search, name edit (one `updateUserProfile`), login (`OnUserLogin`), logout (`user_id`), tab navigate. **Do not** upload TestFlight for this pass.
