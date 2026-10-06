# Dummy checkout + cart ID QA matrix (2026-09-24)

Screen-by-screen checklist for Shopify cart + host dummy checkout.

## ID contract

| Property | Source |
|----------|--------|
| `cart_id` | Shopify Storefront cart id (`cart.data.id`) |
| `shopify_id` | Shop domain via `resolveShopDomain()` (every Mehery custom event) |
| `shopify_order_id` | `gid://shopify/Order/demo_N` allocated at Place order |
| `transaction_id` | `demo_txn_{ts}_{N}` (local order id) |

## Journey

| # | Screen / action | Expected Mehery events | Must-have properties |
|---|-----------------|------------------------|----------------------|
| 1 | Cold launch | `app_install` (once), `app_launch`, `app_open` | `shopify_id` |
| 2 | Home | `OnPageOpen(home)`, `screen_view` | `shopify_id` |
| 3 | PLP / collection | `view_item_list` | `shopify_id` |
| 4 | PDP | `view_item` | `shopify_id`, `items[]` |
| 5 | ATC | `add_to_cart` | `cart_id`, `shopify_id`, `currency`, `value`, `items[]` |
| 6 | Cart (navigate) | `view_cart` | `cart_id`, `shopify_id`, non-empty `items[]`, `url`/`checkout_token`/`sub_total` when Gauntlet provides |
| 7 | Cart qty ± | `add_to_cart` / `remove_from_cart` | `cart_id`, `shopify_id` |
| 8 | Checkout CTA → Dummy checkout mount | `begin_checkout` (Gauntlet + host; 1s dedupe) | `cart_id`, `shopify_id`, cart-like set |
| 9 | Shipping Continue | `add_shipping_info` | `cart_id`, `shopify_id` |
| 10 | Payment Continue | `add_payment_info` | `cart_id`, `shopify_id` |
| 11 | Apply / Remove coupon | `apply_coupon` / `remove_coupon` | `coupon`; apply has `isApplicable` |
| 12 | Place order | `purchase` | `transaction_id`, `shopify_order_id`, `cart_id`, `shopify_id`, `items[]` |
| 13 | Confirmation → Track | (UI) | Order visible in MMKV Demo orders |
| 14 | Advance status | (UI only) | Timeline: placed → confirmed → in_transit → out_for_delivery → delivered |
| 15 | Request refund | `refund` | `reason`, `transaction_id`, `shopify_order_id`, `shopify_id`, `value`, `currency` |
| 16 | Kill app / relaunch | — | Cart empty after purchase; Demo orders still listed on Account |

## Persistence

- **Cart:** Gauntlet Shopify cart id in MMKV key `cart` (unchanged).
- **Orders:** Host MMKV key `mehery_local_orders`.
- **Order seq:** `mehery_demo_shopify_order_seq`.

## Entry points

- Payment blocks → `DummyCheckoutScreen` (`payment-web-view-v4`, `shopify-customer-payment-webview`).
- Account → **Demo orders** accordion (`DemoOrdersEntry` on `profile-user-greeting`).

## Pass / fail notes

- [ ] Cart shows line items after ATC (not empty state).
- [ ] `__DEV__` checkout review shows `cart_id`.
- [ ] Charles / Event Analytics shows `shopify_id` on login and ATC.
- [ ] Purchase and refund share the same `shopify_order_id`.
