import messaging from '@react-native-firebase/messaging';
import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import app from '@react-native-firebase/app';
import PushNotification from 'react-native-push-notification';
import { getDeviceId, resetCachedDeviceId } from '../utils/device';
import { attachDeviceInfo } from '../utils/resolveDeviceHeaders';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildCommonHeaders } from '../helpers/buildCommonHeaders';
import { getApiBaseUrl, extractChannelSegment } from '../helpers/tenantContext';
import { waitForGeoIp } from '../utils/geoIpContext';
import { sdkLog } from '../helpers/sdkLogger';
import {
  hasStoredGuestUserId,
  isAcceptableEventUserId,
  persistRegisterIdentity,
  persistRegisteredChannelId,
} from '../utils/user';
import {
  guestUserIdFromRegisterResponse,
  tryParseRegisterResponse,
} from '../utils/registerResponse';
import {
  buildPushTrackBody,
  extractClickTrackToken,
  mergeIosNotificationPayload,
  resolveNotificationUrl,
} from '../utils/pushTrackPayload';
import {
  resolvePushCtaFields,
  type CtaTrackFields,
} from '../utils/ctaTrackPayload';
import { openNotificationLink } from '../utils/notificationLink';
import { updatePushToken } from '../utils/updateToken';
import {
  isSilentKeepAlive,
  replySilentKeepAlive,
} from '../utils/silentKeepAlive';

import { NativeModules, Platform } from 'react-native';
import { ensureAndroidNotificationPermission } from '../native/LiveActivity';

const pushCtaLog = (msg: string, extra?: unknown) => {
  if (extra !== undefined) {
    sdkLog.log(`[PushNotifCTA] ${msg}`, extra);
  } else {
    sdkLog.log(`[PushNotifCTA] ${msg}`);
  }
};

const { LiveActivityModule, PushTokenManager } = NativeModules;

let deviceRegistrationInProgress = false;
let lastApiCallTime: number | null = null;
const API_CALL_COOLDOWN_MS = 5000; // 5s cooldown
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

function isRetryableRegisterError(error: unknown): boolean {
  const msg = String(
    (error as { message?: string })?.message ?? error ?? ''
  ).toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('timeout') ||
    msg.includes('failed to fetch')
  );
}

function clearScheduledRegisterRetry() {
  if (scheduledRegisterRetryTimer) {
    clearTimeout(scheduledRegisterRetryTimer);
    scheduledRegisterRetryTimer = null;
  }
  scheduledRegisterRetryAttempt = 0;
}

