import { iconRegistry } from '@gauntlet/icons'
import { registerPostPurchaseIcons } from '@gauntlet/orders-v4'
import { registerOrdersV5Icons } from '@gauntlet/orders-v5'
import HomeDefault from './icons/home-default'
import CollectionDefault from './icons/collection-default'
import AccountDefault from './icons/account-default'
import Cart from './icons/cart'
import Search from './icons/search'
import WishlistDefault from './icons/wishlist-default'
import ChevronLeft from './icons/chevron-left'
import EyeOn from './icons/eye-on'
import EyeOff from './icons/eye-off'
import WishlistSelected from './icons/wishlist-selected'
import ChevronUp from './icons/chevron-up'
import ChevronRight from './icons/chevron-right'
import ChevronDown from './icons/chevron-down'
import Minus from './icons/minus'
import Plus from './icons/plus'
import Share from './icons/share'
import Sort from './icons/sort'
import Filter from './icons/filter'
import Close from './icons/close'
import Clock from './icons/clock'
import Delete from './icons/delete'
import Offer from './icons/offer'
import NoIntenet from './icons/no-internet'
import AccountSelected from './icons/account-selected'
import ArrowUpRight from './icons/arrow-up-right'
import Award from './icons/award'
import Cash from './icons/cash'
import Check from './icons/check'
import CheckCircle from './icons/check-circle'
import CollectionSelected from './icons/collection-selected'
import CreditCard from './icons/credit-card'
import Gift from './icons/gift'
import HomeSelected from './icons/home-selected'
import Icons from './icons/icons'
import Maps from './icons/maps'
import OrderCancel from './icons/order-cancel'
import OrderDelivered from './icons/order-delivered'
import Password from './icons/password'
import Percentage from './icons/percentage'
import Pin from './icons/pin'
import SizeChart from './icons/size-chart'
import Star from './icons/star'
import StarFilled from './icons/star-filled'
import Stars from './icons/stars'
import Tags from './icons/tags'
import XCircle from './icons/xcircle'
import VolumeOn from './icons/volume'
import VolumeOff from './icons/volume-off'
import Play from './icons/play'
import Pause from './icons/pause'
import AddressBook from './icons/address-book'
import Calender from './icons/calender'
import ContactUs from './icons/contact-us'
import DeliveryAndReturn from './icons/delivery-and-return'
import EasyReturn from './icons/easy-return'
import HomeDelivery from './icons/home-delivery'
import NewLaunch from './icons/new-launch'
import Open from './icons/open'
import OrderHistory from './icons/order-history'
import PasswordChange from './icons/password-change'
import PrivacyPolicy from './icons/privacy-policy'
import Return from './icons/return'
import ShippingPolicy from './icons/shipping-policy'
import ShoppingBag from './icons/shopping-bag'
import TermsOfService from './icons/terms-of-service'
import TrashV3 from './icons/trash-v3'
import Truck from './icons/truck'

export function registerIcons() {
  const r = iconRegistry
  r.set('home-default', HomeDefault)
  r.set('collection-default', CollectionDefault)
  r.set('account-default', AccountDefault)
  r.set('search', Search)
  r.set('cart', Cart)
  r.set('back', ChevronLeft)
  r.set('eye', EyeOn)
  r.set('eyeOff', EyeOff)
  r.set('heart', WishlistDefault)
  r.set('heart-filled', WishlistSelected)
  r.set('chevron-up', ChevronUp)
  r.set('chevron-right', ChevronRight)
  r.set('chevron-bottom', ChevronDown)
  r.set('chevron-left', ChevronLeft)
  r.set('minus', Minus)
  r.set('plus', Plus)
  r.set('share', Share)
  r.set('sort', Sort)
  r.set('filter', Filter)
  r.set('close', Close)
  r.set('clock', Clock)
  r.set('trash', Delete)
  r.set('coupon', Offer)
  r.set('no-internet', NoIntenet)
  r.set('account-selected', AccountSelected)
  r.set('arrow-up-right', ArrowUpRight)
  r.set('award', Award)
  r.set('cash', Cash)
  r.set('check', Check)
  r.set('check-circle', CheckCircle)
  r.set('collection-selected', CollectionSelected)
  r.set('credit-card', CreditCard)
  r.set('gift', Gift)
  r.set('home-selected', HomeSelected)
  r.set('icons', Icons)
  r.set('maps', Maps)
  r.set('order-cancel', OrderCancel)
  r.set('order-delivered', OrderDelivered)
  r.set('pasword', Password)
  r.set('percentage', Percentage)
  r.set('pin', Pin)
  r.set('size-chart', SizeChart)
  r.set('star', Star)
  r.set('star-filled', StarFilled)
  r.set('stars', Stars)
  r.set('tags', Tags)
  r.set('x-circle', XCircle)
  r.set('volume-on', VolumeOn)
  r.set('volume-off', VolumeOff)
  r.set('play', Play)
  r.set('pause', Pause)
  r.set('address-book', AddressBook)
  r.set('calender', Calender)
  r.set('contact-us', ContactUs)
  r.set('delivery-and-return', DeliveryAndReturn)
  r.set('easy-return', EasyReturn)
  r.set('home-delivery', HomeDelivery)
  r.set('new-launch', NewLaunch)
  r.set('open', Open)
  r.set('order-history-v2', OrderHistory)
  r.set('change-password', PasswordChange)
  r.set('privacy-policy', PrivacyPolicy)
  r.set('return', Return)
  r.set('shipping-policy', ShippingPolicy)
  r.set('shopping-bag', ShoppingBag)
  r.set('terms-of-service', TermsOfService)
  r.set('trash-v3', TrashV3)
  r.set('truck', Truck)
  r.set('chevron-up-order', ChevronUp)
  r.set('chevron-right-order', ChevronRight)
  registerPostPurchaseIcons(r)
  registerOrdersV5Icons(r)
}
