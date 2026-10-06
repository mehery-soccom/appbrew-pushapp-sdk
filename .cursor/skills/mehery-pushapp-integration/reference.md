# Mehery PushApp — reference

## Environment / credential matrix

| `initSdk` env | Host | iOS Info.plist | Android strings |
|---|---|---|---|
| `false` | `pushapp.ai` | `MeheryProdAppId` / `MeheryProdAppKey` | `mehery_prod_app_id` / `mehery_prod_app_key` |
| `true` | `pushapp.net.in` | `MeherySandboxAppId` / `MeherySandboxAppKey` | `mehery_sandbox_app_id` / `mehery_sandbox_app_key` |
| `'development'` | `pushapp.co.in` | `MeheryDevAppId` / `MeheryDevAppKey` | `mehery_dev_app_id` / `mehery_dev_app_key` |

Channel id format: `"<tenant>_<channel>"` (second arg to `initSdk`).

## Public API (host usage)

Auth/init: `readCredentialsForEnvironment`, `pushappAuth`, `initSdk`, `waitForSdkReady`  
Identity: `OnUserLogin`, `OnUserLogOut`, `updateUserProfile`

### Canonical customer profile (`PUT /v1/customer/profile`)

Call shape (Mehery docs):

```ts
await updateUserProfile(
  { name: 'Jane Doe', email: 'jane@example.com', city: 'Mumbai' },
  { segment: 'premium', plan: 'enterprise' }
)
```

Wire PUT body (SDK `buildProfileApiPayload`). Host passes flat `{ name?, phones?, email? }`; omit `source` / `code` / `rmCode` unless already known:

```json
{
  "name": "Jane Doe",
  "phones": [{ "phone": "+919876543210" }],
  "additionalInfo": {
    "email": "jane@example.com",
    "city": "Mumbai"
  }
}
```

- Host never sends top-level `emails` or `alt_emails`; email is scalar in `additionalInfo` after SDK mapping.
- Name on the wire is a **plain string** (not `{ formattedName }`).
Events: `sendCustomEvent`, `flushPendingCustomEvents`, `OnPageOpen`, `OnPageClose`, `OnAppOpen`, `OnAppLaunch`  
Push: `registerFcmBackgroundHandler`, `ensureAndroidNotificationPermission`, `triggerCarouselNotification`, `setNotificationUrlHandler`, `configureNotificationLinkRewrites`, `openNotificationLink`  
UI: `PollOverlayProvider`, optional `InlinePollContainer` / `TooltipPollContainer`

## GA4 / Excel → `sendCustomEvent` map

All Firebase = Yes. Dual-send with identical event name + properties:

| Event | Properties |
|---|---|
| `app_install` | `version`, `sizeWidth`, `sizeHeight` (also accept `app_install_ios` / `app_install_android`) |
| `screen_view` | `screen_name`, `screen_class` |
| `push_notification_subscribed` | `push_enabled` |
| `push_notification_unsubscribed` | `push_enabled` |
| `login` | `method` |
| `signup` | `method` |
| `logout` | *(none)* |
| `view_item` | `currency`, `value`, `items[]` (`item_id`, `handle`, `item_name`, `item_variant`, `price`, `original_price`, `discount`, `url`, `sku`, `item_category`, `item_brand`, `img_url`) |
| `view_item_list` | `item_list_id`, `handle`, `item_list_name`, `url` |
| `search` | `search_term` |
| `add_to_cart` | `currency`, `value`, `cart_id`, `shopify_id`, `items[]` (incl. `quantity`, `sku`, …) |
| `remove_from_cart` | `currency`, `value`, `cart_id`, `shopify_id`, `items[]` |
| `view_cart` | `url`, `value`, `checkout_token`, `sub_total`, `discount`, `currency`, `coupon`, `cart_id`, `shopify_id`, `items[]` |
| `add_to_wishlist` | `currency`, `value`, `items[]` (`item_id`, `handle`, `item_name`, `item_variant`, `price`, `original_price`, `discount`, `url`, `sku`, `item_category`, `item_brand`, `img_url`) |
| `remove_from_wishlist` | same as `add_to_wishlist` |
| `notify_back_in_stock` | same as `add_to_wishlist` |
| `begin_checkout` | cart-like set + `cart_id`, `shopify_id` |
| `add_shipping_info` | cart-like set + `cart_id`, `shopify_id` |
| `apply_coupon` | `coupon`, `isApplicable` |
| `remove_coupon` | `coupon` |
| `purchase` | `transaction_id`, `shopify_order_id`, `cart_id`, `shopify_id`, `url`, `value`, `checkout_token`, `sub_total`, `discount`, `currency`, `coupon`, `items[]` |
| `refund` | `reason`, `transaction_id`, `shopify_order_id`, `shopify_id`, `value`, `currency` |