function scheduleRegisterRetry(token: string, deviceId: string) {
  if (
    scheduledRegisterRetryAttempt >= SCHEDULED_REGISTER_RETRY_DELAYS_MS.length
  ) {
    sdkLog.warn(
      '[SDK][Register] Giving up after scheduled background retries.'
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
    `[SDK][Register] Scheduling background retry ${scheduledRegisterRetryAttempt}/${SCHEDULED_REGISTER_RETRY_DELAYS_MS.length} in ${Math.round(delayMs / 1000)}s`
  );

  scheduledRegisterRetryTimer = setTimeout(() => {
    scheduledRegisterRetryTimer = null;
    (async () => {
      const isRegistered = await AsyncStorage.getItem('isRegistered');
      if (isRegistered === 'true') {
        clearScheduledRegisterRetry();
        return;
      }
      await registerDeviceWithFCM(token, deviceId, {
        fromScheduledRetry: true,
      });
    })().catch((err) => {
      sdkLog.warn('[SDK][Register] Scheduled retry failed', err);
    });
  }, delayMs);
}

async function postAndroidDeviceRegistration(
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
  const text = await response.text().catch(() => '');
  return { response, text };
}
let foregroundUnsubscribe: null | (() => void) = null;
let openTrackingUnsubscribe: null | (() => void) = null;
let backgroundHandlerRegistered = false;

export type FcmBackgroundMessageListener = (
  remoteMessage: FirebaseMessagingTypes.RemoteMessage
) => void | Promise<void>;

let fcmBackgroundMessageListener: FcmBackgroundMessageListener | null = null;

/** Optional hook for host apps (e.g. notification inbox) on Android background FCM. */
export function setFcmBackgroundMessageListener(
  listener: FcmBackgroundMessageListener | null
): void {
  fcmBackgroundMessageListener = listener;
}
const seenForegroundMessageIds = new Set<string>();
const FOREGROUND_MESSAGE_CACHE_LIMIT = 50;
const seenBackgroundMessageIds = new Set<string>();
const BACKGROUND_MESSAGE_CACHE_LIMIT = 50;

sdkLog.log('💬 Firebase messaging:', messaging);
sdkLog.log('📦 Firebase app exists:', app ? 'Yes' : 'No');

export async function registerDeviceWithFCM(
  token: string,
  deviceId: string,
  options?: { fromScheduledRetry?: boolean }
) {
  if (!token) {
    sdkLog.warn('⚠️ No FCM token provided. Skipping registration.');
    return false;
  }

  // 🧠 Skip if registration already in progress
  if (deviceRegistrationInProgress) {
    sdkLog.log(
      'ℹ️ Registration already in progress — skipping duplicate call.'
    );
    return false;
  }

  // 🧊 Cooldown logic to avoid spamming (skip for scheduled background retries)
  if (!options?.fromScheduledRetry) {
    const now = Date.now();
    if (lastApiCallTime && now - lastApiCallTime < API_CALL_COOLDOWN_MS) {
      const waitTime = Math.ceil(
        (API_CALL_COOLDOWN_MS - (now - lastApiCallTime)) / 1000
      );
      sdkLog.log(`⏳ Cooldown active. Wait ${waitTime}s before retrying.`);
      return false;
    }
  }

  deviceRegistrationInProgress = true;

  try {
    const [storedDeviceId, lastRegisteredToken, lastRegisteredState] =
      await AsyncStorage.multiGet([
        'device_id',
        'lastRegisteredToken',
        'lastRegisteredState',
      ]).then((entries) => entries.map(([_, v]) => v));

    sdkLog.log('last:', lastRegisteredToken);
    // Generate a fallback device_id if not found
    let finalDeviceId = deviceId || storedDeviceId;
    if (!finalDeviceId) {
      finalDeviceId = `${Platform.OS}_${Date.now()}`;
      await AsyncStorage.setItem('device_id', finalDeviceId);
    }

    const channel_id = await AsyncStorage.getItem('mehery_channel_id');

    const buildCurrentState = () =>
      JSON.stringify({
        token,
        deviceId: finalDeviceId,
        channel_id: channel_id ?? '',
        platform: Platform.OS,
      });

    // Include channel_id so a new initSdk identifier triggers re-register on Android.
    let currentState = buildCurrentState();

    // Skip re-register only when state is unchanged and server guest id is stored.
    if (lastRegisteredState === currentState) {
      if (await hasStoredGuestUserId()) {
        sdkLog.log('✅ Registration already valid. Skipping re-register.');
        await AsyncStorage.setItem('isRegistered', 'true');
        clearScheduledRegisterRetry();
        return true;
      }
      sdkLog.log(
        '[SDK][Register] Re-registering: registered_user_id missing from storage.'
      );
    }

    const geoIP = await waitForGeoIp();
    const commonHeaders = await buildCommonHeaders();
    const apiBaseUrl = await getApiBaseUrl();
    let payload: Record<string, unknown> = attachDeviceInfo(
      {
        device_id: finalDeviceId,
        channel_id: channel_id,
        platform: Platform.OS,
        token: token,
        geoIP,
      },
      commonHeaders
    );

    sdkLog.log('📡 Registering device with payload:', payload);

    let lastStatus = 0;
    let lastErrorText = '';
    let rotatedForExistsConflict = false;

    for (let attempt = 1; attempt <= MAX_DEVICE_REGISTER_RETRIES; attempt++) {
      try {
        sdkLog.log(
          `[SDK][Register] Attempt ${attempt}/${MAX_DEVICE_REGISTER_RETRIES}`
        );
        let { response, text } = await postAndroidDeviceRegistration(
          apiBaseUrl,
          commonHeaders,
          payload
        );
        lastStatus = response.status;
        lastErrorText = text;

        const parsedChannelSegment = extractChannelSegment(channel_id ?? '');
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
          payload = {
            ...payload,
            channel_id: parsedChannelSegment,
          };
          const retryResult = await postAndroidDeviceRegistration(
            apiBaseUrl,
            commonHeaders,
            payload
          );
          response = retryResult.response;
          text = retryResult.text;
          lastStatus = response.status;
          lastErrorText = text;
          sdkLog.log('Retry response text:', text);
        }

        if (!response.ok) {
          if (/device already exists/i.test(text)) {
            const parsed = tryParseRegisterResponse(text);
            if (parsed) {
              await persistRegisterIdentity(parsed);
            }
            const guestUserId = guestUserIdFromRegisterResponse(parsed ?? {});
            const hasGuestId =
              isAcceptableEventUserId(guestUserId) ||
              (await hasStoredGuestUserId());
            if (hasGuestId) {
              sdkLog.warn(
                'ℹ️ Device already exists on server. Treating registration as valid.'
              );
              lastApiCallTime = Date.now();
              await AsyncStorage.multiSet([
                ['lastRegisteredToken', token],
                ['lastRegisteredState', currentState],
                ['isRegistered', 'true'],
              ]);
              await persistRegisteredChannelId(
                String(payload.channel_id ?? channel_id ?? '')
              );
              clearScheduledRegisterRetry();
              return true;
            }
            if (!rotatedForExistsConflict) {
              rotatedForExistsConflict = true;
              sdkLog.warn(
                '[SDK][Register] Device exists but guest user_id missing in response; rotating device_id for fresh register.'
              );
              await AsyncStorage.removeItem('device_id');
              resetCachedDeviceId();
              finalDeviceId = await getDeviceId();
              currentState = buildCurrentState();
              payload = attachDeviceInfo(
                {
                  device_id: finalDeviceId,
                  channel_id: channel_id,
                  platform: Platform.OS,
                  token: token,
                  geoIP,
                },
                commonHeaders
              );
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
            const waitMs =
              DEVICE_REGISTER_RETRY_DELAYS_MS[attempt - 1] ?? 15_000;
            sdkLog.warn(
              `[SDK][Register] HTTP ${response.status}, retrying in ${waitMs}ms...`
            );
            await registerDelay(waitMs);
            continue;
          }

          throw new Error(
            `HTTP ${response.status}${text ? ` - ${text.slice(0, 200)}` : ''}`
          );
        }

        let resData: Record<string, unknown> | null = null;
        try {
          resData = text ? JSON.parse(text) : null;
        } catch {
          throw new Error(
            `Device register returned a non-JSON success response: ${text.slice(0, 200)}`
          );
        }
        sdkLog.log('✅ Device registered/updated:', resData);

        lastApiCallTime = Date.now();

        await persistRegisterIdentity(resData);

        await AsyncStorage.multiSet([
          ['lastRegisteredToken', token],
          ['lastRegisteredState', currentState],
          ['isRegistered', 'true'],
        ]);
        await persistRegisteredChannelId(
          String(payload.channel_id ?? channel_id ?? '')
        );
        clearScheduledRegisterRetry();
        return true;
      } catch (err) {
        const retryable = isRetryableRegisterError(err);
        if (attempt < MAX_DEVICE_REGISTER_RETRIES && retryable) {
          const waitMs = DEVICE_REGISTER_RETRY_DELAYS_MS[attempt - 1] ?? 15_000;
          sdkLog.warn(
            `[SDK][Register] Network error, retrying in ${waitMs}ms...`,
            err
          );
          await registerDelay(waitMs);
          continue;
        }
        throw err;
      }
    }

    throw new Error(
      `HTTP ${lastStatus}${lastErrorText ? ` - ${lastErrorText.slice(0, 200)}` : ''} after ${MAX_DEVICE_REGISTER_RETRIES} attempts`
    );
  } catch (err) {
    sdkLog.warn('❌ Failed to register/update device:', err);
    await AsyncStorage.setItem('isRegistered', 'false');
    scheduleRegisterRetry(token, deviceId || (await getDeviceId()));
    return false;
  } finally {
    deviceRegistrationInProgress = false;
  }
}

export async function requestUserPermission(): Promise<void> {
  if (Platform.OS === 'ios') {
    try {
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (enabled) {
        sdkLog.log('✅ iOS notification permission granted:', authStatus);
      } else {
        sdkLog.warn('❌ iOS notification permission denied');
      }
    } catch {
      // Not iOS Firebase messaging
    }
    return;
  }

  if (Platform.OS === 'android') {
    const granted = await ensureAndroidNotificationPermission();
    if (granted) {
      sdkLog.log('✅ Android POST_NOTIFICATIONS permission granted');
    } else {
      sdkLog.warn('❌ Android POST_NOTIFICATIONS permission denied');
    }
  }
}

const MAX_FCM_TOKEN_RETRIES = 4;
const RETRY_DELAY_MS = 2000;
const MAX_CAROUSEL_IMAGES = 4;

function looksLikeHttpImageUrl(s: string): boolean {
  const t = s.trim();
  if (!t) {
    return false;
  }
  const u = t.startsWith('@') ? t.slice(1).trim() : t;
  return u.startsWith('http://') || u.startsWith('https://');
}

/** Prefer http(s) when several keys are set (bulk may send a bad value under `image` and a real URL under `image_url`). */
function resolveSingleImageFromData(data: Record<string, any>): string | null {
  const keys = ['image', 'imageUrl', 'image_url'] as const;
  const values: string[] = [];
  for (const key of keys) {
    const value = data?.[key];
    if (typeof value === 'string' && value.trim()) {
      values.push(value.trim());
    }
  }
  if (values.length === 0) {
    return null;
  }
  const best = values.find((v) => looksLikeHttpImageUrl(v));
  return best ?? values[0] ?? null;
}

function parseImageListRaw(raw: unknown): string[] {
  if (raw == null) {
    return [];
  }
  if (Array.isArray(raw)) {
    return raw
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }
  if (typeof raw !== 'string') {
    try {
      return parseImageListRaw(JSON.stringify(raw));
    } catch {
      return [];
    }
  }
  const input = raw.trim();
  if (!input) {
    return [];
  }
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean);
    }
  } catch (_err) {}
  return input
    .split(',')
    .map((item) => item.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

function parseJsonObjectRecord(raw: unknown): Record<string, any> | null {
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, any>;
  }
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, any>;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Root payload plus PushApp `style` / `templateData` nests (same shape as CTA URL resolution). */
function recordsToScanForImages(data: Record<string, any>): Record<string, any>[] {
  const out: Record<string, any>[] = [data];
  const pushObj = (raw: unknown) => {
    const obj = parseJsonObjectRecord(raw);
    if (obj) out.push(obj);
  };
  pushObj(data.style);
  const templateData = parseJsonObjectRecord(data.templateData);
  if (templateData) {
    out.push(templateData);
    pushObj(templateData.style);
  }
  const template = parseJsonObjectRecord(data.template);
  if (template) {
    out.push(template);
    pushObj(template.style);
    pushObj(template.data);
  }
  return out;
}

function extractIndexedImageList(data: Record<string, any>): string[] {
  const indexed: string[] = [];
  for (let i = 1; i <= 20; i++) {
    const value = data?.[`image${i}`];
    if (typeof value !== 'string') {
      if (i === 1) continue;
      break;
    }
    const trimmed = value.trim();
    if (trimmed) indexed.push(trimmed);
  }
  return indexed;
}

function resolveImageListFromData(data: Record<string, any>): string[] {
  const listKeys = [
    'imageUrls',
    'image_urls',
    'carousel_images',
    'images',
    'media-url',
  ];
  const candidates: string[][] = [];
  for (const record of recordsToScanForImages(data)) {
    for (const key of listKeys) {
      const normalized = parseImageListRaw(record?.[key]);
      if (normalized.length > 0) {
        candidates.push(normalized);
      }
    }
    const indexed = extractIndexedImageList(record);
    if (indexed.length > 0) {
      candidates.push(indexed);
    }
  }

  const longest = candidates.reduce<string[]>(
    (best, list) => (list.length > best.length ? list : best),
    []
  );
  if (longest.length >= 2) {
    return Array.from(new Set(longest));
  }

  const unique: string[] = [];
  for (const list of candidates) {
    for (const url of list) {
      if (!unique.includes(url)) unique.push(url);
    }
  }
  const single = resolveSingleImageFromData(data);
  if (single && !unique.includes(single)) unique.push(single);
  return unique;
}

function normalizedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function resolvePushNotificationText(
  remoteMessage: { notification?: { title?: string; body?: string } },
  data: Record<string, unknown>
): { title: string; message: string } {
  return {
    title: normalizedString(remoteMessage.notification?.title ?? data.title),
    message: normalizedString(remoteMessage.notification?.body ?? data.body),
  };
}

type ForegroundCtaPair = { title: string; url: string };

function parseCtaButtonsJson(raw: unknown): ForegroundCtaPair[] {
  if (raw == null) return [];
  let text = '';
  if (typeof raw === 'string') {
    text = raw.trim();
  } else {
    try {
      text = JSON.stringify(raw);
    } catch {
      return [];
    }
  }
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    const arr: unknown[] = Array.isArray(parsed)
      ? parsed
      : parsed &&
          typeof parsed === 'object' &&
          Array.isArray((parsed as { buttons?: unknown }).buttons)
        ? ((parsed as { buttons: unknown[] }).buttons as unknown[])
        : parsed &&
            typeof parsed === 'object' &&
            Array.isArray((parsed as { items?: unknown }).items)
          ? ((parsed as { items: unknown[] }).items as unknown[])
          : [];
    const labelKeys = ['title', 'label', 'text', 'name', 'buttonTitle'];
    const urlKeys = [
      'url',
      'link',
      'href',
      'deepLink',
      'deeplink',
      'targetUrl',
      'target_url',
      'action_url',
      'cta_url',
    ];
    const out: ForegroundCtaPair[] = [];
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const title = labelKeys
        .map((k) => normalizedString(o[k]))
        .find((s) => s.length > 0);
      const url = urlKeys
        .map((k) => normalizedString(o[k]))
        .find((s) => s.length > 0);
      if (url) {
        const label =
          title ||
          (out.length === 0 ? 'Open' : out.length === 1 ? 'View' : 'More');
        out.push({ title: label, url });
      }
      if (out.length >= 3) break;
    }
    return out;
  } catch {
    return [];
  }
}

