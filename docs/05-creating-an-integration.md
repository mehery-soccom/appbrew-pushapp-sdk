# Creating an Integration

## Scaffold

```bash
pnpm create-integration my-integration
```

This creates:

```
packages/my-integration/
  package.json            # Package metadata and peer dependencies
  src/
    index.ts              # Entry point -- export everything from here
```

Install the local package:

```bash
pnpm install
```

## How it works

Your integration is a regular package in `packages/`. pnpm workspace links it locally so you can import from it by name during development. After publishing to npm, the consumer app installs and imports it the same way -- a normal npm dependency.

```typescript
// During local dev and after publishing -- same import
import { MyCheckoutBlock } from 'my-integration'
```

## Integration types

There are three types of integrations you can build. Most packages combine more than one.

### 1. Custom Blocks

UI components that render on screens. Register them in the block registry and the Appbrew dashboard can place them on any screen.

See [Building Custom Blocks](./06-building-custom-blocks.md).

### 2. Analytics Trackers

Forward analytics events (add to cart, purchase, page view, etc.) to your tracking service.

See [Building Trackers](./07-building-trackers.md).

### 3. Checkout Integrations

Replace the default payment screen with your own checkout experience (WebView or native SDK).

See [Building a Checkout Integration](./09-building-checkout-integration.md).

## Wiring into the app

After creating your integration, you typically wire it into `src/app/App.tsx`:

Register blocks in `src/app/register-blocks.ts`:

```typescript
import { MyBlock } from 'my-integration'

blockRegistry.set('my-custom-block', MyBlock)
```

## Package structure requirements

For your integration to work with Appbrew apps, it must:

1. Ship raw TypeScript source in `src/` (Metro compiles it at build time)
2. Set `main` to `src/index.ts` in `package.json`
3. List `src/` in the `files` field of `package.json`
4. Declare `@gauntlet/brewery` as a peer dependency

## Next steps

- [Testing and Publishing](./10-testing-and-publishing.md)
- [Connecting Your Store](./11-connecting-your-store.md)
