# Building a Checkout Integration

Checkout integrations replace the app's default payment screen with your own checkout experience. When a user taps "Checkout" on the cart screen, the app navigates to the payment screen and loads your block instead of the default Shopify WebView.

## How it works

```
┌──────────────────────┐     ┌──────────────────────────────┐
│                      │     │                              │
│    Cart Screen       │     │     Payment Screen           │
│  (platform-managed)  │────>│   your-checkout-block        │
│                      │     │   (WebView or native SDK)    │
│  User taps           │     │                              │
│  "Checkout"          │     │  On success / exit / error   │
│                      │     │           │                  │
└──────────────────────┘     └───────────┼──────────────────┘
                                         │
                                         ▼
                             ┌──────────────────────────────┐
                             │     Completion Flow          │
                             │  1. Mark checkout completed  │
                             │  2. Fire PURCHASE event      │
                             │  3. Set guest user details   │
                             │  4. Reset cart               │
                             │  5. Override back -> home    │
                             │  6. Trigger in-app review    │
                             │  7. Redirect user            │
                             └──────────────────────────────┘
```

Your package provides the block component. The Appbrew dashboard configures the payment screen to use it.

## Two implementation patterns

### WebView

You host a checkout web page. Your block renders a `react-native-webview` pointed at it. Communication happens via `window.ReactNativeWebView.postMessage`.

Best for: web-based payment flows, fast iteration, platforms with an existing web checkout.

### Native SDK

Your package ships a React Native component (backed by a native SDK). Your block renders it directly.

Best for: deeper native UX, Apple Pay / Google Pay integration, higher performance.

Both patterns are supported equally.

## Available data

Your checkout block can access the following data from the app:

| Path | Data |
|------|------|
| `config.data.integrations.shopify` | `domain`, `storefrontAccessToken` |
| `config.data.integrations['your-checkout']` | Your config (API keys, merchant ID, etc.) |
| `cart.data` | `id`, `lineItems[]`, `payment` (totals), `discountCodes[]`, `cartAttributes` |
| `user.data?.accessToken` | Customer token (if authenticated) |
| `analytics.getSessionId()` | Session ID |
| `analytics.getEventSourceUtmParams()` | UTM parameters for attribution |

All accessed via `useAppStore.getState()`.

## Folder structure

```
packages/my-checkout/src/
  index.ts                    # Public exports
  register.ts                 # Block registration helper
  provider.ts                 # Your backend API calls
  blocks/
    checkout-web-view.tsx     # Main checkout WebView block
```

## 1. Provider

Handles communication with your backend. Uses a singleton pattern.

```typescript
// provider.ts
import { useAppStore } from '@gauntlet/state'

export class MyCheckoutProvider {
  private static instance: MyCheckoutProvider

  static getInstance(): MyCheckoutProvider {
    if (!this.instance) this.instance = new MyCheckoutProvider()
    return this.instance
  }

  async fetchCheckoutUrl(): Promise<{ checkoutUrl: string; tokenId: string } | null> {
    try {
      const storeConfig = useAppStore.getState().config.data?.integrations
      const cartId = useAppStore.getState().cart.data.id
      const customerToken = useAppStore.getState().user.data?.accessToken

      const response = await fetch('https://api.yourservice.com/v1/create-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': storeConfig?.['my-checkout']?.apiKey,
        },
        body: JSON.stringify({
          cart_token: cartId,
          shop_url: storeConfig?.shopify?.domain,
          storefront_access_token: storeConfig?.shopify?.storefrontAccessToken,
          ...(customerToken ? { customer_token: customerToken } : {}),
        }),
      })
      const data = await response.json()
      return { checkoutUrl: data.checkoutUrl, tokenId: data.tokenId }
    } catch (error) {
      console.error('Failed to fetch checkout URL:', error)
      return null
    }
  }

  async fetchOrderDetails(tokenId: string): Promise<any> {
    try {
      const apiKey = useAppStore.getState().config.data?.integrations?.['my-checkout']?.apiKey
      const response = await fetch(`https://api.yourservice.com/v1/orders/${tokenId}`, {
        headers: { 'Authorization': apiKey },
      })
      return await response.json()
    } catch (error) {
      console.error('Failed to fetch order details:', error)
      return null
    }
  }
}
```

## 2. Checkout WebView block

The core of your integration -- a React Native component that loads your checkout in a WebView.

```typescript
// blocks/checkout-web-view.tsx
import { useBlockSettings } from '@gauntlet/components/style-utils'
import { isHomePage } from '@gauntlet/components/utils'
import {
  ScreenContext, useAppStore, useBlock, useDeviceDimensions,
  useLink, useSetOverrideBack,
} from '@gauntlet/state'
import { AnalyticsEvent, BaseBlockProps, IAnalyticsProvider } from '@gauntlet/types'
import React, { useState } from 'react'
import { Linking, Platform, View } from 'react-native'
import InAppReview from 'react-native-in-app-review'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import { MyCheckoutProvider } from '../provider'

