import AsyncStorage from '@react-native-async-storage/async-storage';
import { readNativeAppCredentials } from './readNativeAppCredentials';
import { sdkLog } from './sdkLogger';

export const MEHERY_X_API_ID_STORAGE_KEY = 'mehery_x_api_id';
export const MEHERY_X_API_KEY_STORAGE_KEY = 'mehery_x_api_key';

const HEADER_X_API_ID = 'x-api-id';
const HEADER_X_API_KEY = 'x-api-key';
const HIDDEN_CREDENTIAL = '***hidden***';

let cachedCredentials: { xApiId: string; xApiKey: string } | null = null;

/** Redact x-api-id / x-api-key before logging; real values still sent on the wire. */
export function redactPushappAuthHeadersForLog(
  headers: Record<string, string>
): Record<string, string> {
  const out = { ...headers };
  if (out[HEADER_X_API_ID]) {
    out[HEADER_X_API_ID] = HIDDEN_CREDENTIAL;
  }
  if (out[HEADER_X_API_KEY]) {
    out[HEADER_X_API_KEY] = HIDDEN_CREDENTIAL;
  }
  return out;
}

export async function pushappAuth(
  appId?: string,
  appSecretKey?: string
): Promise<void> {
  const usedNative = !appId?.trim() || !appSecretKey?.trim();
  let id = appId?.trim();
  let key = appSecretKey?.trim();

  if (!id || !key) {
    const native = await readNativeAppCredentials();
    id = native.xApiId.trim();
    key = native.xApiKey.trim();
  }

  if (!id || !key) {
    throw new Error('pushappAuth requires valid x-api-id and x-api-key');
  }

  const pairs = await AsyncStorage.multiGet([
    MEHERY_X_API_ID_STORAGE_KEY,
    MEHERY_X_API_KEY_STORAGE_KEY,
  ]);
  const storedId = pairs[0]?.[1]?.trim() ?? '';
  const storedKey = pairs[1]?.[1]?.trim() ?? '';

  cachedCredentials = { xApiId: id, xApiKey: key };

  const unchanged = storedId === id && storedKey === key;
  sdkLog.log('[SDK] pushappAuth:', {
    source: usedNative ? 'native' : 'override',
    unchanged,
    ...redactPushappAuthHeadersForLog({
      [HEADER_X_API_ID]: id,
      [HEADER_X_API_KEY]: key,
    }),
  });

  if (unchanged) {
    return;
  }

  await AsyncStorage.multiSet([
    [MEHERY_X_API_ID_STORAGE_KEY, id],
    [MEHERY_X_API_KEY_STORAGE_KEY, key],
  ]);
}

export async function getPushappAuthHeaders(): Promise<Record<string, string>> {
  if (!cachedCredentials) {
    const pairs = await AsyncStorage.multiGet([
      MEHERY_X_API_ID_STORAGE_KEY,
      MEHERY_X_API_KEY_STORAGE_KEY,
    ]);
    const storedId = pairs[0]?.[1]?.trim() ?? '';
    const storedKey = pairs[1]?.[1]?.trim() ?? '';

    if (!storedId || !storedKey) {
      return {};
    }

    cachedCredentials = { xApiId: storedId, xApiKey: storedKey };
  }

  return {
    [HEADER_X_API_ID]: cachedCredentials.xApiId,
    [HEADER_X_API_KEY]: cachedCredentials.xApiKey,
  };
}

export function resetPushappAuthCacheForTests(): void {
  cachedCredentials = null;
}
