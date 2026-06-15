# Building Trackers

Trackers let you capture analytics events from the app and forward them to your own service. Every user action -- add to cart, purchase, page view, search -- fires an event that your tracker receives.

Use cases:
- Send events to your own analytics API
- Forward purchase data to your attribution platform
- Track checkout funnel metrics on your dashboard
- Sync app events with your backend for reporting

## How it works

The app broadcasts events to all registered trackers. Your tracker extends `AnalyticsTrackerV2`, which handles event queuing, initialization lifecycle, and filtering. You implement the methods that send data to your service.

## Building a tracker

```typescript
// src/my-tracker.ts
import { AnalyticsTrackerV2 } from '@gauntlet/analytics'
import { AnalyticsEvent, AnalyticsEventParams, AnalyticsPayload, AppConfig } from '@gauntlet/types'

export class MyTracker extends AnalyticsTrackerV2 {

  async initTracker(config?: AppConfig) {
    // Read your config
    const myConfig = config?.integrations?.['my-service']

    // Initialize your SDK or set up your API client
    // MyApi.init(myConfig.apiKey)

    // Required: declare which events your tracker receives.
    // If you leave this unset, you silently get nothing
    // (base default is an empty list = deny-all).
    // Use Object.values(AnalyticsEvent) for all events.
    this.eventsWhitelist = [
      AnalyticsEvent.ADD_TO_CART,
      AnalyticsEvent.REMOVE_FROM_CART,
      AnalyticsEvent.PURCHASE,
      AnalyticsEvent.VIEW_ITEM,
      AnalyticsEvent.SCREEN_VIEW,
      AnalyticsEvent.SEARCH,
    ]

    // Required: declare which payload keys to forward.
    // Unset = empty payload reaches sendEvent.
    // Use Object.values(AnalyticsEventParams) for full payload.
    this.paramsWhitelist = Object.values(AnalyticsEventParams)

    // Rename events to match your API (optional)
    this.eventsMapper = {
      [AnalyticsEvent.ADD_TO_CART]: 'item_added',
      [AnalyticsEvent.PURCHASE]: 'order_completed',
    }

    // Rename payload keys to match your API (optional)
    this.paramsMapper = {
      'item_id': 'product_id',
      'item_name': 'product_title',
    }
  }

  async sendEvent(event?: AnalyticsEvent, payload?: AnalyticsPayload) {
    // Called for every event (after filtering and mapping)
    // Send to your API
    await fetch('https://api.yourservice.com/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, payload, timestamp: Date.now() }),
    })
  }

  async sendScreenView(screenName?: string) {
    // Called on every screen navigation
    await fetch('https://api.yourservice.com/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ screen: screenName }),
    })
  }

  async setUserDetails(user?: any) {
    // Called when a user signs in or profile updates
    // user contains: email, phone, firstName, lastName
    await fetch('https://api.yourservice.com/identify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user?.email, phone: user?.phone }),
    })
  }
}
```

## Events your tracker receives

| Event | When | Payload |
|-------|------|---------|
| `ADD_TO_CART` | Item added to cart | `{ value, currency, items[] }` |
| `REMOVE_FROM_CART` | Item removed from cart | `{ value, currency, items[] }` |
| `VIEW_ITEM` | Product page viewed | `{ items[] }` |
| `VIEW_ITEM_LIST` | Product list/grid viewed | `{ items[] }` |
| `VIEW_CART` | Cart screen viewed | `{ value, items[] }` |
| `BEGIN_CHECKOUT` | Checkout started | `{ value, currency, items[] }` |
| `PURCHASE` | Order completed | `{ value, currency, transaction_id, shipping, discount, coupon, items[] }` |
| `SEARCH` | Search performed | `{ search_term }` |
| `SCREEN_VIEW` | Any screen viewed | `{ screen_name }` |
| `ADD_TO_WISHLIST` | Item wishlisted | `{ items[] }` |
| `REMOVE_FROM_WISHLIST` | Item removed from wishlist | `{ items[] }` |
| `LOGIN` | User signed in | -- |
| `SIGNUP` | User registered | -- |
| `SELECT_ITEM` | Product tapped in a list | `{ items[] }` |
| `APPLY_COUPON` | Coupon code applied | `{ coupon }` |
| `REMOVE_COUPON` | Coupon code removed | `{ coupon }` |

### Item payload shape

Events that include `items[]` use this structure:

```typescript
{
  item_id: '123',
  item_name: 'T-Shirt',
  price: 49.99,
  quantity: 2,
  variant_id: '456',
  sku: 'TSH-BLK-M',
  handle: 't-shirt-black',
  item_brand: 'BrandName',
  item_category: 'Apparel',
}
```

## Registering

In `src/app/App.tsx`:

```typescript
import { AnalyticsProvider } from '@gauntlet/analytics'
import { MyTracker } from 'my-integration'

// In initApp():
AnalyticsProvider.getInstance().addTracker(new MyTracker())
```

## Integration config

Your tracker reads its config from `config.integrations['my-service']`. Provide a sample config for the dashboard:
Appbrew team can populate your tracker config for the store. 

```json
{
  "integrations": {
    "my-service": {
      "apiKey": "...",
      "enabled": true
    }
  }
}
```
