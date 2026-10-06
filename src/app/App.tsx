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
import RNBootSplash from 'react-native-bootsplash'
import { ensureWorkingCatalog, markCatalogProbeFinished } from '../mehery/catalogFallback'
import { installNotifeePushAppDeduper } from '../mehery/pushCoexistence'
import { registerMeheryTracker } from '../mehery/MeheryTracker'
import { installMeheryCartPressTracking } from '../mehery/cartPressEvents'
import { installMeheryWishlistPressTracking } from '../mehery/wishlistPressEvents'
import { installMeheryProductUrlEnrichment } from '../mehery/productUrlEnrichment'
import { installMeherySessionKeepAlive } from '../mehery/sessionKeepAlive'
import { installMeherySearchTracking } from '../mehery/searchEvents'
import { presentLoginFirstIfNeeded } from '../auth/presentLoginFirst'
import { MeheryPageOpenListener } from '../mehery/MeheryPageOpenListener'
import { MeheryPdpActionOverlay } from '../mehery/MeheryPdpActionOverlay'
import { MeheryCartOverlay } from '../mehery/localCart/MeheryCartOverlay'
import { MeheryOrderScreensOverlay } from '../mehery/localOrders/MeheryOrderScreensOverlay'

const EnvConfig = Config.getConstants()

const reactNavigationIntegration = Sentry.reactNavigationIntegration()

function initApp() {
  // Dual-send ecom events in __DEV__ and release so PushApp is not empty in Metro.
  registerMeheryTracker(AnalyticsProvider.getInstance())
  installMeheryCartPressTracking()
  installMeheryProductUrlEnrichment()
  installMeheryWishlistPressTracking()
  installMeherySearchTracking()
  // Early wrap so cold-start getUserDetails renews CAT before resetUser.
  installMeherySessionKeepAlive()

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
    // After initSdk (skill order): startMehery is idempotent with App's boot effect.
    import('../mehery/startMehery')
      .then((m) => m.startMehery())
      .then(() => import('../mehery/sdk'))
      .then((m) => m.loadMeherySdk())
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
      .catch((e) => {
        // Release mode with no published App Brew release throws inside
        // applyEnvOverrides(null) and leaves NavigationContainer unmounted —
        // native BootSplash would stay forever without this.
        console.warn('[App] config/catalog init failed', e)
        markCatalogProbeFinished()
        try {
          useAppStore.getState().splash.hide()
        } catch {
          // ignore
        }
        RNBootSplash.hide({ fade: false }).catch(() => {})
      })
  }, [])

  React.useEffect(() => {
    return presentLoginFirstIfNeeded()
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
          <MeheryPageOpenListener />
          <MeheryPdpActionOverlay />
          <MeheryCartOverlay />
          <MeheryOrderScreensOverlay />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </Sentry.ErrorBoundary>
  )
})

export default App
