/**
 * Dual-send notify_back_in_stock on Notify Me press (wishlistPressEvents pattern).
 * Avoids empty item shells when analytics getProduct resolves late / undefined.
 */

import { productCardComponentsMap } from '@gauntlet/components/molecules/generic-product-card/cardV2'
import { NotifyMeText } from '@gauntlet/components/molecules/product-components/notify-me'
import { AnalyticsProvider } from '@gauntlet/analytics'
import {
  subscribeToBackInStockNotifications,
  useAppStore,
  useBottomSheetModal,
} from '@gauntlet/state'
import * as React from 'react'
import { Pressable, View } from 'react-native'
import { Text } from '@gauntlet/components/atoms/text'
import { Icon } from '@gauntlet/icons'
import { emitNotifyBackInStockFromProduct } from './notifyPayload'

export { emitNotifyBackInStockFromProduct } from './notifyPayload'

/**
 * Same UX as NotifyMeText, but dual-sends notify_back_in_stock via sendCustomEvent
 * before Firebase topic subscribe (so Event Analytics gets a non-empty items[]).
 */
function TrackedNotifyMe(props: any) {
  const config = useAppStore((state) => state.config)
  const settings = config.data?.settings
  const { startIconId, productData, style, source, testID } = props
  const notifyMeText = source?.text ?? 'Notify me'
  const enableBackInStockNotifications =
    settings?.['global']?.enableBackInStockNotifications

  const getProduct = useAppStore((state) => state.analytics.getProduct)
  const analyticsModule = useAppStore((state) => state.modules.value?.analytics)
  const { closeModal } = useBottomSheetModal()

  const toastSettings = React.useMemo(() => {
    if (!settings) {
      return { addToCart: null, success: null, error: null }
    }
    return {
      addToCart: settings['global']?.toast?.addToCart ?? {},
      success: settings['global']?.toast?.success ?? {},
      error: settings['global']?.toast?.error ?? {},
    }
  }, [settings])

  const variantId =
    productData?.selectedVariantId ?? productData?.defaultVariantId

  const handlePress = React.useCallback(async () => {
    if (!productData?.handle || !variantId) {
      return
    }
    emitNotifyBackInStockFromProduct(productData)
    if (!analyticsModule || !config.data) {
      return
    }
    const analyticsProvider = analyticsModule(config.data) as AnalyticsProvider
    await subscribeToBackInStockNotifications(
      getProduct,
      productData.handle,
      variantId,
      toastSettings,
      analyticsProvider
    )
    closeModal()
  }, [
    analyticsModule,
    closeModal,
    config.data,
    getProduct,
    productData,
    toastSettings,
    variantId,
  ])

  if (!enableBackInStockNotifications || !productData || !variantId) {
    return null
  }
  const availableForSale =
    productData.variants?.items?.[variantId]?.availableForSale
  if (availableForSale) {
    return null
  }

  return (
    <Pressable
      testID={testID}
      accessible={testID ? true : undefined}
      onPress={handlePress}
      style={style?.root}
    >
      {Boolean(startIconId) && (
        <Icon
          iconId={startIconId}
          width={style?.notifyMeIcon?.width}
          height={style?.notifyMeIcon?.height}
          fill={style?.notifyMeIcon?.fill}
          stroke={style?.notifyMeIcon?.stroke}
          strokeWidth={style?.notifyMeIcon?.strokeWidth}
          {...style?.notifyMeIcon}
        />
      )}
      <Text style={style?.text}>{notifyMeText}</Text>
    </Pressable>
  )
}

/**
 * Outer press wrapper for AddToCart OOS path (NotifyMeText is imported directly,
 * not via productCardComponentsMap).
 */
export function TrackedNotifyAddToCartShell(props: {
  productData: any
  children: React.ReactNode
}) {
  const { productData, children } = props
  const config = useAppStore((state) => state.config)
  const getProduct = useAppStore((state) => state.analytics.getProduct)
  const analyticsModule = useAppStore((state) => state.modules.value?.analytics)
  const { closeModal } = useBottomSheetModal()
  const settings = config.data?.settings
  const toastSettings = React.useMemo(
    () => ({
      addToCart: settings?.['global']?.toast?.addToCart ?? {},
      success: settings?.['global']?.toast?.success ?? {},
      error: settings?.['global']?.toast?.error ?? {},
    }),
    [settings]
  )
  const variantId =
    productData?.selectedVariantId ?? productData?.defaultVariantId

  return (
    <Pressable
      accessibilityLabel="track-notify-back-in-stock"
      onPress={async () => {
        if (!productData?.handle || !variantId) {
          return
        }
        emitNotifyBackInStockFromProduct(productData)
        if (!analyticsModule || !config.data) {
          return
        }
        const analyticsProvider = analyticsModule(
          config.data
        ) as AnalyticsProvider
        await subscribeToBackInStockNotifications(
          getProduct,
          productData.handle,
          variantId,
          toastSettings,
          analyticsProvider
        )
        closeModal()
      }}
    >
      <View pointerEvents="none">{children}</View>
    </Pressable>
  )
}

let installed = false

export function installMeheryNotifyPressTracking(): void {
  if (installed) {
    return
  }
  installed = true

  productCardComponentsMap['notify-me'] =
    TrackedNotifyMe as typeof NotifyMeText
}
