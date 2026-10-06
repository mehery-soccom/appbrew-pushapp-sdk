import { productCardComponentsMap } from '@gauntlet/components/molecules/generic-product-card/cardV2'
import { DeleteFromWishlist } from '@gauntlet/components/molecules/product-components/delete-from-wishlist'
import { AddToWishlistV2 } from '@gauntlet/components/molecules/wishlist/add-to-wishlist-v2'
import { Icon } from '@gauntlet/icons'
import { Text } from '@gauntlet/components/atoms/text'
import { getBorderRadiusValue } from '@gauntlet/components/style-utils'
import {
  useAppStore,
  useBottomSheetModal,
  useUser,
  useWishlist,
} from '@gauntlet/state'
import * as React from 'react'
import { Pressable } from 'react-native'
import Toast from 'react-native-toast-message'
import { sendMeheryCustomEvent } from './sendCustomEvent'
import { wishlistPayloadFromProduct } from './wishlistPayload'
import { resolveShopDomain } from './shopDomain'

function currencyCode(): string | undefined {
  try {
    return useAppStore.getState().localization.data.selectedCountry?.currency
      ?.isoCode
  } catch {
    return undefined
  }
}

function emitWishlistCustomEvent(
  ga4Name: 'add_to_wishlist' | 'remove_from_wishlist',
  productData: any
): void {
  const payload = wishlistPayloadFromProduct(productData, {
    shopDomain: resolveShopDomain(),
    currency: currencyCode(),
  })
  if (!payload) {
    return
  }
  void sendMeheryCustomEvent(ga4Name, payload, 'LOG')
}

/**
 * Emit Excel wishlist events for store mutations (PDP / tags / wishlist bar
 * use AddToWishlist directly — not productCardComponentsMap).
 */
function emitWishlistForHandles(
  ga4Name: 'add_to_wishlist' | 'remove_from_wishlist',
  items: Array<{ handle?: string; variantId?: string }>
): void {
  for (const item of items) {
    const handle = item?.handle
    if (!handle) {
      continue
    }
    try {
      const entry = useAppStore.getState().products?.items?.[handle] as
        | { status?: string; data?: Record<string, unknown> }
        | undefined
      if (entry?.status !== 'idle' || !entry.data) {
        continue
      }
      emitWishlistCustomEvent(ga4Name, {
        ...entry.data,
        selectedVariantId:
          item.variantId ??
          entry.data.selectedVariantId ??
          entry.data.defaultVariantId,
      })
    } catch {
      /* ignore */
    }
  }
}

/**
 * Wrap wishlist store actions so every UI path (PDP heart, tags, bar, cards)
 * dual-sends the Excel payload. Card Tracked* also emits; sendCustomEvent
 * dedupes same item within 1s.
 */
function installWishlistStoreDualSend(): void {
  const state = useAppStore.getState() as {
    wishlist: {
      addItemsToWishlist: (
        items: Array<{ handle: string; variantId: string }>
      ) => Promise<unknown>
      removeItemFromWishlist: (
        items: Array<{ handle: string; variantId?: string }>
      ) => Promise<unknown>
    }
  }
  const originalAdd = state.wishlist.addItemsToWishlist.bind(state.wishlist)
  const originalRemove =
    state.wishlist.removeItemFromWishlist.bind(state.wishlist)

  useAppStore.setState((draft: any) => {
    draft.wishlist.addItemsToWishlist = async (
      items: Array<{ handle: string; variantId: string }>
    ) => {
      emitWishlistForHandles('add_to_wishlist', items ?? [])
      return originalAdd(items)
    }
    draft.wishlist.removeItemFromWishlist = async (
      items: Array<{ handle: string; variantId?: string }>
    ) => {
      emitWishlistForHandles('remove_from_wishlist', items ?? [])
      return originalRemove(items)
    }
  })
}

/**
 * Same UX as AddToWishlistV2, but:
 * - does not require onlineStoreUrl (v1 AddToWishlist silently no-ops without it)
 * - dual-sends PushApp add_to_wishlist / remove_from_wishlist via sendCustomEvent
 *
 * Product-card map passes `productData` (+ options); molecule API uses `product`.
 */
