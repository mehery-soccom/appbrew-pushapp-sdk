import AsyncStorage from '@react-native-async-storage/async-storage'

import { getChannelAlias, getChannelId, getTenant } from './config'

/** Channel the SDK example app writes; always treated as stale. */
const SDK_EXAMPLE_CHANNEL_ALIAS = '1780031354415'

/** Full id plus the numeric segment the SDK may persist via extractChannelSegment. */
function pinnedChannelAliases(): Set<string> {
  return new Set([getChannelId(), getChannelAlias()])
}

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
  if (pinnedChannelAliases().has(v)) return false
  return true
}

function lastStateHasWrongChannel(lastState: string): boolean {
  if (!lastState) return false
  if (lastState.includes(SDK_EXAMPLE_CHANNEL_ALIAS)) {
    return true
  }
  if (lastState.includes(getChannelId()) || lastState.includes(getChannelAlias())) {
    return false
  }
  return lastState.includes('"channel_id"')
}

/**
 * Force AsyncStorage onto the configured channel before any SDK read.
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
    console.warn('[Mehery] Pinning PushApp channel to', getChannelId(), {
      wasChannel: channelId || '(empty)',
      wasRegistered: registered || '(empty)',
      wasTenant: tenant || '(empty)',
    })
    await AsyncStorage.multiRemove(REGISTRATION_CACHE_KEYS)
  }

  const pairs: Array<[string, string]> = [
    ['mehery_channel_id', getChannelId()],
    ['mehery_tenant', getTenant()],
  ]
  if (
    registered &&
    pinnedChannelAliases().has(registered) &&
    registered !== getChannelId()
  ) {
    pairs.push(['mehery_registered_channel_id', getChannelId()])
  }
  await AsyncStorage.multiSet(pairs)
}
