import * as React from 'react'
import {
  OrderDetailProvider,
  ShopifyAuthProvider,
  ShopifyCatalogGeneric,
  ShopifyCartProvider,
  ShopifySearchProviderV2,
} from '@gauntlet/shopify'
import { useAppStore } from '@gauntlet/state'

import { Shell } from '@gauntlet/brewery'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { FallbackUI } from '@gauntlet/components/molecules/fallback'
import once from 'once'
import Config from 'react-native-config'
import * as Sentry from '@sentry/react-native'
import { registerBlocks } from './register-blocks'
import { registerIcons } from './register-icons'
import { AnalyticsProvider } from '@gauntlet/analytics'
import { FirebaseTracker } from '@gauntlet/firebase'
import { AppGiftProvider } from '@gauntlet/gift'
import { AppGiftV2Provider } from '@gauntlet/discount'
import { JudgemeReviewProvider } from '@gauntlet/judgeme'
import {
  AppbrewCurrencyProvider,
  AppbrewTracker,
  LocalWishlistProvider,
} from '@gauntlet/appbrew'
import { FacebookTracker } from '@gauntlet/facebook'
import { registerContainers } from './register-containers'
import { FirebasePush } from '@gauntlet/firebase-push'
import { ensureWorkingCatalog } from '../mehery/catalogFallback'
import { installNotifeePushAppDeduper } from '../mehery/pushCoexistence'
import { registerMeheryTracker } from '../mehery/MeheryTracker'
import { installMeheryCartPressTracking } from '../mehery/cartPressEvents'

const EnvConfig = Config.getConstants()

const reactNavigationIntegration = Sentry.reactNavigationIntegration()

function initApp() {
  // Dual-send ecom events in __DEV__ and release so PushApp is not empty in Metro.
  registerMeheryTracker(AnalyticsProvider.getInstance())
  installMeheryCartPressTracking()

  if (!__DEV__) {
    Sentry.init({
      dsn: 'https://66d1ec06c6ab4dcbb03a8569cbd47f9e@o1270458.ingest.sentry.io/6461307',
      tracesSampleRate: 1.0,
      initialScope: {
        tags: { appId: EnvConfig.APP_ID, appName: EnvConfig.APP_NAME },
      },
      integrations: [reactNavigationIntegration],
      enableAppStartTracking: true,
      enableNativeFramesTracking: true,
      enableStallTracking: true,
      enableUserInteractionTracing: true,
    })
    AnalyticsProvider.getInstance().addTracker(new FirebaseTracker())
    AnalyticsProvider.getInstance().addTracker(new AppbrewTracker())
    AnalyticsProvider.getInstance().addTracker(new FacebookTracker())
  }

  registerBlocks()
  registerContainers()
  registerIcons()
  const state = useAppStore.getState()
  state.constants.init({
    data: {
      logo: undefined,
      env: EnvConfig,
    },
  })

  const modules = {}
  modules['auth'] = ShopifyAuthProvider.getInstance
  modules['catalog'] = ShopifyCatalogGeneric.getInstance
  modules['analytics'] = AnalyticsProvider.getInstance
  modules['order'] = OrderDetailProvider.getInstance
  modules['wishlist'] = LocalWishlistProvider.getInstance
  modules['review'] = JudgemeReviewProvider.getInstance
  modules['cart'] = ShopifyCartProvider.getInstance
  modules['search'] = ShopifySearchProviderV2.getInstance
  modules['currency'] = AppbrewCurrencyProvider.getInstance
  // Keep AppBrew push module contract; Mehery owns PushApp rich tray (see src/mehery/pushCoexistence.ts).
  modules['push'] = FirebasePush.getInstance
  // Patch Notifee before FirebasePush.init so foreground FCM is not shown twice.
  installNotifeePushAppDeduper()

  state.modules.updateModules(modules)
}

once(initApp)()

/**
 * PollOverlay from Mehery — loaded after mount via loadMeherySdk().
 */
function MeheryPollOverlay() {
  const [Provider, setProvider] = React.useState<
    React.ComponentType | null
  >(null)

  React.useEffect(() => {
    let cancelled = false
    import('../mehery/sdk')
      .then(async (m) => {
        // Same peer as startMehery — avoid loading Mehery JS (and NativeEventEmitter)
        // when RNCPushNotificationIOS is not in the binary yet.
        const { NativeModules, Platform } = await import('react-native')
        if (
          Platform.OS === 'ios' &&
          !NativeModules.RNCPushNotificationIOS
        ) {
          console.warn(
            '[Mehery] PollOverlay skipped — RNCPushNotificationIOS missing'
          )
          return null
        }
        return m.loadMeherySdk()
      })
      .then((sdk) => {
        if (!sdk || cancelled) {
          return
        }
        const Comp = sdk.PollOverlayProvider
        if (Comp) {
          setProvider(() => Comp)
        } else {
          console.warn('[Mehery] PollOverlayProvider missing')
        }
      })
      .catch((e) => {
        console.warn('[Mehery] PollOverlayProvider load failed', e)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!Provider) {
    return null
  }
  return <Provider />
}

const App = Sentry.wrap((props: any) => {
  /**
   * Fetch config and gift only
   * on App mount
   */
  React.useLayoutEffect(() => {
    useAppStore
      .getState()
      .config.init(EnvConfig.APP_ID)
      .then(() => ensureWorkingCatalog())
      .then(() => {
        if (
          useAppStore.getState().config.data?.settings?.['global']?.enableGiftV3
        ) {
          useAppStore
            .getState()
            .modules.updateModule('gift', AppGiftV2Provider.getInstance)
          useAppStore.getState().discounts.init(EnvConfig.APP_ID)
        } else {
          useAppStore
            .getState()
            .modules.updateModule('gift', AppGiftProvider.getInstance)
          useAppStore.getState().gift.init(EnvConfig.APP_ID)
        }
      })
  }, [])

  React.useEffect(() => {
    import('../mehery/startMehery')
      .then((m) => {
        if (typeof m.startMehery !== 'function') {
          console.warn(
            '[Mehery] startMehery missing',
            m && typeof m === 'object' ? Object.keys(m) : m
          )
          return
        }
        return m.startMehery()
      })
      .catch((e) => {
        console.warn('[Mehery] bootstrap failed', e)
      })
  }, [])

  return (
    <Sentry.ErrorBoundary fallback={(props) => <FallbackUI {...props} />}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <Shell
            appId={EnvConfig.APP_ID}
            initialRouteName={props.initialRouteName}
            options={{
              notification: { color: EnvConfig.APP_NOTIFICATION_COLOR },
            }}
            routingInstrumentation={reactNavigationIntegration}
          />
          <MeheryPollOverlay />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </Sentry.ErrorBoundary>
  )
})

export default App