function TrackedAddToWishlist(props: any) {
  const product = props.productData ?? props.product
  const { style, options, testID } = props
  const title = props.title ?? options?.buttonTitle
  const iconId = props.iconId ?? options?.iconId
  const gotoLink = useAppStore((store) => store.route.gotoLink)
  const { openModal } = useBottomSheetModal()
  const { isUserAuthenticated } = useUser()
  const { addItemsToWishlist, removeItemFromWishlist, isPresentInWishlist } =
    useWishlist()

  const handle = product?.handle
  const isProductPresentInWishlist = handle
    ? isPresentInWishlist(handle)
    : false
  const variantId = product?.selectedVariantId ?? product?.defaultVariantId

  const handleWishlistPress = async () => {
    if (!product || !handle) {
      return
    }
    if (!isUserAuthenticated()) {
      openModal(`signin-modal`, { productHandle: handle })
      return
    }

    // Do NOT require onlineStoreUrl — headless catalogs often omit it.
    if (!product.id || !variantId) {
      console.warn(
        `[Mehery] Wishlist press skipped — product id: ${product.id}, variant id: ${variantId}`
      )
      return
    }

    const items = [{ handle, variantId }]

    if (isProductPresentInWishlist) {
      // Store wrap also emits; keep press emit for immediate rich payload.
      emitWishlistCustomEvent('remove_from_wishlist', product)
      removeItemFromWishlist(items)
        .then(() => {
          Toast.show({
            text1: 'Item removed from your wishlist',
            type: 'success',
            onPress: () => {
              gotoLink({ kind: 'screen', value: 'wishlist' })
            },
          })
        })
        .catch(() => {
          Toast.show({
            text1: 'An error occured while removing item from wishlist',
            type: 'error',
            onPress: () => {
              gotoLink({ kind: 'screen', value: 'wishlist' })
            },
          })
        })
      return
    }

    emitWishlistCustomEvent('add_to_wishlist', product)
    addItemsToWishlist(items)
      .then(() => {
        Toast.show({
          text1: 'Item added to your wishlist',
          type: 'success',
          onPress: () => {
            gotoLink({ kind: 'screen', value: 'wishlist' })
          },
        })
      })
      .catch(() => {
        Toast.show({
          text1: 'An error occured while adding item to wishlist',
          type: 'error',
          onPress: () => {
            gotoLink({ kind: 'screen', value: 'wishlist' })
          },
        })
      })
  }

  const resolvedStyle = React.useMemo(() => {
    const borderRadius = getBorderRadiusValue(style?.root)
    if (borderRadius !== undefined) {
      return {
        ...style,
        root: {
          ...style?.root,
          borderRadius,
        },
      }
    }
    return style
  }, [style])

  if (!product || !handle) {
    return null
  }

  return (
    <Pressable
      style={resolvedStyle?.root}
      hitSlop={20}
      onPress={handleWishlistPress}
      testID={testID}
      accessible={true}
    >
      <Icon
        iconId={iconId ?? 'heart'}
        height={17}
        width={17}
        {...style?.icon}
        fill={
          isProductPresentInWishlist
            ? style?.presentInWishlist?.fill
            : style?.absentFromWishlist?.fill
        }
        stroke={
          isProductPresentInWishlist
            ? style?.presentInWishlist?.stroke
            : style?.absentFromWishlist?.stroke
        }
      />
      {Boolean(title) && <Text style={style?.title}>{title}</Text>}
    </Pressable>
  )
}

function TrackedRemoveFromWishlist(props: any) {
  const product = props.productData ?? props.product
  const { style, options, testID } = props
  const { removeItemFromWishlist } = useWishlist()
  const variantId = product?.selectedVariantId ?? product?.defaultVariantId

  const crossStyle = style?.cross?.root
    ? style
    : {
        cross: { root: style?.root },
        icon: style?.icon,
      }

  return (
    <Pressable
      testID={testID}
      accessible={testID ? true : undefined}
      style={{ margin: 4, ...crossStyle?.cross?.root }}
      onPress={() => {
        if (!product?.handle) {
          return
        }
        emitWishlistCustomEvent('remove_from_wishlist', product)
        removeItemFromWishlist([
          {
            handle: product.handle,
            variantId,
          },
        ])
      }}
    >
      <Icon
        iconId={options?.iconId ?? 'cross'}
        height={17}
        width={17}
        fill={`#000000`}
        {...crossStyle?.icon}
      />
    </Pressable>
  )
}

let installed = false

/**
 * Fire add_to_wishlist / remove_from_wishlist via sendCustomEvent on heart
 * press. Replaces default AddToWishlist which requires onlineStoreUrl and
 * otherwise silently drops the action (and the PushApp event).
 */
export function installMeheryWishlistPressTracking(): void {
  if (installed) return
  installed = true

  installWishlistStoreDualSend()

  productCardComponentsMap['add-to-wishlist'] =
    TrackedAddToWishlist as typeof AddToWishlistV2
  productCardComponentsMap['add-to-wishlist-v2'] =
    TrackedAddToWishlist as typeof AddToWishlistV2
  productCardComponentsMap['delete-from-wishlist'] =
    TrackedRemoveFromWishlist as typeof DeleteFromWishlist
}