function extractForegroundCtaPairs(
  data: Record<string, any>
): ForegroundCtaPair[] {
  const fromButtons = parseCtaButtonsJson(data.cta_buttons);
  if (fromButtons.length > 0) return fromButtons;
  const pairs: ForegroundCtaPair[] = [];
  const add = (titleKey: string, urlKey: string, defaultTitle: string) => {
    const url = normalizedString(data[urlKey]);
    if (!url) return;
    const title = normalizedString(data[titleKey]) || defaultTitle;
    pairs.push({ title, url });
  };
  add('title1', 'url1', 'Open');
  add('title2', 'url2', 'View');
  add('title3', 'url3', 'More');
  add('button1_title', 'button1_url', 'Open');
  add('button2_title', 'button2_url', 'View');
  add('button3_title', 'button3_url', 'More');
  add('cta1_title', 'cta1_url', 'Open');
  add('cta2_title', 'cta2_url', 'View');
  add('cta3_title', 'cta3_url', 'More');
  return pairs;
}

/**
 * For foreground local notifications: map both visible labels (Save, Submit) and
 * server action ids (PUSHAPP_SAVE, …) to the same url so taps resolve even if the
 * OS passes the action id string instead of the label.
 */
function buildForegroundActionUrlMap(
  data: Record<string, any>
): Record<string, string> {
  const pairs = extractForegroundCtaPairs(data);
  const map: Record<string, string> = {};
  for (const p of pairs) {
    if (p.title && p.url) map[p.title] = p.url;
  }
  const idKeys: Array<'action1' | 'action2' | 'action3'> = [
    'action1',
    'action2',
    'action3',
  ];
  for (let i = 0; i < pairs.length && i < idKeys.length; i++) {
    const pair = pairs[i];
    const key = idKeys[i];
    if (!pair || !key) continue;
    const id = normalizedString(data[key]);
    if (id) map[id] = pair.url;
  }
  return map;
}

