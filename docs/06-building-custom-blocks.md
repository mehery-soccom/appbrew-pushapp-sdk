# Building Custom Blocks

Custom blocks are config-driven React components. You define a config schema (source, style, options), the Appbrew dashboard populates it, and your block renders based on that config.

## Block component interface

Every block receives three props:

```typescript
import { BaseBlockProps } from '@gauntlet/types'

export function MyBlock({ componentId, instanceId, screenId }: BaseBlockProps) {
  // ...
}
```

## Config schema

Every block's behavior is driven by three config sections:

| Section | Purpose |
|---------|---------|
| `source` | Data -- what the block displays (text, URLs, IDs, counts) |
| `style` | Visual -- colors, spacing, typography, layout |
| `options` | Behavior -- feature flags, toggles, thresholds |

When building a block, start by defining its config schema. This tells the Appbrew dashboard team what fields your block expects.

## Example: Promo Banner block

### 1. Define the config schema

```json
{
  "componentId": "promo-banner",
  "instanceId": "promo-banner-1",
  "source": {
    "title": "Summer Sale",
    "subtitle": "Up to 50% off on selected items",
    "imageUrl": "https://cdn.example.com/banner.jpg",
    "link": { "kind": "screen", "value": "collection-summer" },
    "badgeText": "NEW"
  },
  "style": {
    "root": { "backgroundColor": "#fff8e1", "borderRadius": 12, "margin": 16 },
    "title": { "fontSize": 20, "fontWeight": "700", "color": "#1a1a1a" },
    "subtitle": { "fontSize": 14, "color": "#666666" },
    "image": { "aspectRatio": 2.0, "resizeMode": "cover" },
    "badge": { "backgroundColor": "#ff5722", "color": "#ffffff" }
  },
  "options": {
    "showBadge": true,
    "autoLink": true
  }
}
```

### 2. Build the block

Read config values via `useBlockSettings` and render accordingly:

```typescript
// src/blocks/promo-banner.tsx
import React from 'react'
import { View, Text, Image, Pressable, StyleSheet } from 'react-native'
import { BaseBlockProps } from '@gauntlet/types'
import { useBlock } from '@gauntlet/state'
import { useBlockSettings } from '@gauntlet/components/style-utils'

export function PromoBanner({ componentId, instanceId, screenId }: BaseBlockProps) {
  const block = useBlock(screenId, componentId, instanceId)
  const settings = useBlockSettings(block)

  // Source -- data
  const title = settings?.source?.title ?? ''
  const subtitle = settings?.source?.subtitle ?? ''
  const imageUrl = settings?.source?.imageUrl
  const badgeText = settings?.source?.badgeText

  // Style -- from config
  const rootStyle = settings?.style?.root ?? {}
  const titleStyle = settings?.style?.title ?? {}
  const subtitleStyle = settings?.style?.subtitle ?? {}
  const imageStyle = settings?.style?.image ?? {}
  const badgeStyle = settings?.style?.badge ?? {}

  // Options -- behavior
  const showBadge = settings?.options?.showBadge ?? false

  return (
    <View style={[styles.container, rootStyle]}>
      {imageUrl && (
        <Image source={{ uri: imageUrl }} style={[styles.image, imageStyle]} />
      )}
      {showBadge && badgeText && (
        <View style={[styles.badge, { backgroundColor: badgeStyle.backgroundColor }]}>
          <Text style={{ color: badgeStyle.color, fontSize: 12 }}>{badgeText}</Text>
        </View>
      )}
      <Text style={[styles.title, titleStyle]}>{title}</Text>
      {subtitle && <Text style={[styles.subtitle, subtitleStyle]}>{subtitle}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  image: { width: '100%' },
  title: { paddingHorizontal: 12, paddingTop: 12 },
  subtitle: { paddingHorizontal: 12, paddingBottom: 12 },
  badge: { position: 'absolute', top: 8, right: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
})
```

### 3. Register the block

In `src/app/register-blocks.ts`:

```typescript
import { PromoBanner } from 'my-integration'

export function registerBlocks() {
  const r = blockRegistry
  registerCommonBlocks(r)
  r.set('promo-banner', PromoBanner)
}
```

### 4. Document your config schema

Every block you build must have a documented config schema. This is used by:

- **The Appbrew team** to configure your block in the dashboard
- **Store owners** who can update the config directly from the Appbrew app installed in their Shopify store
- **You** as a reference when maintaining or extending the block

The better your schema docs, the easier it is for anyone to update content, styling, or behavior without touching code.

**Sample config** (ready to paste into the dashboard):

```json
{
  "componentId": "promo-banner",
  "instanceId": "promo-banner-1",
  "source": {
    "title": "Summer Sale",
    "subtitle": "Up to 50% off on selected items",
    "imageUrl": "https://cdn.example.com/banner.jpg",
    "link": { "kind": "screen", "value": "collection-summer" },
    "badgeText": "NEW"
  },
  "style": {
    "root": { "backgroundColor": "#fff8e1", "borderRadius": 12, "margin": 16 },
    "title": { "fontSize": 20, "fontWeight": "700", "color": "#1a1a1a" },
    "subtitle": { "fontSize": 14, "color": "#666666" },
    "image": { "aspectRatio": 2.0, "resizeMode": "cover" },
    "badge": { "backgroundColor": "#ff5722", "color": "#ffffff" }
  },
  "options": {
    "showBadge": true,
    "autoLink": true
  }
}
```

## Guidelines

- Always provide sensible defaults for all config values using `??`
- Document every field your block reads from config -- include types, defaults, and descriptions
- Include a full sample config JSON that can be pasted directly into the dashboard
- Keep blocks purely config-driven -- all data should come through `source`, all visuals through `style`, all behavior through `options`
- Test with different config values to ensure your block handles missing or unexpected data gracefully
