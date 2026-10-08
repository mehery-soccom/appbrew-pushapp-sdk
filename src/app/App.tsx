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
import { setupPushApp, PushAppRoot } from 'react-native-pushapp-appbrew/appbrew'
import { DemoOrdersEntry } from '../mehery/localOrders/DemoOrdersEntry'
import { mirrorProductToLocalCart } from '../mehery/localCart/mirrorProduct'
import { presentLoginFirstIfNeeded } from '../auth/presentLoginFirst'
import { MeheryPdpActionOverlay } from '../mehery/MeheryPdpActionOverlay'
import { MeheryCartOverlay } from '../mehery/localCart/MeheryCartOverlay'
import { MeheryOrderScreensOverlay } from '../mehery/localOrders/MeheryOrderScreensOverlay'

const EnvConfig = Config.getConstants()

const reactNavigationIntegration = Sentry.reactNavigationIntegration()

function initApp() {
  setupPushApp({
    channelId: 'ecommerce_1786525308082',
    environment: false, // false = pushapp.ai
    appScheme: 'mehery2',
    httpsHosts: ['mehery2.myshopify.com'],
    shopDomain: 'natori-appbrew.myshopify.com',
    geo: {
      ip: '103.21.244.0',
      location: { lat: 19.076, lng: 72.8777 },
      country: { iso_code: 'IN', name: 'India' },
      region: { iso_code: 'MH', name: 'Maharashtra' },
      city: { name: 'Mumbai' },
      area: { name: 'Parel' },
    },
    // Optional .env overrides (must match the campaign placeholder_id; rebuild natively after changing)
    accountInlinePlaceholderId: EnvConfig.MEHERY_ACCOUNT_INLINE_PLACEHOLDER_ID,
    accountTooltipPlaceholderId: EnvConfig.MEHERY_ACCOUNT_TOOLTIP_PLACEHOLDER_ID,
    accountExtras: DemoOrdersEntry,
    onAddToCart: mirrorProductToLocalCart,
  })

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

  state.modules.updateModules(modules)
}

once(initApp)()

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
          <PushAppRoot />
          <MeheryPdpActionOverlay />
          <MeheryCartOverlay />
          <MeheryOrderScreensOverlay />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </Sentry.ErrorBoundary>
  )
})

export default App
