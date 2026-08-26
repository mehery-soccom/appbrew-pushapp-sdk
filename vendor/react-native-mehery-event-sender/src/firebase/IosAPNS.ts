import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { buildCommonHeaders } from '../helpers/buildCommonHeaders';
import { extractChannelSegment, getApiBaseUrl } from '../helpers/tenantContext';
import { getDeviceId, resetCachedDeviceId } from '../utils/device';
import { waitForGeoIp } from '../utils/geoIpContext';
import { sdkLog } from '../helpers/sdkLogger';
import {
  hasStoredGuestUserId,
  persistRegisterIdentity,
  persistRegisteredChannelId,
  SESSION_ID_STORAGE_KEY,
} from '../utils/user';
import {
  guestUserIdFromRegisterResponse,
  tryParseRegisterResponse,
} from '../utils/registerResponse';
import messaging from '@react-native-firebase/messaging';

let deviceRegistrationInProgress = false;
let lastApiCallTime = 0;
const API_CALL_COOLDOWN_MS = 15000; // 15 seconds
const MAX_DEVICE_REGISTER_RETRIES = 4;
const DEVICE_REGISTER_RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 15_000];
const SCHEDULED_REGISTER_RETRY_DELAYS_MS = [30_000, 60_000, 120_000];

let scheduledRegisterRetryTimer: ReturnType<typeof setTimeout> | null = null;
let scheduledRegisterRetryAttempt = 0;

const registerDelay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function isRetryableRegisterHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function clearScheduledRegisterRetry() {
  if (scheduledRegisterRetryTimer) {
    clearTimeout(scheduledRegisterRetryTimer);
    scheduledRegisterRetryTimer = null;
  }
  scheduledRegisterRetryAttempt = 0;
}

function scheduleRegisterRetry(token: string) {
  if (
    scheduledRegisterRetryAttempt >= SCHEDULED_REGISTER_RETRY_DELAYS_MS.length
  ) {
    sdkLog.warn(
      '[SDK][Register][iOS] Giving up after scheduled background retries.'
    );
    return;
  }

  const delayMs =
    SCHEDULED_REGISTER_RETRY_DELAYS_MS[scheduledRegisterRetryAttempt] ??
    120_000;
  scheduledRegisterRetryAttempt += 1;

  if (scheduledRegisterRetryTimer) {
    clearTimeout(scheduledRegisterRetryTimer);
  }

  sdkLog.warn(
    `[SDK][Register][iOS] Scheduling background retry ${scheduledRegisterRetryAttempt}/${SCHEDULED_REGISTER_RETRY_DELAYS_MS.length} in ${Math.round(delayMs / 1000)}s`
  );

  scheduledRegisterRetryTimer = setTimeout(() => {
    scheduledRegisterRetryTimer = null;
    (async () => {
      const isRegistered = await AsyncStorage.getItem('isRegistered');
      if (isRegistered === 'true') {
        clearScheduledRegisterRetry();
        return;
      }
      await registerDeviceWithAPNS(token, { fromScheduledRetry: true });
    })().catch((err) => {
      sdkLog.warn('[SDK][Register][iOS] Scheduled retry failed', err);
    });
  }, delayMs);
}