function resolveForegroundCtaUrl(
  actionRaw: string,
  data: Record<string, any>,
  actionMap: Record<string, string>
): string | undefined {
  const action = String(actionRaw).trim();
  if (!action) return undefined;
  const mapped = actionMap[action];
  if (typeof mapped === 'string' && mapped.trim()) return mapped.trim();

  const a1 = normalizedString(data.action1);
  const a2 = normalizedString(data.action2);
  const a3 = normalizedString(data.action3);
  if (action === a1) {
    const u = normalizedString(data.url1);
    if (u) return u;
  }
  if (action === a2) {
    const u = normalizedString(data.url2);
    if (u) return u;
  }
  if (action === a3) {
    const u = normalizedString(data.url3);
    if (u) return u;
  }

  const t1 = normalizedString(data.title1);
  const t2 = normalizedString(data.title2);
  if (action === t1) {
    const u = normalizedString(data.url1);
    if (u) return u;
  }
  if (action === t2) {
    const u = normalizedString(data.url2);
    if (u) return u;
  }

  if (
    (action === '0' || action === 'ACTION_0') &&
    normalizedString(data.url1)
  ) {
    return normalizedString(data.url1);
  }
  if (
    (action === '1' || action === 'ACTION_1') &&
    normalizedString(data.url2)
  ) {
    return normalizedString(data.url2);
  }
  return undefined;
}

