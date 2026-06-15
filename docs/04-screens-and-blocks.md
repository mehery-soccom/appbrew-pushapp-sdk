# Screens and Blocks

## Screens

A screen is identified by a `screenId` (e.g., `home`, `cart`, `payment`) and contains an ordered list of blocks. The config defines which screens exist, what blocks they contain, and how they appear in navigation.

Screens can also have:
- A **header** (app bar configuration)
- **Authentication requirements** (signed-in only)
- **Modal behavior** (bottom-sheet presentation)
- **Style overrides** (background, insets)

## Blocks

Blocks are the building units of every screen. Each block in the config looks like this:

```json
{
  "componentId": "image-banner",
  "instanceId": "hero-banner-1",
  "source": {
    "item": {
      "src": "https://cdn.shopify.com/...",
      "link": { "kind": "screen", "value": "collection-123" }
    }
  },
  "style": {
    "image": { "aspectRatio": 1.5, "resizeMode": "cover" }
  },
  "options": {
    "roundness": 8
  }
}
```

- **componentId** -- which React component to render (looked up from the block registry)
- **instanceId** -- unique identifier for this block instance
- **source** -- the data/content for this block (images, text, product IDs, etc.)
- **style** -- visual styling (colors, spacing, typography)
- **options** -- behavioral flags (toggle features, offsets, selectors)

## How blocks render

When a screen loads, the app renders each block in order:

1. Check visibility rules (skip if hidden)
2. Render the component matching `componentId` with props `{ componentId, instanceId, screenId }`
3. The component reads its own `source`, `style`, and `options` from config

If a `componentId` is not registered, the block is skipped.

## Visibility

Blocks support conditional visibility via the `visibility` config property. A block can be hidden based on product tags, product type, or other rules. The app evaluates these rules before rendering.

## Custom blocks

You extend the app by registering new blocks in the block registry. See [Building Custom Blocks](./06-building-custom-blocks.md).