export function MyCheckoutWebView(props: BaseBlockProps) {
  const block = useBlock(props.screenId, props.componentId, props.instanceId)
  const settings = useBlockSettings(block)
  const { gotoLink } = useLink()
  const setOverrideBack = useSetOverrideBack()
  const setCheckoutCompleted = useAppStore(s => s.checkout.setCheckoutCompleted)
  const webViewRef = React.useRef<WebView>(null)
  const [checkoutData, setCheckoutData] = useState<{
    checkoutUrl: string; tokenId: string
  } | null>(null)

  const shopifyDomain = useAppStore.getState().config.data?.integrations
    ?.shopify?.domain as string

  // ── A. Fetch checkout URL on mount ─────────────────────
  React.useEffect(() => {
    ;(async () => {
      const result = await MyCheckoutProvider.getInstance().fetchCheckoutUrl()
      if (!result?.checkoutUrl) {
        // Fallback to default Shopify checkout
        gotoLink({
          kind: 'screen',
          value: settings?.source?.backupCheckoutScreen ?? 'backup-checkout',
        })
        setOverrideBack('cart')
        return
      }
      setCheckoutData(result)
    })()
  }, [])

  // ── B. Checkout completion handler ─────────────────────
  const handleCheckoutCompleted = React.useCallback(async (payload: any) => {
    // 1. Mark completed
    setCheckoutCompleted(true)

    // 2. Fire PURCHASE analytics event
    const analytics = useAppStore.getState().modules.getModule<IAnalyticsProvider>('analytics')
    analytics?.sendEvent(AnalyticsEvent.PURCHASE, transformPayload(payload))

    // 3. Set guest user details for analytics
    if (!useAppStore.getState().user.isUserAuthenticated() && payload?.address) {
      analytics?.setUserDetails({
        phone: payload.address.phone,
        email: payload.address.email,
        firstName: payload.address.firstName,
        lastName: payload.address.lastName,
      })
    }

    // 4. Reset cart
    const routeParams = useAppStore.getState().route.current()?.params as any
    if (!routeParams?.buyNowCartId) {
      useAppStore.getState().cart.resetCart()
    }

    // 5. Override back button -> home
    setOverrideBack('home')

    // 6. Trigger in-app review (5s delay)
    if (InAppReview.isAvailable()) {
      setTimeout(() => InAppReview.RequestInAppReview().catch(console.error), 5000)
    }

    // 7. Redirect
    if (settings?.options?.redirectScreen) {
      gotoLink({ kind: 'screen', value: settings.options.redirectScreen })
    }
  }, [setCheckoutCompleted, gotoLink, setOverrideBack, settings])

  // ── C. WebView message handler ─────────────────────────
  const onMessage = React.useCallback((event: any) => {
    try {
      const { action, payload } = JSON.parse(event.nativeEvent.data)
      switch (action) {
        case 'orderSuccess':
          if (payload) handleCheckoutCompleted(payload)
          break
        case 'modalClosed':
          useAppStore.getState().route.back()
          break
        case 'checkoutDisabled':
          if (settings?.source?.backupCheckoutScreen) {
            gotoLink({ kind: 'screen', value: settings.source.backupCheckoutScreen })
          }
          break
      }
    } catch (e) {
      console.error('Error parsing WebView message:', e)
    }
  }, [handleCheckoutCompleted, settings, gotoLink])

  if (!checkoutData) return null

  // ── D. Render ──────────────────────────────────────────
  return (
    <WebView
      ref={webViewRef}
      source={{ uri: checkoutData.checkoutUrl }}
      javaScriptEnabled={true}
      domStorageEnabled={true}
      originWhitelist={['*']}
      onMessage={onMessage}
      onShouldStartLoadWithRequest={(e) => {
        // Payment apps (UPI, PhonePe, GPay) use custom URL schemes
        if (!e.url.startsWith('http')) {
          if (e.url.startsWith('about:')) return false
          Linking.openURL(e.url)
          return false
        }
        return true
      }}
      onLoadStart={(event) => {
        const url = event.nativeEvent.url
        if (url.includes('/cart')) {
          webViewRef.current?.stopLoading()
          gotoLink({ kind: 'screen', value: 'cart' })
        } else if (isHomePage(url, shopifyDomain)) {
          webViewRef.current?.stopLoading()
          gotoLink({ kind: 'screen', value: 'home' })
        }
      }}
    />
  )
}