function shouldUseNativeStyledPath(data: Record<string, any>): boolean {
  const hasLiveTriplet =
    normalizedString(data.message1) &&
    normalizedString(data.message2) &&
    normalizedString(data.message3);
  if (hasLiveTriplet) return true;
  const styleKeys = [
    'tapText',
    'titleColorHex',
    'messageColorHex',
    'tapTextColorHex',
    'backgroundColorHex',
    'bg_color_gradient',
    'bg_color_gradient_dir',
    'align',
    'progressPercent',
    'progressColorHex',
  ];
  return styleKeys.some((k) => normalizedString(data[k]));
}

function getPushTrackBaseUrl(data: Record<string, any>): string {
  const explicit = normalizedString(data.track_base_url);
  if (explicit) return explicit;
  const apiBase = normalizedString(data.api_base_url);
  if (apiBase) return apiBase;
  return '';
}

async function trackPushEvent(
  eventType: 'opened' | 'cta',
  data: Record<string, any>,
  cta?: CtaTrackFields
): Promise<void> {
  const merged = mergeIosNotificationPayload(data as Record<string, unknown>);
  let baseUrl = getPushTrackBaseUrl(merged as Record<string, any>);
  if (!baseUrl) {
    try {
      baseUrl = (await getApiBaseUrl()).trim();
    } catch {
      baseUrl = '';
    }
  }
  if (!baseUrl) {
    sdkLog.log(
      '[PushTrack] skipped (no track_base_url / api_base_url in payload and getApiBaseUrl empty)',
      eventType
    );
    return;
  }

  if (!extractClickTrackToken(merged)) {
    sdkLog.log(
      '[PushTrack] skipped (missing click token t / click_token in payload)',
      eventType
    );
    return;
  }

  const payload = buildPushTrackBody(
    eventType,
    merged,
    cta ? { cta } : undefined
  );

  try {
    const commonHeaders = await buildCommonHeaders();
    const endpoint = `${baseUrl.replace(/\/$/, '')}/v1/notification/push/track`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...commonHeaders,
      },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      sdkLog.log('[PushTrack]', eventType, 'HTTP', res.status);
    } else {
      sdkLog.log('[PushTrack]', eventType, 'HTTP', res.status, '(not ok)');
    }
  } catch (err) {
    sdkLog.log('[PushTrack] non-blocking track failed:', eventType, err);
  }
}

/**
 * Register the FCM background handler (logging + local notification display). Safe to call from
 * `index.js` before `AppRegistry` so the handler is installed as early as RN Firebase recommends;
 * `configurePushNotifications` also calls this (no-op if already registered).
 */
export function registerFcmBackgroundHandler(): void {
  ensureBackgroundMessageHandlerRegistered();
}

export async function handleBackgroundFcmMessage(
  remoteMessage: FirebaseMessagingTypes.RemoteMessage
): Promise<void> {
  let serialized = '';
  try {
    serialized = JSON.stringify(remoteMessage);
  } catch {
    try {
      serialized = JSON.stringify({
        messageId: remoteMessage?.messageId,
        from: remoteMessage?.from,
        data: remoteMessage?.data,
        notification: remoteMessage?.notification,
      });
    } catch {
      serialized = '(could not serialize remoteMessage)';
    }
  }
  sdkLog.log('📨 Background FCM message:', serialized);

  const messageId = remoteMessage?.messageId || '';
  if (messageId && seenBackgroundMessageIds.has(messageId)) {
    sdkLog.log('⏭️ Duplicate background FCM message ignored:', messageId);
    return;
  }
  if (messageId) {
    seenBackgroundMessageIds.add(messageId);
    if (seenBackgroundMessageIds.size > BACKGROUND_MESSAGE_CACHE_LIMIT) {
      const oldest = seenBackgroundMessageIds.values().next().value as
        | string
        | undefined;
      if (oldest) seenBackgroundMessageIds.delete(oldest);
    }
  }

  const data = remoteMessage.data || {};

  if (isSilentKeepAlive(data) || isSilentKeepAlive(remoteMessage)) {
    await replySilentKeepAlive({
      ...data,
      messageId: remoteMessage?.messageId,
    });
    return;
  }

  if (fcmBackgroundMessageListener) {
    try {
      await fcmBackgroundMessageListener(remoteMessage);
    } catch (e) {
      sdkLog.warn('[SDK] FCM background listener failed (non-fatal):', e);
    }
  }

  const { title, message } = resolvePushNotificationText(remoteMessage, data);

  const image =
    remoteMessage.notification?.android?.imageUrl ||
    remoteMessage.notification?.image ||
    resolveSingleImageFromData(data) ||
    null;

  if (Platform.OS === 'android') {
    sdkLog.log(
      '📲 Android background: native MyFirebaseMessagingService builds the tray notification; this log matches foreground field resolution (JS runs for data/headless messages).'
    );
  }
  sdkLog.log('📲 Displaying local notification:', title, message, image);

  const actionPairs = extractForegroundCtaPairs(data);
  if (actionPairs.length > 0) {
    const actionTitles = actionPairs.map((item) => item.title as string);
    const actionMap = buildForegroundActionUrlMap(data);
    const actionMapJson = JSON.stringify(actionMap);
    try {
      pushCtaLog('background FCM (JS) parsed CTAs — actions shown by native', {
        actions: actionTitles,
        pairs: actionPairs.map((p) => ({ title: p.title, url: p.url })),
        actionMapJson,
      });
    } catch (e) {
      pushCtaLog('log background CTA payload failed', e);
    }
  }
}