async function postDeviceRegistration(
  apiBaseUrl: string,
  commonHeaders: Record<string, string>,
  payload: Record<string, unknown>
) {
  const response = await fetch(`${apiBaseUrl}/device/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...commonHeaders,
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();

  return { response, text };
}

async function persistRegistrationState(params: {
  token: string;
  fcmToken: string | null;
  currentState: string;
}) {
  const valuesToStore: [string, string][] = [
    ['APNStoken', params.token],
    ['fcmToken', params.fcmToken ?? ''],
    ['lastRegisteredToken', params.token],
    ['lastRegisteredState', params.currentState],
    ['UserRegistered', 'true'],
    ['isRegistered', 'true'],
  ];

  await AsyncStorage.multiSet(valuesToStore);
}

async function cacheRegistrationTokens(params: {
  token: string;
  fcmToken: string | null;
}) {
  await AsyncStorage.multiSet([
    ['APNStoken', params.token],
    ['fcmToken', params.fcmToken ?? ''],
  ]);
}

/**
 * Registers the device with APNS / push server.
 * Ensures registration only happens when needed and not repeatedly.
 */
export async function registerDeviceWithAPNS(
  token: string,
  options?: { fromScheduledRetry?: boolean }
) {
  if (!token) {
    sdkLog.warn('⚠️ No token provided, skipping registration.');
    return;
  }

  if (deviceRegistrationInProgress) {
    sdkLog.log(
      'ℹ️ Device registration already in progress. Skipping duplicate call.'
    );
    return;
  }

  deviceRegistrationInProgress = true;

  try {
    if (!options?.fromScheduledRetry) {
      const now = Date.now();
      if (lastApiCallTime && now - lastApiCallTime < API_CALL_COOLDOWN_MS) {
        const waitTime = Math.ceil(
          (API_CALL_COOLDOWN_MS - (now - lastApiCallTime)) / 1000
        );
        sdkLog.log(`⏳ Cooldown active. Wait ${waitTime}s before retrying.`);
        return;
      }
    }

    const [, , lastServerToken, lastRegisteredState] =
      await AsyncStorage.multiGet([
        SESSION_ID_STORAGE_KEY,
        'contact_id',
        'lastRegisteredToken',
        'lastRegisteredState',
      ]).then((entries) => entries.map(([_, v]) => v));
    sdkLog.log('last servertoken:', lastServerToken);

    let device_id = await getDeviceId();

    // Fetch FCM token safely
    let fcmToken: string | null = null;
    try {
      fcmToken = await messaging().getToken();
      sdkLog.log('📲 Fetched iOS FCM Token:', fcmToken);
    } catch (e) {
      sdkLog.warn('⚠️ Could not fetch FCM token on iOS', e);
    }

    await cacheRegistrationTokens({ token, fcmToken });

    const channel_id = (await AsyncStorage.getItem('mehery_channel_id')) ?? '';
    sdkLog.log('channel id at custom:', channel_id);

    // Device registration should only care about token/device identity.
    // Login/session changes are handled separately by /device/link.
    const buildCurrentState = () =>
      JSON.stringify({
        token,
        fcmToken,
        device_id,
        channel_id,
        platform: Platform.OS,
      });

    let currentState = buildCurrentState();

    if (lastRegisteredState === currentState) {
      if (await hasStoredGuestUserId()) {
        sdkLog.log('✅ Registration already valid. Skipping re-register.');
        await AsyncStorage.setItem('isRegistered', 'true');
        clearScheduledRegisterRetry();
        return;
      }
      sdkLog.log(
        '[SDK][Register][iOS] Re-registering: registered_user_id missing from storage.'
      );
    }

    const geoIP = await waitForGeoIp();
    let payload = {
      device_id,
      channel_id: channel_id,
      platform: Platform.OS,
      token,
      fcm_token: fcmToken,
      geoIP,
    };
    sdkLog.log('📡 Registering/updating device...', payload);
    const commonHeaders = await buildCommonHeaders();
    const apiBaseUrl = await getApiBaseUrl();

    let response: Response | null = null;
    let text = '';
    let lastStatus = 0;

    let rotatedForExistsConflict = false;

    for (let attempt = 1; attempt <= MAX_DEVICE_REGISTER_RETRIES; attempt++) {
      sdkLog.log(
        `[SDK][Register][iOS] Attempt ${attempt}/${MAX_DEVICE_REGISTER_RETRIES}`
      );

      const attemptResult = await postDeviceRegistration(
        apiBaseUrl,
        commonHeaders,
        payload
      );
      response = attemptResult.response;
      text = attemptResult.text;
      lastStatus = response.status;

      const parsedChannelSegment = extractChannelSegment(channel_id);
      const shouldRetryWithParsedChannel =
        !response.ok &&
        response.status >= 500 &&
        parsedChannelSegment &&
        parsedChannelSegment !== channel_id &&
        /non-existent collection in transaction/i.test(text);

      if (shouldRetryWithParsedChannel) {
        sdkLog.warn(
          `⚠️ /device/register failed for full identifier, retrying with parsed channel segment: ${parsedChannelSegment}`
        );
        payload.channel_id = parsedChannelSegment;
        const retryResult = await postDeviceRegistration(
          apiBaseUrl,
          commonHeaders,
          payload
        );
        response = retryResult.response;
        text = retryResult.text;
        lastStatus = response.status;
        sdkLog.log('Retry response text:', text);
      }

      if (response.ok) {
        break;
      }

      if (/device already exists/i.test(text)) {
        const parsed = tryParseRegisterResponse(text);
        if (parsed) {
          await persistRegisterIdentity(parsed);
        }
        const guestUserId = guestUserIdFromRegisterResponse(parsed ?? {});
        const hasGuestId =
          guestUserId.length > 0 || (await hasStoredGuestUserId());
        if (hasGuestId) {
          sdkLog.warn(
            'ℹ️ Device already exists on server. Treating registration as valid.'
          );
          await persistRegistrationState({
            token,
            fcmToken,
            currentState,
          });
          await persistRegisteredChannelId(
            String(payload.channel_id ?? channel_id ?? '')
          );
          lastApiCallTime = Date.now();
          clearScheduledRegisterRetry();
          return;
        }
        if (!rotatedForExistsConflict) {
          rotatedForExistsConflict = true;
          sdkLog.warn(
            '[SDK][Register][iOS] Device exists but guest user_id missing; rotating device_id.'
          );
          await AsyncStorage.removeItem('device_id');
          resetCachedDeviceId();
          device_id = await getDeviceId();
          currentState = buildCurrentState();
          payload = {
            device_id,
            channel_id,
            platform: Platform.OS,
            token,
            fcm_token: fcmToken,
            geoIP,
          };
          continue;
        }
        throw new Error(
          `Device already exists but server returned no guest user_id: ${text.slice(0, 200)}`
        );
      }

      if (
        isRetryableRegisterHttpStatus(response.status) &&
        attempt < MAX_DEVICE_REGISTER_RETRIES
      ) {
        const waitMs = DEVICE_REGISTER_RETRY_DELAYS_MS[attempt - 1] ?? 15_000;
        sdkLog.warn(
          `[SDK][Register][iOS] HTTP ${response.status}, retrying in ${waitMs}ms...`
        );
        await registerDelay(waitMs);
        continue;
      }

      throw new Error(
        `HTTP ${response.status}${text ? ` - ${text.slice(0, 200)}` : ''}`
      );
    }

    if (!response?.ok) {
      throw new Error(
        `HTTP ${lastStatus}${text ? ` - ${text.slice(0, 200)}` : ''} after ${MAX_DEVICE_REGISTER_RETRIES} attempts`
      );
    }

    let resData: any = null;
    try {
      resData = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(
        `Device register returned a non-JSON success response: ${text}`
      );
    }
    sdkLog.log('✅ Device registered/updated:', resData);

    lastApiCallTime = Date.now();

    await persistRegisterIdentity(resData);

    await persistRegistrationState({
      token,
      fcmToken,
      currentState,
    });
    await persistRegisteredChannelId(
      String(payload.channel_id ?? channel_id ?? '')
    );

    clearScheduledRegisterRetry();
    return;
  } catch (err) {
    sdkLog.warn('❌ Failed to register/update device:', err);
    await AsyncStorage.multiSet([
      ['isRegistered', 'false'],
      ['UserRegistered', 'false'],
    ]);
    scheduleRegisterRetry(token);
  } finally {
    deviceRegistrationInProgress = false;
  }
}
