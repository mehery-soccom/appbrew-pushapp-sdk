import * as React from 'react'
import {
  ScreenContext,
  transformLineItems,
  transformToAdminId,
  useAnalytics,
  useAppStore,
  useBlock,
  useBlockTestID,
  useDeviceDimensions,
  useDomain,
  useGlobalSettings,
  useLink,
  usePaymentUrl,
  useResetCart,
  useSetOverrideBack,
  useSetWebUrl,
  useUser,
} from '@gauntlet/state'
import { WebView } from 'react-native-webview'
import { Linking, Platform, StyleSheet, View } from 'react-native'
import InAppReview from 'react-native-in-app-review'
import LoadingDots from 'react-native-loading-dots'
import { AnalyticsEvent, BaseBlockProps } from '@gauntlet/types'
import { isCartPage, isLoginPage, isThankYou } from '@gauntlet/components/utils'
import Toast from 'react-native-toast-message'
import {
  useBlockSettings,
  useBlockStyle,
} from '@gauntlet/components/style-utils'
import {
  PUSHAPP_CHECKOUT_EVENTS,
  SHOPIFY_PIXEL_EVENTS,
  couponFromCheckoutPixel,
  mergeCheckoutPayloadWithCart,
  resolveCheckoutBridgeAction,
  toPushAppCheckoutEventName,
} from './checkoutBridge'

/** Inbound Shopify Customer Event names (web pixel). Remap via toPushAppCheckoutEventName. */
const CheckoutEvents = SHOPIFY_PIXEL_EVENTS

interface CheckoutEventPayload {
  totalPrice: {
    amount: number
  }
  shippingLine: {
    price: {
      amount: number
    }
  }
  lineItems: {
    variant: {
      product: {
        vendor: string
        url: string
        type: string
        id: string
        title: string
      }
      image: {
        src: string
      }
      id: string
      price: {
        amount: number
      }
      sku: string
    }
    quantity: number
    discountAllocations: {
      amount: {
        amount: number
      }
    }[]
  }[]
  discountApplications: {
    type: string
    title: string
  }[]
  subtotalPrice: {
    amount: number
  }
  currencyCode: string
  token: string
  order: {
    id: string
  }
}

