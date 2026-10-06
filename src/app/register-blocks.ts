import { blockRegistry, registerCommonBlocks } from '@gauntlet/block-registry'
import { BuyNowBar } from '@gauntlet/components/organisms/buy-now-bar'
import { OtpVerification } from '../auth/OtpVerification'
import { MeheryProfileUserGreeting } from '../mehery/accountPollBlocks'
import { MeheryAddToCartBar } from '../mehery/MeheryAddToCartBar'
import { DummyCheckoutScreen } from '../mehery/dummyCheckout/DummyCheckoutScreen'
import { DummyCartScreen } from '../mehery/localCart/DummyCartScreen'
import { DummyCheckoutBar } from '../mehery/localCart/DummyCheckoutBar'
import { LocalOrdersListBlock } from '../mehery/localOrders/LocalOrdersListBlock'
import { LocalOrderDetailBlock } from '../mehery/localOrders/LocalOrderDetailBlock'

export function registerBlocks() {
  const r = blockRegistry
  registerCommonBlocks(r)
  // Host override: BottomSheet-safe OTP input (fixes stuck focus after 1–2 digits).
  r.set('otp-verification', OtpVerification)
  // Host override: Mehery Inline/Tooltip poll placeholders on Account.
  // OnPageOpen('home'|'account') is owned by MeheryPageOpenListener.
  r.set('profile-user-greeting', MeheryProfileUserGreeting)
  // Host override: PDP bar with Add to cart + Buy Now → dummy checkout.
  r.set('add-to-cart-bar', MeheryAddToCartBar)
  // Register stock Buy Now bar (not in common registry) for themes that use it.
  r.set('buy-now-bar', BuyNowBar)
  // Host override: Dummy cart list (MMKV) — always shows items for QA flow.
  r.set('cart-list', DummyCartScreen)
  r.set('checkout-bar', DummyCheckoutBar)
  r.set('checkout-bar-v2', DummyCheckoutBar)
  // Host override: Dummy checkout (QA) replaces Shopify payment WebView.
  r.set('payment-web-view-v4', DummyCheckoutScreen)
  r.set('shopify-customer-payment-webview', DummyCheckoutScreen)
  // Host override: Order history → Track order (local demo orders).
  r.set('orders-list-v5', LocalOrdersListBlock)
  r.set('orders-list-v4', LocalOrdersListBlock)
  r.set('order-details-header-v5', LocalOrderDetailBlock)
  r.set('order-details-header-v4', LocalOrderDetailBlock)
  r.set('mehery-local-orders', LocalOrdersListBlock)
  r.set('mehery-order-detail', LocalOrderDetailBlock)
}
