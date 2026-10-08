import type { ComponentType } from 'react'
import type { GeoIpInput } from '../types/geoIp'
import type { SdkInitEnvironmentParam } from '../helpers/tenantContext'

export type PushAppConfig = {
  /** PushApp channel id from the dashboard, `<tenant>_<number>`. */
  channelId: string
  /** `false` = pushapp.ai (default), `true` = pushapp.net.in, `'development'` = pushapp.co.in. */
  environment?: SdkInitEnvironmentParam
  /** Your app's URL scheme. With `httpsHosts` it rewrites notification https links into in-app links. */
  appScheme?: string
  /** Store hosts whose https links should open in the app, e.g. `['shop.myshopify.com']`. */
  httpsHosts?: string[]
  /** Fallback Shopify domain for product URL enrichment when the app config has none. */
  shopDomain?: string
  /** Optional fixed geo context sent before init. Omit to let the SDK resolve it. */
  geo?: GeoIpInput
  /** Account-page poll placeholder ids. Must match the campaign `placeholder_id`. */
  accountInlinePlaceholderId?: string
  accountTooltipPlaceholderId?: string
  /** Optional extra UI rendered by the account block (demo orders, etc.). */
  accountExtras?: ComponentType
  /** Optional hook called after an add-to-cart press, e.g. to mirror into a local cart. */
  onAddToCart?: (productData: any, quantity: number) => void
}

let current: PushAppConfig | null = null

export function configurePushApp(config: PushAppConfig): void {
  if (!config?.channelId || !config.channelId.includes('_')) {
    throw new Error(
      '[PushApp] channelId must look like "<tenant>_<number>" (copy it from the PushApp dashboard)'
    )
  }
  current = config
}

export function getPushAppConfig(): PushAppConfig {
  if (!current) {
    throw new Error(
      '[PushApp] setupPushApp({ channelId, ... }) must run before the SDK is used'
    )
  }
  return current
}

/** Non-throwing variant for code that may run before setup (tests, headless tasks). */
export function peekPushAppConfig(): PushAppConfig | null {
  return current
}

export const getChannelId = (): string => getPushAppConfig().channelId
/** Tenant is the part of the channel id before the first underscore. */
export const getTenant = (): string => getChannelId().split('_')[0]!
/** Numeric part of the channel id (the SDK may persist it alone). */
export const getChannelAlias = (): string =>
  getChannelId().split('_').slice(1).join('_')
export const getEnvironment = (): SdkInitEnvironmentParam =>
  getPushAppConfig().environment ?? false
