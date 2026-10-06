# PushApp Events + Profile Full Fix — QA Matrix (2026-09-21)

Verification gates after implementing the full-fix plan (profile phone, empty `items`, push first-grant, checkout WebView bridge).

**Do not edit the plan file.** Verify with unit tests + Metro `/v1/event` bodies + PushApp Event Analytics.

## Metro / PushApp gates

| Gate | Pass criteria |
|------|----------------|
| Profile PUT phones | After OTP login, Metro shows `PUT /customer/profile` with `phones: [{ phone: "+91…" }]` when OTP phone was used |
| Profile updates | Name/email change on account triggers a new PUT (not permanently skipped by poisoned snapshot) |
| `OnUserLogin` LOG | After `/device/link`, Event Analytics shows `OnUserLogin` with `user_id` (awaited dual-send) |
| Logout `user_id` | `OnUserLogOut` / `logout` include `user_id` when a linked id exists |
| Commerce `items[]` | POST `event_data.items` is an **array of objects** with Excel keys — never `items: {}` |
| Push first grant | Cold start on already-granted device emits `push_notification_subscribed` once (`push_enabled: true`) |
| Search commit | Submitting a search term emits `search` + `search_term`; suggestions screen alone is `screen_view` |
| `app_open` | Cold start after `startMehery` POSTs `app_open` (not only SDK `OnAppOpen`) |
| Checkout funnel | Cart Checkout → `begin_checkout`; WebView shipping/coupon pixel → `add_shipping_info` / coupon events when exposed; thank-you / `checkout_completed` → `purchase` with cart-snapshot items |

## CSV row status (App Brew host)

| Event | Expected after fix | Notes |
|-------|-------------------|--------|
| OnUserLogin | Captured (LOG) | Host dual-send after link; mark-after-success |
| updateUserProfile | Captured + PUT | OTP phone merged; snapshot = sent body |
| OnUserLogOut | Captured with `user_id` | Skip empty OnUserLogOut if id unresolved |
| OnPageOpen / Close | `page_open` / `page_closed` | SDK intentional names |
| app_install | Pass | version / sizeWidth / sizeHeight |
| screen_view | Pass | |
| push_notification_subscribed / unsubscribed | Pass | First-ever grant + transitions |
| login / logout | Pass | |
| signup | Only for `new_customer` | Do not invent for returning OTP |
| view_item / cart / wishlist / notify | Pass with rich `items[]` | Skip empty/`{}` items |
| search | Pass on commit | Suggestions = screen_view only |
| view_cart | Pass (cart-level; items when cart non-empty) | |
| begin_checkout | Pass on Checkout CTA + pixel `checkout_started` | |
| add_shipping_info | Pass when pixel/shipping path fires | Cart snapshot fallback |
| apply_coupon / remove_coupon | Pass native cart + WebView bridge | |
| purchase | Pass WebView thank-you / `checkout_completed` | Snapshot merge |
| refund | In-app cancel only | Admin refunds out of scope |
| app_open | Pass host lifecycle | Filter Event Analytics for `app_open` |

## Unit tests to run

```bash
cd "/Users/neil/Desktop/APP Brew"
yarn jest src/mehery/__tests__/ --no-coverage

cd "/Users/neil/Desktop/APP Brew/vendor/react-native-mehery-event-sender"
npm test -- --testPathPattern=profileSnapshot --no-coverage
```

## Explicitly out of scope

- PushApp dashboard UI flattening nested `items[]` when Metro body is already correct
- Inventing signup for returning users
- Admin/Shopify-admin refunds
- Editing `Desktop/msdk/**`
