# Using Metafields

Metafields are extra data attached to Shopify resources -- a product, a collection, or your store. You read them inside a block with the hooks below. They all load asynchronously, so a value is `undefined` until it arrives -- always optional-chain.

## Which hook to use

| Metafields on... | Hook | Import from |
|---|---|---|
| a **product** | `useMultipleMetafields(handle, fields)` | `@gauntlet/state` |
| a **collection** | `useCollectionMetafields(id, fields)` | `@gauntlet/state` |
| the **store** (shop) | `useShopifyQuery(query)` | `@gauntlet/state` |

`fields` is a list of `{ namespace, key }`. There is no hook for store-level metafields -- for those you write a small Storefront query (last example).

## Product metafields

```typescript
import React from 'react'
import { View, Text } from 'react-native'
import { BaseBlockProps } from '@gauntlet/types'
import { useBlock, useMultipleMetafields } from '@gauntlet/state'
import { useBlockSettings } from '@gauntlet/components/style-utils'

export function ProductCare({
  screenId,
  componentId,
  instanceId,
  productHandle,
}: BaseBlockProps & { productHandle: string }) {
  const block = useBlock(screenId, componentId, instanceId)
  const settings = useBlockSettings(block)

  const metafields = useMultipleMetafields(productHandle, [
    { namespace: 'custom', key: 'care_instructions' }, // plain text
    { namespace: 'custom', key: 'specs' }, // JSON
  ])

  // This hook gives you the VALUE directly, keyed as metafields[namespace][key]
  const care = metafields?.custom?.care_instructions
  const specsRaw = metafields?.custom?.specs

  if (!care) return null // not loaded yet, or not set on the product

  let specs: Array<{ label: string; value: string }> = []
  try {
    specs = JSON.parse(specsRaw ?? '[]')
  } catch {}

  return (
    <View style={settings?.style?.root}>
      <Text>{care}</Text>
      {specs.map((s) => (
        <Text key={s.label}>
          {s.label}: {s.value}
        </Text>
      ))}
    </View>
  )
}
```

The product handle comes from your block props (or `useProductByHandle`). If a namespace contains a dash, it becomes an underscore in the result -- `my-fields` is read as `metafields.my_fields`.

> The block scaffolding (`useBlock`, `useBlockSettings`, imports) is the same below -- only the metafield part changes.

## Collection metafields

Same shape, but you get the metafield **node** back, so read `.value` off it.

```typescript
import { useCollectionMetafields } from '@gauntlet/state'

const collectionId = settings?.source?.collectionId

const metafields = useCollectionMetafields(collectionId, [
  { namespace: 'custom', key: 'footer_text' },
])

const value = metafields?.custom?.footer_text?.value // note the .value
if (!value) return null
```

Only have the collection handle? Use `useCollectionMetafieldsByHandle(handle, fields)` -- same arguments and same return shape.

## Store (shop) metafields

No hook covers these. Write a Storefront query against `shop`, alias each metafield, and run it with `useShopifyQuery`.

```typescript
import { useShopifyQuery } from '@gauntlet/state'

const SHOP_QUERY = `query {
  shop {
    announcement: metafield(namespace: "custom", key: "announcement") { value }
    shipping: metafield(namespace: "custom", key: "shipping_info") { value }
  }
}`

interface ShopResult {
  shop: {
    announcement: { value: string } | null
    shipping: { value: string } | null
  }
}

const data = useShopifyQuery<ShopResult>(SHOP_QUERY)

const announcement = data?.shop?.announcement?.value
if (!announcement) return null // null until the query resolves
```

`useShopifyQuery` returns the data or `null` (no separate loading/error flags) and runs against the Storefront API. It takes no variables argument -- interpolate any values straight into the query string.

## Consuming values

- A metafield `value` is **always a string**. JSON-typed metafields come back as a stringified blob -- `JSON.parse` them inside a `try/catch`. Numbers arrive as strings too.
- `useMultipleMetafields` hands you the value directly; `useCollectionMetafields` and the shop query hand you a node -- read `.value`.
- To resolve a linked object instead of a raw string, add `reference` to the field: `{ namespace, key, reference: 'image' }` (also `'product'`, `'variant'`). The result is the referenced object, not a string.
- Everything loads asynchronously -- optional-chain every access and render nothing (or a fallback) until the value is present.

## Guidelines

- Always optional-chain and provide a fallback -- metafields are `undefined` on first render.
- Wrap every `JSON.parse` in `try/catch`; merchant data is not guaranteed to be valid.
- Match the namespace and key exactly to what is configured in Shopify (mind the dash-to-underscore rule for product results).
- Prefer a metafield over a hardcoded value when the content is store-specific -- it lets store owners edit it without a code change.