// Maps your order payload to the platform's standard analytics format.
// All analytics integrations (Firebase, etc.) depend on this shape.
function transformPayload(payload: any) {
  try {
    if (!payload) return null
    return {
      value: Number(payload.totalPrice),
      shipping: Number(payload.shippingCost || 0),
      sub_total: Number(payload.subtotalPrice),
      currency: payload.currency,
      discount: Number(payload.totalDiscount || 0),
      coupon: payload.discountCode || '',
      transaction_id: payload.orderId || '',
      checkout_token: payload.cartToken || '',
      payment_method: payload.paymentMethod || '',
      items: (payload.lineItems || []).map((item: any) => ({
        item_id: String(item.productId),
        item_name: item.title,
        item_brand: item.vendor || '',
        item_category: item.productType || '',
        item_variant: String(item.variantId),
        price: Number(item.price),
        quantity: item.quantity,
        sku: item.sku || '',
        handle: item.handle || '',
      })),
    }
  } catch (error) {
    console.error('Error transforming payload:', error)
    return null
  }
}
```

Note: if your API returns prices in smallest currency unit (paise/cents), divide by 100 before mapping. The platform expects standard currency units (rupees/dollars).

## 3. Registration

```typescript
// register.ts
import { MyCheckoutWebView } from './blocks/checkout-web-view'

export function registerMyCheckoutBlocks(r: Map<string, any>) {
  r.set('my-checkout-web-view', MyCheckoutWebView)
}
```

```typescript
// index.ts
export { MyCheckoutProvider } from './provider'
export { registerMyCheckoutBlocks } from './register'
```

In the consumer app's `src/app/register-blocks.ts`:

```typescript
import { registerMyCheckoutBlocks } from 'my-checkout'

export function registerBlocks() {
  registerCommonBlocks(blockRegistry)
  registerMyCheckoutBlocks(blockRegistry)
}
```

## 4. Dashboard configuration

These changes are made in the Appbrew dashboard when integrating your checkout into an app.

### Payment screen

The payment screen has a default `payment-web-view` block. To use yours:

1. Deprecate the existing payment block by setting `deprecatedBy: "my-checkout-web-view"`. This hides it but keeps it for the backup screen.
2. Add your checkout block:

```json
{
  "componentId": "my-checkout-web-view",
  "instanceId": "my-checkout-web-view-1",
  "source": {
    "backupCheckoutScreen": "backup-checkout"
  },
  "options": {}
}
```

### Backup checkout screen

Create a new screen `backup-checkout` as fallback when your checkout URL fails to load. Duplicate the payment screen's layout but keep the original payment blocks active (not deprecated).

### Cart screen

Some cart blocks conflict with third-party checkout because your checkout handles address, coupons, and rewards on its own. Deprecate these (set `deprecatedBy: "my-checkout-web-view"`):

- `change-address` / `change-address-v2`
- `view-coupons` / `view-coupons-v2`
- `redeem-rewards` / `dynamic-redeem-coins`

Also on the cart footer (`checkout-bar`), set `enableBottomSheetCheckout` to `false`.

## 5. WebView communication

Your checkout page posts messages back to the app via:

```javascript
// Inside your checkout page (running in WebView)
window.ReactNativeWebView.postMessage(JSON.stringify({
  action: 'orderSuccess',
  payload: { /* order data */ }
}))
```

| Action | When | App behavior |
|--------|------|--------------|
| `orderSuccess` | Order placed | Runs completion flow (analytics, cart reset, redirect) |
| `modalClosed` | User exits checkout | Navigates back |
| `checkoutDisabled` | Your service can't load | Falls back to `backupCheckoutScreen` |

## 6. Block settings reference

Configured per-block in the dashboard, read via `useBlockSettings(block)`:

| Key | Type | Description |
|-----|------|-------------|
| `source.backupCheckoutScreen` | string | Fallback screen when checkout URL fails (usually `"backup-checkout"`) |
| `options.redirectScreen` | string | Screen to navigate to after successful purchase |
| `options.topOffset` | number | Pixel offset for WebView height calculation |
| `options.ignoreKeyboardHeight` | boolean | Skip keyboard height adjustment on Android |

## 7. Checklist

### Code

- [ ] Provider fetches checkout URL and order details from your backend
- [ ] Block falls back to `backupCheckoutScreen` when URL generation fails
- [ ] Non-HTTP URLs (UPI, deep links) opened via `Linking.openURL()`
- [ ] WebView intercepts `/cart` and home page URLs to prevent user getting stuck
- [ ] `transformPayload` maps your order data to the standard analytics format
- [ ] Prices are in standard currency units (not paise/cents)

### Checkout completion (all required)

- [ ] `setCheckoutCompleted(true)`
- [ ] `AnalyticsEvent.PURCHASE` fired with transformed payload
- [ ] Guest user details set on analytics provider
- [ ] Cart reset (skipped for Buy Now)
- [ ] Back button overridden to `'home'`
- [ ] In-app review triggered (5s delay)
- [ ] Redirect to `options.redirectScreen`

### Dashboard config

- [ ] Your block added to payment screen, default payment block deprecated
- [ ] Backup checkout screen created with original payment blocks
- [ ] Conflicting cart blocks deprecated
- [ ] Cart footer `enableBottomSheetCheckout` set to `false`