export function MeheryPaymentWebviewV4(props: BaseBlockProps & { webLink?: string }) {
  const [pixelCartPayload, setPixelCartPayload] = React.useState<any>(null)
  const appName = useAppStore.getState().constants.data?.env?.APP_NAME
  const appVersion = useAppStore.getState().device.buildNumber
  const screenContext = React.useContext(ScreenContext)
  const userAgent = `Appbrew/${appName
    ?.toLowerCase()
    .replace(/\s/g, '')}/${Platform.OS.toLowerCase()}/${appVersion}`
  const { width } = useDeviceDimensions()
  const block = useBlock(props.screenId, props.componentId, props.instanceId)
  const testID = useBlockTestID(block, props.screenId)
  const settings = useBlockSettings(block)
  const style = useBlockStyle(block)
  const globalSettings = useGlobalSettings()
  const webViewRef = React.useRef<WebView>(null)
  const paymentUrl = usePaymentUrl()
  const domain = useDomain()
  const [url, _setUrl] = React.useState<string | undefined>(paymentUrl)
  const user = useUser()
  const cartUpdatedAt = useAppStore((s) => s.cart.data.updatedAt)
  const [key, setKey] = React.useState(cartUpdatedAt)
  const { gotoLink } = useLink()
  const analytics = useAnalytics()
  const cart = useAppStore((s) => s.cart.data)
  const setWebUrl = useSetWebUrl()
  const fetchCart = useAppStore.getState().cart.fetchCart
  const resetCart = useResetCart()
  const applyDiscountCode = useAppStore((s) => s.cart.applyDiscountCode)
  const setOverrideBack = useSetOverrideBack()
  const setCheckoutCompleted = useAppStore(
    (s) => s.checkout.setCheckoutCompleted
  )
  const isCheckoutCompleted = useAppStore((s) => s.checkout.completed)

  const reload = React.useCallback(() => {
    if (Platform.OS === 'android') {
      return webViewRef.current?.injectJavaScript('window.location.reload()')
    }

    return webViewRef.current?.reload()
  }, [])

  const purchaseConfirmIdentifier = settings?.options?.purchaseConfirmIdentifier

  const timeoutRef = React.useRef<any>(null)
  const debouncedSetKey = React.useCallback(
    (key?: number) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(() => {
        setKey(key)
      }, settings?.options?.keyDebounceTime ?? 1000)
    },
    [settings?.options?.keyDebounceTime]
  )
  React.useEffect(() => {
    debouncedSetKey(cartUpdatedAt)
  }, [cartUpdatedAt, debouncedSetKey])

  React.useEffect(() => {
    return () => {
      fetchCart({ refresh: true })
    }
  }, [fetchCart])

  React.useEffect(() => {
    reload()
  }, [key, reload])

  React.useEffect(() => {
    try {
      if (!cart) return
      const cartData = {
        checkout_token: transformToAdminId(cart.id),
        value: Number(cart.payment?.total),
        sub_total: Number(cart.payment?.lineItemsSubTotal),
        discount:
          Number(cart.payment?.lineItemsSubTotal) -
          Number(cart.payment?.subTotal),
        currency: cart.payment?.currencyCode,
        coupon: cart.discount?.code,
        items: transformLineItems(cart),
        transaction_id: cart.id,
      }
      setPixelCartPayload(cartData)
    } catch (e) {
      console.error('Error in transforming cart data', e)
    }
  }, [cart])

  const transformCheckoutPayload = React.useCallback(
    (payload: CheckoutEventPayload) => {
      if (!payload) return {}
      const apps = Array.isArray(payload.discountApplications)
        ? payload.discountApplications
        : []
      const coupon = apps.find(
        (discount) => discount.type === 'DISCOUNT_CODE'
      )?.title
      const lineItems = Array.isArray(payload.lineItems) ? payload.lineItems : []
      const items = lineItems.map((lineItem) => {
        const {
          variant: { product },
        } = lineItem
        return {
          affiliation: product.vendor,
          coupon,
          discount: (lineItem.discountAllocations ?? []).reduce((i, discount) => {
            return i + discount.amount.amount
          }, 0),
          handle: product.url.replace('/products/', ''),
          img_url: lineItem.variant.image.src,
          item_brand: product.vendor,
          item_category: product.type,
          item_id: product.id,
          item_name: product.title,
          item_variant: lineItem.variant.id,
          url: product.url || '',
          sku: lineItem.variant.sku,
          price: lineItem.variant.price.amount,
          quantity: lineItem.quantity,
        }
      })
      return {
        value: payload.totalPrice?.amount,
        shipping: payload.shippingLine?.price?.amount,
        items,
        coupon,
        sub_total: payload.subtotalPrice?.amount,
        checkout_token: payload.token,
        currency: payload.currencyCode,
        discount: items.reduce((i, item) => {
          return i + item.discount
        }, 0),
      }
    },
    []
  )

  const reviewTimeoutRef = React.useRef<any>(null)
  const showInAppReview = React.useCallback(() => {
    if (InAppReview.isAvailable()) {
      if (reviewTimeoutRef.current) {
        clearTimeout(reviewTimeoutRef.current)
      }
      reviewTimeoutRef.current = setTimeout(() => {
        InAppReview.RequestInAppReview().catch(console.error)
      }, 5000)
    }
  }, [])

  const sendPurchaseEventTimeoutRef = React.useRef<any>(null)
  const sendPurchaseEvent = React.useCallback(
    (payload) => {
      if (isCheckoutCompleted) return
      if (sendPurchaseEventTimeoutRef.current) {
        clearTimeout(sendPurchaseEventTimeoutRef.current)
      }
      sendPurchaseEventTimeoutRef.current = setTimeout(() => {
        setCheckoutCompleted(true)
        const merged = mergeCheckoutPayloadWithCart(
          payload ?? {},
          pixelCartPayload
        )
        const coupon =
          couponFromCheckoutPixel(payload) ??
          (typeof merged.coupon === 'string' ? merged.coupon : undefined)
        analytics?.sendEvent(AnalyticsEvent.PURCHASE, {
          ...merged,
          ...(coupon ? { coupon } : {}),
        })
        showInAppReview()
        resetCart()
        setOverrideBack('home')
      }, 2000)
    },
    [
      analytics,
      isCheckoutCompleted,
      pixelCartPayload,
      setCheckoutCompleted,
      setOverrideBack,
      showInAppReview,
      resetCart,
    ]
  )

  const emitBridgeAnalytics = React.useCallback(
    (eventName: string, payload: any) => {
      const action = resolveCheckoutBridgeAction(
        eventName,
        payload ?? {},
        pixelCartPayload
      )
      if (action.type === 'analytics') {
        analytics?.sendEvent(action.event, action.payload)
      }
    },
    [analytics, pixelCartPayload]
  )

  const handleCheckoutEvent = React.useCallback(
    (event: string, payload: CheckoutEventPayload) => {
      // Align Shopify pixel names with PushApp / GA4 before dual-send.
      const pushAppEvent = toPushAppCheckoutEventName(event)

      if (
        event === CheckoutEvents.PAYMENT_INFO_SUBMITTED ||
        pushAppEvent === PUSHAPP_CHECKOUT_EVENTS.ADD_PAYMENT_INFO
      ) {
        const transformed = payload ? transformCheckoutPayload(payload) : {}
        setPixelCartPayload(
          mergeCheckoutPayloadWithCart(transformed, pixelCartPayload)
        )
        if (
          payload &&
          user.data.userDetails.status !== 'idle' // this means user is not logged in
        ) {
          analytics?.setUserDetails({
            phone: (payload as any)?.phone || (payload as any)?.shippingAddress?.phone,
            email: (payload as any)?.email || (payload as any)?.shippingAddress?.email,
            firstName: (payload as any)?.shippingAddress?.firstName,
            lastName: (payload as any)?.shippingAddress?.lastName,
            defaultAddress: (payload as any)?.shippingAddress,
          })
        }
        emitBridgeAnalytics(
          PUSHAPP_CHECKOUT_EVENTS.ADD_PAYMENT_INFO,
          transformCheckoutPayload(payload)
        )
        // Shipping often lands with payment_info; also dual-send add_shipping_info.
        emitBridgeAnalytics(
          PUSHAPP_CHECKOUT_EVENTS.ADD_SHIPPING_INFO,
          transformCheckoutPayload(payload)
        )
      }

      if (
        event === CheckoutEvents.SHIPPING_INFO_SUBMITTED ||
        event === CheckoutEvents.ADDRESS_INFO_SUBMITTED ||
        pushAppEvent === PUSHAPP_CHECKOUT_EVENTS.ADD_SHIPPING_INFO
      ) {
        // Avoid double-firing when we already emitted shipping from payment_info.
        if (
          event !== CheckoutEvents.PAYMENT_INFO_SUBMITTED &&
          pushAppEvent !== PUSHAPP_CHECKOUT_EVENTS.ADD_PAYMENT_INFO
        ) {
          emitBridgeAnalytics(
            PUSHAPP_CHECKOUT_EVENTS.ADD_SHIPPING_INFO,
            payload ? transformCheckoutPayload(payload) : {}
          )
        }
      }

      if (
        event === CheckoutEvents.DISCOUNT_CODE_APPLIED ||
        pushAppEvent === PUSHAPP_CHECKOUT_EVENTS.APPLY_COUPON
      ) {
        emitBridgeAnalytics(
          PUSHAPP_CHECKOUT_EVENTS.APPLY_COUPON,
          payload as any
        )
      }

      if (
        event === CheckoutEvents.DISCOUNT_CODE_REMOVED ||
        pushAppEvent === PUSHAPP_CHECKOUT_EVENTS.REMOVE_COUPON
      ) {
        emitBridgeAnalytics(
          PUSHAPP_CHECKOUT_EVENTS.REMOVE_COUPON,
          payload as any
        )
      }

      if (
        event === CheckoutEvents.CHECKOUT_STARTED ||
        pushAppEvent === PUSHAPP_CHECKOUT_EVENTS.BEGIN_CHECKOUT
      ) {
        emitBridgeAnalytics(
          PUSHAPP_CHECKOUT_EVENTS.BEGIN_CHECKOUT,
          payload ? transformCheckoutPayload(payload) : pixelCartPayload
        )
      }

      if (
        event === CheckoutEvents.CHECKOUT_COMPLETED ||
        pushAppEvent === PUSHAPP_CHECKOUT_EVENTS.PURCHASE
      ) {
        sendPurchaseEvent(
          payload ? transformCheckoutPayload(payload) : pixelCartPayload
        )
      }
    },
    [
      transformCheckoutPayload,
      user.data.userDetails.status,
      analytics,
      sendPurchaseEvent,
      pixelCartPayload,
      emitBridgeAnalytics,
    ]
  )

  const isHomePage = (
    url: string,
    domain: string,
    domainPaths: string[] = []
  ) => {
    const normalizedDomain = domain.replace(/^www\./, '')

    // If no domain paths are configured, check for domain root only
    const pathsToCheck = domainPaths.length === 0 ? [''] : domainPaths

    // Check if URL matches domain with any of the configured domain paths (or root)
    for (const path of pathsToCheck) {
      const normalizedPath =
        path === '' ? '' : path.startsWith('/') ? path : `/${path}`
      const escapedPath = normalizedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const pattern = new RegExp(
        `^(https?://)?(?:www\\.)?${normalizedDomain.replace(
          /\./g,
          '\\.'
        )}${escapedPath}/?$`,
        'i'
      )
      if (pattern.test(url)) {
        return true
      }
    }

    return false
  }

  const handleRoutingToOtherPages = React.useCallback(
    (url: string) => {
      const domainPaths = globalSettings?.domainPaths || []
      if (domain && isHomePage(url, domain, domainPaths)) {
        gotoLink({
          kind: 'screen',
          value: 'home',
        })
      } else if (isCartPage(url)) {
        webViewRef.current?.goBack()
      } else if (isLoginPage(url)) {
        webViewRef.current?.stopLoading()
        gotoLink({
          kind: 'screen',
          value: settings.source?.loginScreen ?? 'signin',
          params: settings.source?.loginParams ?? {},
        })
      }
      if (isThankYou(url, purchaseConfirmIdentifier)) {
        sendPurchaseEvent(pixelCartPayload)
      }
    },
    [
      domain,
      gotoLink,
      pixelCartPayload,
      purchaseConfirmIdentifier,
      sendPurchaseEvent,
      globalSettings?.domainPaths,
    ]
  )

  const onMessageReceive = React.useCallback(
    (event: any) => {
      try {
        let eventData = JSON.parse(event.nativeEvent.data)
        if (eventData[CheckoutEvents.CHECKOUT_COMPLETED] === true) {
          eventData = {
            action: 'SEND_EVENT',
            payload: {
              event: CheckoutEvents.CHECKOUT_COMPLETED,
              payload: null,
              source: 'web-pixel',
            },
          }
        }
        const { action, payload } = eventData
        switch (action) {
          case 'SEND_EVENT':
            if (payload.source === 'web-pixel') {
              handleCheckoutEvent(payload.event, payload.payload)
            } else {
              const bridged = resolveCheckoutBridgeAction(
                payload.event,
                payload.payload ?? {},
                pixelCartPayload
              )
              if (bridged.type === 'analytics') {
                analytics?.sendEvent(bridged.event, bridged.payload)
              } else {
                analytics?.sendEvent(
                  payload.event ?? 'UNKNOWN_WEBVIEW_EVENT',
                  mergeCheckoutPayloadWithCart(
                    payload.payload ?? {},
                    pixelCartPayload
                  )
                )
              }
            }
            break
          case 'SHOW_TOAST':
            Toast.show({
              type: payload.kind,
              text1: payload.message,
              visibilityTime: payload.duration ?? 1000,
            })
            break
          case 'APPLY_COUPON':
            applyDiscountCode(payload.code).then((res) => {
              if (!res) {
                analytics?.sendEvent(AnalyticsEvent.APPLY_COUPON, {
                  coupon: payload.code,
                  isApplicable: false,
                })
              }
              if (res) {
                Toast.show({
                  type: 'success',
                  text2: `Coupon code ${payload.code} applied on cart`,
                  visibilityTime: 3000,
                })
              }
            })
            break
          case 'REMOVE_COUPON':
            analytics?.sendEvent(AnalyticsEvent.REMOVE_COUPON, {
              coupon: payload?.code ?? pixelCartPayload?.coupon ?? '',
            })
            break
          case 'NAVIGATE':
            gotoLink({
              kind: 'screen',
              value: payload.path,
            })
            break
          default:
            return
        }
      } catch (e) {
        console.error(e)
      }
    },
    [
      analytics,
      applyDiscountCode,
      gotoLink,
      handleCheckoutEvent,
      pixelCartPayload,
    ]
  )
  if (!url) return null

  let h = screenContext?.value?.contentHeight
  const customerAccessToken = user.getCustomerAccessToken()
  return (
    <WebView
      testID={testID}
      key={customerAccessToken ?? 'guest'}
      ref={webViewRef}
      applicationNameForUserAgent={userAgent}
      injectedJavaScript={
        settings?.options?.hideCouponCode
          ? `
          function hanleHideCouponCode() {
            const couponCodeElement = document.getElementById("gift-card-field");
            if(couponCodeElement) {
              couponCodeElement.remove();
            } else {
              window.requestAnimationFrame(hanleHideCouponCode);
            }
          }
          window.requestAnimationFrame(hanleHideCouponCode);`
          : ''
      }
      injectedJavaScriptBeforeContentLoaded={`
          window.appbrew = {
            "postMessage": function (data){ window.ReactNativeWebView.postMessage(JSON.stringify(data))},
            "sendEvent": function(event, payload) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                "action": "SEND_EVENT",
                "payload":  {
                  "event": event,
                  "payload": payload
                }
              }))
            }
          };
          function step(){
            if(document.getElementsByClassName('reduction-code__text').length>0){
              var elements = document.getElementsByClassName('reduction-code__text');
              for(var i=0; i<elements.length; i++){
                elements[i].innerHTML = '';
              }
            } else {
              window.requestAnimationFrame(step);
            }
          }
          window.requestAnimationFrame(step);
          function improveUI() {
            const headerFooterInterval = setInterval(() => {
               const headers = document.querySelectorAll('header[role="banner"]');
               const footer = document.querySelector('footer[role="contentinfo"]');
               if(headers.length > 1 && footer) {
                 for(let i = 1; i < headers.length; i++) {
                    headers[i].remove();
                  }
                 footer.remove();
                 clearInterval(headerFooterInterval);
               }
             }, 500);
             
             function setAppPadding() {
               const app = document.getElementById('app');
               if(app) {
                 app.style.paddingBottom = '${
                   settings?.options?.appPaddingBottom || 30
                 }px';
               } else {
                 window.requestAnimationFrame(setAppPadding);
               }
             }
             window.requestAnimationFrame(setAppPadding);
             
             const payButtonInterval = setInterval(() => {
              const payButton = document.querySelector("${
                settings?.options?.payButtonSelector
              }");
              if(payButton) {
                const payButtonStyle = ${JSON.stringify(
                  style?.payButton || {
                    position: 'fixed',
                    bottom: '0',
                    left: '0',
                    width: '100%',
                    borderRadius: '0',
                    zIndex: '1000',
                  }
                )};
                console.log(payButtonStyle);
                Object.keys(payButtonStyle).forEach((key) => {
                  payButton.style[key] = payButtonStyle[key];
                });
                clearInterval(payButtonInterval);
              }
            }, 500);
           }
           improveUI();
          window.addEventListener('message', function(event){
            const data = event.data;
            if(data.source === 'web-pixel'){
              // Align Shopify Customer Event names with PushApp / GA4 dual-send names.
              var shopifyToPushApp = {
                checkout_started: 'begin_checkout',
                checkout_completed: 'purchase',
                payment_info_submitted: 'add_payment_info',
                checkout_shipping_info_submitted: 'add_shipping_info',
                checkout_address_info_submitted: 'add_shipping_info',
                checkout_discount_code_applied: 'apply_coupon',
                checkout_discount_code_removed: 'remove_coupon'
              };
              var rawEvent = data.event;
              var alignedEvent = shopifyToPushApp[rawEvent] || rawEvent;
              window.ReactNativeWebView.postMessage(JSON.stringify({
                "action": "SEND_EVENT",
                "payload":  {
                  "source": "web-pixel",
                  "event": alignedEvent,
                  "payload": data.payload
                }
              }))
            }
          });
          const loginInterval = setInterval(() => {
                const links = document.querySelectorAll('a');
                links.forEach(link => {
                    if (link.textContent.trim() === 'Log in') {
                        link.remove();
                        clearInterval(loginInterval);
                    }
                });
              }, 500);

        `}
      onShouldStartLoadWithRequest={(e) => {
        if (!e.url.startsWith('http')) {
          if (e.url.startsWith('about:')) return false
          Linking.openURL(e.url)
          return false
        }
        return true
      }}
      onLoadStart={(event) => {
        const url = event.nativeEvent.url
        setWebUrl(url)
        handleRoutingToOtherPages(url)
      }}
      style={{ width: width, height: h }}
      startInLoadingState={false}
      renderLoading={() => (
        <View
          style={{
            position: 'absolute',
            alignItems: 'center',
            justifyContent: 'center',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
          }}
        >
          <Loader colors={['#000', '#000', '#000', '#000']} />
        </View>
      )}
      automaticallyAdjustContentInsets={false}
      scrollEnabled={true}
      nestedScrollEnabled={true}
      javaScriptEnabled={true}
      domStorageEnabled={true}
      source={{
        uri: url,
        headers: {
          'X-Shopify-Customer-Access-Token':
            user.data?.customerAccessToken?.data?.accessToken,
        },
      }}
      incognito={false}
      originWhitelist={['*']}
      onMessage={onMessageReceive}
    />
  )
}

export function Loader({ colors }: { colors?: string[] }) {
  const numOfDots = 4
  return (
    <View style={styles.dotsWrapper}>
      <LoadingDots
        bounceHeight={5}
        dots={numOfDots}
        size={10}
        colors={colors ?? Array(numOfDots).fill('#fff')}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  // eslint-disable-next-line react-native/no-color-literals
  dotsWrapper: {
    width: 100,
    backgroundColor: 'transparent',
  },
})

