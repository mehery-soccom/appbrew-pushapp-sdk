import AsyncStorage from '@react-native-async-storage/async-storage'

/** Client tenant_channel from PushApp dashboard. Never use the SDK example `demo_*` id. */
export const MEHERY_CHANNEL_ID = 'ecommerce_1786525308082'
export const MEHERY_TENANT = 'ecommerce'

/** Full id plus the numeric segment the SDK may persist via extractChannelSegment. */
const PINNED_CHANNEL_ALIASES = new Set([
  MEHERY_CHANNEL_ID,
  '1786525308082',
])

const STALE_CHANNEL_IDS = new Set([
  'demo_1780031354415',
  '1780031354415',
])

const REGISTRATION_CACHE_KEYS = [
  'lastRegisteredState',
  'lastRegisteredToken',
  'isRegistered',
  'UserRegistered',
  'registered_user_id',
  'contact_id',
  'UserLoggedIn',
  'mehery_registered_channel_id',
  'mehery_last_linked_channel_id',
]

function isWrongChannel(value: string | null | undefined): boolean {
  const v = (value ?? '').trim()
  if (!v) return false
  if (PINNED_CHANNEL_ALIASES.has(v)) return false
  if (STALE_CHANNEL_IDS.has(v)) return true
  if (v.startsWith('demo_') || v === 'demo') return true
  return true
}

function lastStateHasWrongChannel(lastState: string): boolean {
  if (!lastState) return false
  if (
    lastState.includes('demo_1780031354415') ||
    lastState.includes('1780031354415')
  ) {
    return true
  }
  if (
    lastState.includes(MEHERY_CHANNEL_ID) ||
    lastState.includes('1786525308082')
  ) {
    return false
  }
  return lastState.includes('"channel_id"')
}

/**
 * Force AsyncStorage onto `ecommerce_1786525308082` before any SDK read.
 * The SDK example app writes `demo_1780031354415`; getEffectiveLinkChannelId
 * prefers `mehery_registered_channel_id`, so a leftover demo id wins over initSdk.
 */
export async function ensureMeheryChannelPinned(): Promise<void> {
  const [channelId, registered, lastLinked, tenant, lastState] =
    await AsyncStorage.multiGet([
      'mehery_channel_id',
      'mehery_registered_channel_id',
      'mehery_last_linked_channel_id',
      'mehery_tenant',
      'lastRegisteredState',
    ]).then((entries) => entries.map(([_, value]) => value?.trim() ?? ''))

  const needsReRegister =
    isWrongChannel(channelId) ||
    isWrongChannel(registered) ||
    isWrongChannel(lastLinked) ||
    tenant === 'demo' ||
    lastStateHasWrongChannel(lastState)

  if (needsReRegister) {
    console.warn('[Mehery] Pinning PushApp channel to', MEHERY_CHANNEL_ID, {
      wasChannel: channelId || '(empty)',
      wasRegistered: registered || '(empty)',
      wasTenant: tenant || '(empty)',
    })
    await AsyncStorage.multiRemove(REGISTRATION_CACHE_KEYS)
  }

  const pairs: Array<[string, string]> = [
    ['mehery_channel_id', MEHERY_CHANNEL_ID],
    ['mehery_tenant', MEHERY_TENANT],
  ]
  if (
    registered &&
    PINNED_CHANNEL_ALIASES.has(registered) &&
    registered !== MEHERY_CHANNEL_ID
  ) {
    pairs.push(['mehery_registered_channel_id', MEHERY_CHANNEL_ID])
  }
  await AsyncStorage.multiSet(pairs)
}
