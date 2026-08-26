import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { loadMeherySdk } from './sdk'
import {
  clearDeviceLinkFailed,
  isPoisonedLinkError,
  isPoisonedSessionId,
  markDeviceLinkFailed,
  rotatePushAppDeviceIdentity,
} from './sessionGuard'

const HOST_GEO = {
  ip: '103.21.244.0',
  location: { lat: 19.076, lng: 72.8777 },
  country: { iso_code: 'IN', name: 'India' },
  region: { iso_code: 'MH', name: 'Maharashtra' },
  city: { name: 'Mumbai' },
  area: { name: 'Parel' },
}

let recoveryPromise: Promise<boolean> | null = null

function persistableString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function extractRegisterIdentity(data: unknown): {
  userId: string
  sessionId: string
  contactId: string
} {
  if (!data || typeof data !== 'object') {
    return { userId: '', sessionId: '', contactId: '' }
  }
  const root = data as Record<string, unknown>
  const device =
    root.device && typeof root.device === 'object'
      ? (root.device as Record<string, unknown>)
      : {}
  const userId = persistableString(device.user_id)
  const contactId = persistableString(device.contact_id)
  const sessionId =
    persistableString(device.session_id) ||
    persistableString(root.session_id) ||
    persistableString(root.sessionId)
  return { userId, sessionId, contactId }
}

async function getApiBaseUrlFromStorage(): Promise<string> {
  const tenant = (await AsyncStorage.getItem('mehery_tenant'))?.trim() || 'ecommerce'
  const host =
    (await AsyncStorage.getItem('mehery_pushapp_host_root'))?.trim() || 'pushapp.ai'
  return `https://${tenant}.${host}/pushapp/api`
}

async function persistRegisterSuccess(params: {
  deviceId: string
  token: string
  fcmToken: string
  channelId: string
  data: unknown
}): Promise<boolean> {
  const { userId, sessionId, contactId } = extractRegisterIdentity(params.data)
  if (!userId) {
    console.warn(
      '[Mehery] Host re-register returned no device.user_id — cannot recover /device/link'
    )
    return false
  }
  if (isPoisonedSessionId(sessionId)) {
    console.warn(
      '[Mehery] Host re-register still returned MD5 session_id:',
      sessionId
    )
    return false
  }

  const pairs: Array<[string, string]> = [
    ['registered_user_id', userId],
    ['isRegistered', 'true'],
    ['UserRegistered', 'true'],
    ['lastRegisteredToken', params.token],
    [
      'lastRegisteredState',
      JSON.stringify({
        token: params.token,
        fcmToken: params.fcmToken,
        device_id: params.deviceId,
        channel_id: params.channelId,
        platform: Platform.OS,
      }),
    ],
  ]
  if (sessionId) pairs.push(['sessionId', sessionId])
  if (contactId) pairs.push(['contact_id', contactId])
  if (params.channelId) {
    pairs.push(['mehery_registered_channel_id', params.channelId])
  }
  if (params.fcmToken) pairs.push(['fcmToken', params.fcmToken])
  await AsyncStorage.multiSet(pairs)
  console.log('[Mehery] Host re-register ok', {
    userId,
    sessionId: sessionId || '(none)',
    deviceId: params.deviceId,
  })
  return true
}

/**
 * POST /device/register for the current device_id using the stored push token.
 * Bypasses the SDK 15s register cooldown so login recovery can run immediately.
 */
async function hostRegisterCurrentDevice(): Promise<boolean> {
  const [
    deviceId,
    channelId,
    apnsToken,
    lastToken,
    fcmToken,
    apiId,
    apiKey,
  ] = await AsyncStorage.multiGet([
    'device_id',
    'mehery_channel_id',
    'APNStoken',
    'lastRegisteredToken',
    'fcmToken',
    'mehery_x_api_id',
    'mehery_x_api_key',
  ]).then((entries) => entries.map(([_, value]) => value?.trim() ?? ''))

  const token = apnsToken || lastToken || fcmToken
  if (!deviceId || !channelId || !token || !apiId || !apiKey) {
    console.warn('[Mehery] Host re-register skipped — missing device, channel, token, or credentials')
    return false
  }

  const apiBaseUrl = await getApiBaseUrlFromStorage()
  const payload: Record<string, unknown> = {
    device_id: deviceId,
    channel_id: channelId,
    platform: Platform.OS,
    token,
    geoIP: HOST_GEO,
  }
  if (Platform.OS === 'ios' && fcmToken && fcmToken !== token) {
    payload.fcm_token = fcmToken
  }

  const response = await fetch(`${apiBaseUrl}/device/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-id': apiId,
      'x-api-key': apiKey,
      'X-Device-ID': deviceId,
    },
    body: JSON.stringify(payload),
  })
  const text = await response.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }

  if (!response.ok && !/device already exists/i.test(text)) {
    console.warn(
      '[Mehery] Host re-register failed',
      response.status,
      text.slice(0, 300)
    )
    return false
  }

  return persistRegisterSuccess({
    deviceId,
    token,
    fcmToken,
    channelId,
    data,
  })
}

async function runDeviceLinkRecovery(reason: string): Promise<boolean> {
  await markDeviceLinkFailed()
  const nextId = await rotatePushAppDeviceIdentity(reason)
  const sdk = await loadMeherySdk()
  if (typeof sdk.resetCachedDeviceId === 'function') {
    sdk.resetCachedDeviceId()
  } else {
    console.warn(
      '[Mehery] resetCachedDeviceId unavailable — new device_id may not apply until reload'
    )
  }
  // Keep storage and in-memory cache on the same id if cache reset failed.
  await AsyncStorage.setItem('device_id', nextId)

  const registered = await hostRegisterCurrentDevice()
  if (!registered) {
    return false
  }
  await clearDeviceLinkFailed()
  return true
}

/**
 * Rotate the poisoned device, re-register, and leave a valid ObjectId session
 * so the next OnUserLogin `/device/link` can succeed.
 */
export async function recoverFromFailedDeviceLink(
  error?: string | null
): Promise<boolean> {
  if (recoveryPromise) {
    return recoveryPromise
  }

  const reason = isPoisonedLinkError(error)
    ? `OnUserLogin /device/link failed: ${error}`
    : `OnUserLogin failed, forcing fresh device: ${error ?? 'unknown'}`

  recoveryPromise = runDeviceLinkRecovery(reason).finally(() => {
    recoveryPromise = null
  })
  return recoveryPromise
}

export { isPoisonedLinkError }