function ensureBackgroundMessageHandlerRegistered(): void {
  if (backgroundHandlerRegistered) return;
  backgroundHandlerRegistered = true;
  try {
    messaging().setBackgroundMessageHandler(handleBackgroundFcmMessage);
  } catch (e) {
    sdkLog.warn(
      '[SDK] setBackgroundMessageHandler skipped (already registered at host index):',
      e
    );
  }
}

function isRetryableFcmError(error: unknown): boolean {
  const msg = String(
    (error as { message?: string })?.message ?? error ?? ''
  ).toLowerCase();
  return (
    msg.includes('service_not_available') ||
    msg.includes('timeout') ||
    msg.includes('internal_error') ||
    msg.includes('network')
  );
}

/**
 * Get the current device's FCM token with retry logic.
 * SERVICE_NOT_AVAILABLE is often transient; we retry with exponential backoff.
 */
export async function getFcmToken(): Promise<string | null> {
  for (let attempt = 1; attempt <= MAX_FCM_TOKEN_RETRIES; attempt++) {
    try {
      const token = await messaging().getToken();
      if (token) {
        sdkLog.log('📲 FCM Token:', token);
        const id = await getDeviceId();
        sdkLog.log('✅ Device is being registered with ID:', id);
        await AsyncStorage.setItem('device_id', id);
        await registerDeviceWithFCM(token, id);
        messaging().onTokenRefresh((newToken) => {
          updatePushToken(newToken);
        });
        return token;
      }
    } catch (error) {
      const retryable = isRetryableFcmError(error);
      sdkLog.error(
        `Error getting FCM token (attempt ${attempt}/${MAX_FCM_TOKEN_RETRIES}):`,
        error
      );

      if (attempt < MAX_FCM_TOKEN_RETRIES && retryable) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        sdkLog.log(`⏳ Retrying in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        sdkLog.error('❌ Failed to get FCM token after retries.');
        return null;
      }
    }
  }
  return null;
}

/**
 * Handles local notification open + Android notification action button taps.
 *
 * On Android, `react-native-push-notification` delivers **action button** taps through the
 * `onAction` callback when `invokeApp` is false. If `invokeApp` is true (old default here),
 * the native module only re-launches the app and **never** forwards `action` / `__actionMap` to JS,
 * so Yes/No style buttons appear to do nothing.
 */
async function handlePushNotificationInteraction(raw: any) {
  const log = pushCtaLog;

  try {
    log('--- interaction start ---', {
      platform: Platform.OS,
      rawKeys: raw && typeof raw === 'object' ? Object.keys(raw) : typeof raw,
    });

    let notification = raw;
    if (Platform.OS === 'android' && notification?.data != null) {
      if (typeof notification.data === 'string') {
        try {
          notification = {
            ...notification,
            data: JSON.parse(notification.data),
          };
          log('parsed notification.data from JSON string');
        } catch (e) {
          log('failed to JSON.parse notification.data, keeping string', e);
        }
      }
    }

    log('full notification object', JSON.stringify(notification, null, 2));

    const rawPayload = (notification?.data ||
      notification?.userInfo ||
      {}) as Record<string, unknown>;
    const notificationData = mergeIosNotificationPayload(rawPayload) as Record<
      string,
      any
    >;

    const action = notification?.action;
    log('resolved action field', {
      action,
      userInteraction: notification?.userInteraction,
      foreground: notification?.foreground,
    });

    if (!action) {
      try {
        log('track opened (body tap, non-fatal if it fails)');
        await trackPushEvent('opened', notificationData);
      } catch (e) {
        log('trackPushEvent(opened) error', e);
      }

      const bodyUrl = resolveNotificationUrl(notificationData);
      if (bodyUrl) {
        log('body tap notification_url — opening in app', bodyUrl);
        try {
          await openNotificationLink(bodyUrl);
          log('openNotificationLink (body tap) finished');
        } catch (e) {
          log('openNotificationLink (body tap) threw', e);
        }
      } else {
        log(
          'body tap: notification_url / notificationUrl missing from FCM data — ' +
            'body will not open a link (fix send-notification to include it in FCM data). ' +
            `data keys: ${Object.keys(notificationData).join(', ')}`
        );
      }
      return;
    }

    const actionMapRaw =
      notificationData.__actionMap ||
      notification?.data?.__actionMap ||
      notification?.userInfo?.__actionMap ||
      notification?.__actionMap;
    log('__actionMap raw', actionMapRaw ?? '(none)');

    let actionMap: Record<string, string> =
      buildForegroundActionUrlMap(notificationData);
    log('actionMap from url1/title1/action1…', actionMap);

    if (actionMapRaw) {
      try {
        const parsed = JSON.parse(String(actionMapRaw)) as Record<
          string,
          string
        >;
        if (parsed && typeof parsed === 'object') {
          actionMap = { ...actionMap, ...parsed };
          log('actionMap after merge with __actionMap', actionMap);
        }
      } catch (e) {
        log('JSON.parse(__actionMap) failed', e);
      }
    }

    try {
      const targetUrl = resolveForegroundCtaUrl(
        String(action),
        notificationData,
        actionMap
      );
      log('resolveForegroundCtaUrl result', {
        action: String(action),
        targetUrl: targetUrl ?? '(null)',
      });

      try {
        const cta = resolvePushCtaFields(String(action), notificationData);
        await trackPushEvent('cta', notificationData, cta);
        log('trackPushEvent(cta) finished');
      } catch (e) {
        log('trackPushEvent(cta) error (continuing to try open URL)', e);
      }

      if (targetUrl) {
        log('calling openNotificationLink', targetUrl);
        try {
          await openNotificationLink(targetUrl);
          log('openNotificationLink finished');
        } catch (e) {
          log('openNotificationLink threw', e);
        }
      } else {
        log('no targetUrl — dump url/title/action fields from data', {
          url1: notificationData.url1,
          url2: notificationData.url2,
          title1: notificationData.title1,
          title2: notificationData.title2,
          action1: notificationData.action1,
          action2: notificationData.action2,
          actionMapKeys: Object.keys(actionMap),
        });
      }
    } catch (err) {
      log('handlePushNotificationInteraction CTA block failed', err);
    }

    log('--- interaction end ---');
  } catch (fatal) {
    log('handlePushNotificationInteraction fatal (outer catch)', fatal);
  }
}

/**
 * Configure push notifications
 */
export function configurePushNotifications(): void {
  ensureBackgroundMessageHandlerRegistered();

  PushNotification.configure({
    onNotification: handlePushNotificationInteraction,
    // Android: action buttons use `notificationActionReceived` → must set `onAction`
    // and use `invokeApp: false` on the local notification when actions exist.
    onAction:
      Platform.OS === 'android' ? handlePushNotificationInteraction : undefined,
    popInitialNotification: true,
    requestPermissions: false,
  });

  PushNotification.createChannel(
    {
      channelId: 'default-channel-id',
      channelName: 'Default Channel',
      channelDescription: 'Used for default notifications',
      importance: 4,
      vibrate: true,
    },
    (created: boolean) =>
      sdkLog.log(`📡 Notification channel created: ${created}`)
  );
}

/**
 * Setup foreground listener
 */
// export function setupForegroundNotificationListener(): () => void {
//   const unsubscribe = messaging().onMessage((remoteMessage) => {
//     console.log('📨 Foreground FCM message:', JSON.stringify(remoteMessage));

//     const title =
//       remoteMessage.notification?.title ||
//       remoteMessage.data?.title ||
//       'Notification';

//     const message =
//       remoteMessage.notification?.body ||
//       remoteMessage.data?.body ||
//       'You have a new message';

//     console.log('📲 Displaying local notification:', title, message);

//     PushNotification.localNotification({
//       channelId: 'default-channel-id',
//       title,
//       message,
//       playSound: true,
//       soundName: 'default',
//       importance: 'high',
//       vibrate: true,
//     });
//   });

//   return unsubscribe;
// }

export function setupForegroundNotificationListener(): () => void {
  if (foregroundUnsubscribe) {
    sdkLog.log('ℹ️ Foreground notification listener already active');
    return foregroundUnsubscribe;
  }

  const unsubscribe = messaging().onMessage((remoteMessage) => {
    sdkLog.log('📨 Foreground FCM message:', JSON.stringify(remoteMessage));
    const messageId = remoteMessage.messageId || '';
    if (messageId && seenForegroundMessageIds.has(messageId)) {
      sdkLog.log('⏭️ Duplicate foreground message ignored:', messageId);
      return;
    }
    if (messageId) {
      seenForegroundMessageIds.add(messageId);
      if (seenForegroundMessageIds.size > FOREGROUND_MESSAGE_CACHE_LIMIT) {
        const oldest = seenForegroundMessageIds.values().next().value as
          | string
          | undefined;
        if (oldest) seenForegroundMessageIds.delete(oldest);
      }
    }

    const rawData = remoteMessage.data || {};
    const data =
      Platform.OS === 'ios'
        ? (mergeIosNotificationPayload(
            rawData as Record<string, unknown>
          ) as Record<string, any>)
        : rawData;
    if (isSilentKeepAlive(data)) {
      void replySilentKeepAlive({
        ...data,
        messageId: remoteMessage.messageId,
      });
      return;
    }
    if (Platform.OS === 'android' && !resolveNotificationUrl(data)) {
      pushCtaLog(
        'FCM data has no notification_url — body tap will open the app, not a browser link',
        { keys: Object.keys(data) }
      );
    }
    const { title, message } = resolvePushNotificationText(remoteMessage, data);

    const image =
      remoteMessage.notification?.android?.imageUrl ||
      remoteMessage.notification?.image ||
      resolveSingleImageFromData(data) ||
      null;

    const carouselImages = resolveImageListFromData(data).slice(
      0,
      MAX_CAROUSEL_IMAGES
    );
    if (carouselImages.length > 1) {
      sdkLog.log('🖼️ Carousel images parsed:', carouselImages);
    }

    const category = normalizedString(data.category);
    const isCarouselCategory = /CAROUSEL/i.test(category);
    const isCarouselPayload =
      carouselImages.length > 1 ||
      (isCarouselCategory && carouselImages.length > 0);

    if (isCarouselPayload) {
      if (Platform.OS === 'android' && LiveActivityModule?.triggerCarousel) {
        sdkLog.log('🚀 Triggering Android carousel notification...');
        LiveActivityModule.triggerCarousel({
          ...(data as Record<string, string>),
          title,
          body: message,
          message,
          images: carouselImages,
        });
        return;
      }

      if (
        Platform.OS === 'ios' &&
        PushTokenManager?.showForegroundNotification
      ) {
        sdkLog.log('🚀 Triggering iOS foreground carousel notification...');
        PushTokenManager.showForegroundNotification({
          title,
          body: message,
          category: category || 'CAROUSEL_CATEGORY',
          data: {
            ...data,
            image_urls: carouselImages,
            imageUrls: carouselImages,
            images: carouselImages,
          },
        });
        return;
      }
    }

    if (
      Platform.OS === 'android' &&
      shouldUseNativeStyledPath(data) &&
      LiveActivityModule?.triggerLiveActivity
    ) {
      LiveActivityModule.triggerLiveActivity(data);
      return;
    }

    if (!title && !message && !image) {
      sdkLog.log(
        '⏭️ Skipping foreground notification — no title, body, or image in payload'
      );
      return;
    }

    if (Platform.OS === 'android') {
      sdkLog.log(
        '📲 Showing Android foreground JS local notification (plain payload path).'
      );
    }
    sdkLog.log('📲 Displaying local notification:', title, message, image);

    const localNotif: any = {
      channelId: 'default-channel-id',
      title,
      message,
      playSound: true,
      soundName: 'default',
      importance: 'high',
      vibrate: true,
    };

    if (Platform.OS === 'android') {
      const dataPayload = data as Record<string, string>;
      localNotif.data = { ...dataPayload };
      localNotif.userInfo = { ...dataPayload };
    }

    const actionPairs = extractForegroundCtaPairs(data);

    if (actionPairs.length > 0) {
      const actionTitles = actionPairs.map((item) => item.title as string);
      const actionMap = buildForegroundActionUrlMap(data);
      const actionMapJson = JSON.stringify(actionMap);

      localNotif.actions = actionTitles;
      // Android: see `handlePushNotificationInteraction` — `invokeApp: true` prevents action delivery to JS.
      localNotif.invokeApp = Platform.OS === 'android' ? false : true;
      localNotif.__actionMap = actionMapJson;
      localNotif.userInfo = {
        ...(localNotif.userInfo || {}),
        __actionMap: actionMapJson,
      };
      localNotif.data = {
        ...(data as Record<string, string>),
        __actionMap: actionMapJson,
      };
      try {
        pushCtaLog('foreground local notification with CTAs', {
          invokeApp: localNotif.invokeApp,
          actions: actionTitles,
          pairs: actionPairs.map((p) => ({ title: p.title, url: p.url })),
          actionMapJson,
        });
      } catch (e) {
        pushCtaLog('log foreground CTA payload failed', e);
      }
    }

    if (image) {
      // react-native-push-notification big-picture style
      localNotif.bigPictureUrl = image;
      localNotif.picture = image;
      localNotif.largeIconUrl = image;
    }

    if (Platform.OS === 'ios' && PushTokenManager?.showForegroundNotification) {
      sdkLog.log(
        '📲 Displaying iOS foreground notification via PushTokenManager (plain payload path).'
      );
      const imageList =
        carouselImages.length > 0 ? carouselImages : image ? [image] : [];
      const iosData: Record<string, unknown> = { ...data };
      if (image) {
        iosData.image = image;
        iosData.image_url = image;
        iosData.imageUrl = image;
      }
      if (imageList.length > 0) {
        iosData.image_urls = imageList;
        iosData.imageUrls = imageList;
        iosData.images = imageList;
      }
      if (actionPairs.length > 0) {
        iosData.__actionMap = JSON.stringify(buildForegroundActionUrlMap(data));
      }
      PushTokenManager.showForegroundNotification({
        title,
        body: message,
        category:
          category ||
          (actionPairs.length > 0
            ? 'THREE_BUTTON_CATEGORY'
            : 'CAROUSEL_CATEGORY'),
        data: iosData,
      });
      return;
    }

    if (Platform.OS === 'android') {
      PushNotification.localNotification(localNotif);
    }
  });

  foregroundUnsubscribe = () => {
    unsubscribe();
    foregroundUnsubscribe = null;
    seenForegroundMessageIds.clear();
  };

  return foregroundUnsubscribe;
}

async function openIosNotificationBodyUrl(
  raw: Record<string, unknown> | undefined
): Promise<void> {
  if (Platform.OS !== 'ios' || !raw) return;
  const merged = mergeIosNotificationPayload(raw);
  const bodyUrl = resolveNotificationUrl(merged);
  if (!bodyUrl) {
    pushCtaLog(
      'iOS FCM open: no notification_url in data (checked style/templateData)',
      { keys: Object.keys(merged) }
    );
    return;
  }
  try {
    await openNotificationLink(bodyUrl);
    pushCtaLog('iOS FCM open: opened notification_url', bodyUrl);
  } catch (e) {
    pushCtaLog('iOS FCM open: openNotificationLink failed', e);
  }
}

export function setupNotificationOpenTracking(): () => void {
  if (openTrackingUnsubscribe) return openTrackingUnsubscribe;

  const unsubscribe = messaging().onNotificationOpenedApp((remoteMessage) => {
    const data = (remoteMessage?.data || {}) as Record<string, unknown>;
    trackPushEvent('opened', data).catch(() => undefined);
    openIosNotificationBodyUrl(data).catch(() => undefined);
  });

  messaging()
    .getInitialNotification()
    .then((remoteMessage) => {
      if (remoteMessage?.data) {
        const data = remoteMessage.data as Record<string, unknown>;
        trackPushEvent('opened', data).catch(() => undefined);
        openIosNotificationBodyUrl(data).catch(() => undefined);
      }
    })
    .catch(() => undefined);

  openTrackingUnsubscribe = () => {
    unsubscribe();
    openTrackingUnsubscribe = null;
  };

  return openTrackingUnsubscribe;
}

// Fb.ts or Fb.js

// export const requestUserPermission = () => {
//   console.log('Requesting permission...');
// };

// export const getFcmToken = () => {
//   console.log('Getting FCM token...');
// };

// export const configurePushNotifications = () => {
//   console.log('Configuring push notifications...');
// };

// export const setupForegroundNotificationListener = () => {
//   console.log('Setting up foreground listener...');
// };
