import { sendMeheryCustomEvent } from 'react-native-pushapp-appbrew/appbrew'
import { buildDummyCheckoutPayload } from '../dummyCheckout/buildDummyCheckoutPayload'
import type { LocalCartLine } from './store'

export function sendCartLineEvent(
  name: 'add_to_cart' | 'remove_from_cart',
  line: LocalCartLine,
  quantity: number
) {
  if (quantity <= 0) return
  const price = line.price
  void sendMeheryCustomEvent(
    name,
    buildDummyCheckoutPayload({
      lineItems: [
        {
          variantId: line.variantId,
          productId: line.productId,
          productHandle: line.productHandle,
          title: line.title,
          image: line.image,
          priceAfterDiscount: price,
          originalPrice: line.originalPrice ?? price,
          quantity,
          vendor: line.vendor,
          productType: line.productType,
          sku: line.sku,
        },
      ],
      payment: { total: price * quantity, currencyCode: line.currency },
    })
  )
}

export function sendCartQuantityChange(line: LocalCartLine, nextQuantity: number) {
  const delta = nextQuantity - line.quantity
  if (delta > 0) sendCartLineEvent('add_to_cart', line, delta)
  else if (delta < 0) sendCartLineEvent('remove_from_cart', line, -delta)
}