Call `sendCustomEvent(name, data, { eventType: 'LOG' })` from `MeheryTracker.sendEvent` (host default is LOG so Event Analytics POSTs without `/device/link` and without poll scheduling). Host `enrichEventData` injects `shopify_id` on every custom event and `cart_id` when a Shopify cart exists.

### Dummy checkout (host)

- Blocks: `payment-web-view-v4` / `shopify-customer-payment-webview` → `DummyCheckoutScreen`
- Orders: MMKV `mehery_local_orders`; Account **Demo orders** for transit + refund
- QA matrix: `docs/superpowers/plans/2026-09-24-dummy-checkout-qa-matrix.md`

## Android FCM pitfalls

- Top-level FCM `notification` block + background = OS stock tray; Mehery service skipped.
- Use **data-only** + `android.priority: HIGH` for rich background UI.
- Remove `io.invertase.firebase.messaging.ReactNativeFirebaseMessagingService` with `tools:node="remove"`.
- Verify: `adb logcat -s MyFirebaseMessagingService:I`

### Carousel data example

```json
{
  "title": "New arrivals",
  "body": "Swipe looks",
  "imageUrls": "[\"https://example.com/1.jpg\",\"https://example.com/2.jpg\"]",
  "notification_url": "https://shop.example/collection",
  "title1": "Shop",
  "url1": "https://shop.example/collection",
  "action1": "SHOP"
}
```

Image list keys: `imageUrls`, `image_urls`, `carousel_images`, `images`, or `image1`…`imageN` (max 4). Live tray needs `message1`+`message2`+`message3`.

## iOS categories

3-button: `THREE_BUTTON_CATEGORY`, `THREE_CAROUSEL_CATEGORY`, `THREE_CONFIRMATION_CATEGORY`, `THREE_RESPONSE_CATEGORY`, `THREE_SUBSCRIPTION_CATEGORY`, `THREE_TRANSACTION_CATEGORY`, `THREE_CONTENT_CATEGORY`, `THREE_CHECKOUT_CATEGORY`, `THREE_FORM_ACTION_CATEGORY`, `THREE_DESTRUCTIVE_ACTION_CATEGORY`, `THREE_CONTACT_CATEGORY`

2-button: `CAROUSEL_CATEGORY`, `CONFIRMATION_CATEGORY`, `RESPONSE_CATEGORY`, `SUBSCRIPTION_CATEGORY`, `TRANSACTION_CATEGORY`, `CONTENT_CATEGORY`, `CHECKOUT_CATEGORY`, `FORM_ACTION_CATEGORY`, `DESTRUCTIVE_ACTION_CATEGORY`, `CONTACT_CATEGORY`

Silent ping payload: `type: silent_daily_ping`. Live Activity: `activity_id` + live-looking payload.

## SDK sources (read-only)

- README: `Desktop/msdk/react-native-pushapp-appbrew/README.md`
- Example App: `.../example/src/App.tsx`
- Example iOS: `.../example/ios/{ImageServiceExtension,ImagePreviewExtension,DeliveryActivity,MeheryEventSenderExample}`
