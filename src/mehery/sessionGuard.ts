import AsyncStorage from '@react-native-async-storage/async-storage'
import { ensureMeheryChannelPinned } from './channelPin'

/**
 * PushApp SESSION_PUSHAPP._id must be a 24-char Mongo ObjectId.
 * `/update/token` (FCM then APNs) can replace that with a 32-char MD5.
 * `/device/link` then 500s: CastError at path "_id". A new `/device/register`
 * returns a real ObjectId and link succeeds — same payload the example app sends.
 *
 * Must run before any SDK call that reads `device_id` (`setGeoIP` caches it).
 * Push tokens are kept so we can re-register immediately after Metro reload
 * (APNs will not fire again in the same native process).
 */
const DEVICE_ROTATION_KEY = 'mehery_host_device_objectid_v4'
const LAST_LINK_FAILED_KEY = 'mehery_host_last_link_failed'

const MONGO_OBJECT_ID_RE = /^[a-f0-9]{24}$/i
const MD5_HEX_RE = /^[a-f0-9]{32}$/i

/** Identity keys that must not survive a rotation (not credentials, not tokens). */
const DEVICE_IDENTITY_KEYS = [
  'device_id',
  'sessionId',
  'user_id',
  'lastRegisteredState',
  'isRegistered',
  'UserRegistered',
  'registered_user_id',
  'contact_id',
  'UserLoggedIn',
  'mehery_registered_channel_id',
  'mehery_last_linked_channel_id',
  'mehery_last_linked_host_root',
]

export function isMongoObjectId(value: string | null | undefined): boolean {
  return MONGO_OBJECT_ID_RE.test((value ?? '').trim())
}

export function isMd5Hex(value: string | null | undefined): boolean {
  return MD5_HEX_RE.test((value ?? '').trim())
}

export function isPoisonedSessionId(value: string | null | undefined): boolean {
  const session = (value ?? '').trim()
  return Boolean(session) && isMd5Hex(session) && !isMongoObjectId(session)
}

/** `/device/link` 500 CastError on SESSION_PUSHAPP._id (MD5 treated as ObjectId). */
export function isPoisonedLinkError(error?: string | null): boolean {
  if (!error) return false
  const lower = error.toLowerCase()
  return (
    lower.includes('cast to objectid') ||
    lower.includes('session_pushapp') ||
    (lower.includes('status: 500') && lower.includes('objectid')) ||
    (lower.includes('http error') && lower.includes('500'))
  )
}

/** Same shape as the SDK `getDeviceId()` generator. */
function mintDeviceId(): string {
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const n = (Math.random() * 16) | 0
    const v = ch === 'x' ? n : (n & 0x3) | 0x8
    return v.toString(16)
  })
  return `-mehery-${uuid}__${Date.now()}`
}

export async function markDeviceLinkFailed(): Promise<void> {
  await AsyncStorage.setItem(LAST_LINK_FAILED_KEY, '1')
}

export async function clearDeviceLinkFailed(): Promise<void> {
  await AsyncStorage.removeItem(LAST_LINK_FAILED_KEY)
}

export async function rotatePushAppDeviceIdentity(reason: string): Promise<string> {
  const nextId = mintDeviceId()
  console.log('[Mehery] Rotating PushApp device identity:', reason)
  await Promise.all(DEVICE_IDENTITY_KEYS.map((key) => AsyncStorage.removeItem(key)))
  await AsyncStorage.setItem('device_id', nextId)
  await ensureMeheryChannelPinned()
  console.log('[Mehery] New device_id:', nextId)
  return nextId
}

/**
 * Run before `loadMeherySdk` / `setGeoIP` / `initSdk` so `/device/register`
 * mints a device with a valid ObjectId session (fresh example-app install).
 */
export async function rotateStalePushAppDeviceIfNeeded(): Promise<void> {
  const storedSession = (await AsyncStorage.getItem('sessionId'))?.trim() ?? ''
  if (isPoisonedSessionId(storedSession)) {
    await rotatePushAppDeviceIdentity(
      `stored sessionId is 32-char hex, not a Mongo ObjectId (${storedSession})`
    )
    await AsyncStorage.setItem(DEVICE_ROTATION_KEY, '1')
    await AsyncStorage.removeItem(LAST_LINK_FAILED_KEY)
    return
  }

  const lastLinkFailed = (await AsyncStorage.getItem(LAST_LINK_FAILED_KEY)) === '1'
  if (lastLinkFailed) {
    await rotatePushAppDeviceIdentity(
      'previous /device/link failed (CastError / HTTP 500) — mint a fresh device'
    )
    await AsyncStorage.setItem(DEVICE_ROTATION_KEY, '1')
    await AsyncStorage.removeItem(LAST_LINK_FAILED_KEY)
    return
  }

  const alreadyRotated = (await AsyncStorage.getItem(DEVICE_ROTATION_KEY)) === '1'
  if (alreadyRotated) {
    return
  }

  const deviceId = (await AsyncStorage.getItem('device_id'))?.trim() ?? ''
  if (deviceId) {
    await rotatePushAppDeviceIdentity(
      'one-time reset of cached device from earlier init (server session may not be an ObjectId)'
    )
  }
  await AsyncStorage.setItem(DEVICE_ROTATION_KEY, '1')
}
