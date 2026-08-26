import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildCommonHeaders } from '../../helpers/buildCommonHeaders';
import { getApiBaseUrl } from '../../helpers/tenantContext';
import { sdkLog } from '../../helpers/sdkLogger';
import {
  buildProfileApiPayload,
  isProfileUpdatePayloadEmpty,
  loadLastProfileSnapshot,
  prepareProfileUpdatePayload,
  profilePayloadsEqual,
  saveLastProfileSnapshot,
  stableStringify,
} from '../../utils/profileSnapshot';
import type { ProfileApiPayload } from '../../utils/profileSnapshot';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const DATE_FIELD_KEY_REGEX = /(dob|date|birth|expiry|expires|expir)/i;

let profileUpdateInProgress = false;
let sessionProfileSyncKey: string | null = null;

function buildSessionProfileSyncKey(
  userId: string,
  payload: ProfileApiPayload
): string {
  return `${userId}:${stableStringify(payload)}`;
}

function markSessionProfileHandled(
  userId: string,
  payload: ProfileApiPayload
): void {
  sessionProfileSyncKey = buildSessionProfileSyncKey(userId, payload);
}

// Wait until UserLoggedIn is set in AsyncStorage, up to `timeoutMs`.
async function waitForUserLoggedIn(
  timeoutMs = 30_000,
  pollIntervalMs = 500
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const flag = await AsyncStorage.getItem('UserLoggedIn');
    if (flag === 'true') return true;
    await delay(pollIntervalMs);
  }
  return false;
}

function toUtcTimestampMs(value: unknown): number | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1_000_000_000_000
      ? Math.trunc(value * 1000)
      : Math.trunc(value);
  }

  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric < 1_000_000_000_000
        ? Math.trunc(numeric * 1000)
        : Math.trunc(numeric);
    }

    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function parseDateLikeValue(value: unknown): Date | null {
  const utcTs = toUtcTimestampMs(value);
  if (utcTs !== null) {
    const parsed = new Date(utcTs);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    const dateOnlyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dateOnlyMatch) {
      const day = Number(dateOnlyMatch[1]);
      const month = Number(dateOnlyMatch[2]);
      const year = Number(dateOnlyMatch[3]);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        const parsed = new Date(Date.UTC(year, month - 1, day));
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      }
    }
  }

  return null;
}

function normalizeAdditionalInfoDates(
  data: Record<string, any>,
  sourceName: string
): Record<string, any> {
  const normalized = { ...data };

  for (const [key, value] of Object.entries(normalized)) {
    if (!DATE_FIELD_KEY_REGEX.test(key)) continue;

    const parsedDate = parseDateLikeValue(value);
    if (parsedDate) {
      normalized[key] = parsedDate.toISOString();
      continue;
    }

    sdkLog.warn(
      `⚠️ [SDK][Profile] Invalid date in "${sourceName}.${key}", dropping field to prevent API 500`
    );
    delete normalized[key];
  }

  return normalized;
}

async function attemptProfileUpdate(
  url: string,
  payload: object,
  headers: Record<string, string>
): Promise<{ ok: boolean; status: number; data: any; rawText: string }> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });

  const rawText = await res.text();
  let data: any = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    // non-JSON body — keep data as null
  }

  return { ok: res.ok, status: res.status, data, rawText };
}

function extractProfileErrorMessage(data: unknown, rawText: string): string {
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message.trim()) {
      return record.message.trim();
    }
    if (typeof record.error === 'string' && record.error.trim()) {
      return record.error.trim();
    }
  }
  return rawText.trim();
}

function isProfileNotFoundError(message: string): boolean {
  return /profile not found/i.test(message);
}

function isMandatoryProfileFieldError(message: string): boolean {
  return /mandatory fields/i.test(message);
}

function isDuplicateProfileFieldError(message: string): boolean {
  return /already exists/i.test(message);
}

export type UpdateUserProfileResult = {
  skipped: boolean;
  message: string;
};

export type UpdateUserProfileOptions = {
  /** Bypass in-session dedupe when true. Snapshot/API logic unchanged. */
  force?: boolean;
};

// Updates customer profile (PUT) — skips API when payload matches last successful push.
export async function updateUserProfile(
  info: Record<string, any> = {},
  cohorts: Record<string, any> = {},
  options?: UpdateUserProfileOptions
): Promise<UpdateUserProfileResult> {
  sdkLog.log('🧩 [SDK][Profile] updateUserProfile called');

  if (profileUpdateInProgress) {
    const message =
      'Skipped: profile update already in progress (duplicate call).';
    sdkLog.log(`⏭️ [SDK][Profile] ${message}`);
    return { skipped: true, message };
  }

  profileUpdateInProgress = true;

  try {
    const channel_code = await AsyncStorage.getItem('mehery_channel_id');
    const user_id = (await AsyncStorage.getItem('user_id'))?.trim() ?? '';

    if (!channel_code) {
      const message = 'Skipped: channel_code is missing.';
      sdkLog.warn(`⚠️ [SDK][Profile] ${message}`);
      return { skipped: true, message };
    }
    if (!user_id) {
      const message = 'Skipped: user_id is missing.';
      sdkLog.warn(`⚠️ [SDK][Profile] ${message}`);
      return { skipped: true, message };
    }

    const normalizedAdditionalInfo = normalizeAdditionalInfoDates(
      info,
      'additionalInfo'
    );
    const normalizedCohorts = normalizeAdditionalInfoDates(cohorts, 'cohorts');

    const payload = buildProfileApiPayload(
      normalizedAdditionalInfo,
      normalizedCohorts
    );

    const sessionKey = buildSessionProfileSyncKey(user_id, payload);
    if (!options?.force && sessionProfileSyncKey === sessionKey) {
      const message = 'Skipped: already handled this app session.';
      sdkLog.log(`⏭️ [SDK][Profile] ${message}`);
      return { skipped: true, message };
    }

    const lastSnapshot = await loadLastProfileSnapshot(user_id);
    if (lastSnapshot && profilePayloadsEqual(lastSnapshot, payload)) {
      const message = 'Skipped: same profile already pushed (no API call).';
      sdkLog.log(`⏭️ [SDK][Profile] ${message}`, JSON.stringify({ user_id }));
      markSessionProfileHandled(user_id, payload);
      return { skipped: true, message };
    }

    sdkLog.log('🏷️ [SDK][Profile] channel_code:', channel_code);
    sdkLog.log('👤 [SDK][Profile] user_id:', user_id);

    let requestPayload = prepareProfileUpdatePayload(payload, lastSnapshot);

    if (isProfileUpdatePayloadEmpty(requestPayload)) {
      const message =
        'Skipped: no changed profile fields to send (unchanged phone omitted).';
      sdkLog.log(`⏭️ [SDK][Profile] ${message}`, JSON.stringify({ user_id }));
      await saveLastProfileSnapshot(user_id, payload);
      markSessionProfileHandled(user_id, payload);
      return { skipped: true, message };
    }

    sdkLog.log('⏳ [SDK][Profile] Waiting for UserLoggedIn flag...');
    const loggedIn = await waitForUserLoggedIn(30_000);
    if (!loggedIn) {
      const message = 'Skipped: timed out waiting for login.';
      sdkLog.warn(`⚠️ [SDK][Profile] ${message}`);
      return { skipped: true, message };
    }
    sdkLog.log('✅ [SDK][Profile] User is logged in, proceeding');

    sdkLog.log(
      '📡 [SDK][Profile] PUT /customer/profile payload:',
      JSON.stringify(requestPayload, null, 2)
    );

    const baseUrl = await getApiBaseUrl();
    const url = `${baseUrl}/v1/customer/profile?code=${encodeURIComponent(user_id)}`;
    sdkLog.log('🌐 [SDK][Profile] Request URL:', url);

    const commonHeaders = await buildCommonHeaders();

    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [2_000, 5_000, 10_000];
    let lastStatus = 0;
    let strippedPhonesForDuplicate = false;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      sdkLog.log(`🔄 [SDK][Profile] Attempt ${attempt}/${MAX_RETRIES}`);
      const startTime = Date.now();

      const { ok, status, data, rawText } = await attemptProfileUpdate(
        url,
        requestPayload,
        commonHeaders
      );
      lastStatus = status;
      const serverMessage = extractProfileErrorMessage(data, rawText);

      sdkLog.log(
        `⏱️ [SDK][Profile] Response in ${Date.now() - startTime}ms — status ${status}`
      );
      sdkLog.log('📥 [SDK][Profile] Response body:', data);

      if (ok) {
        sdkLog.log('✅ [SDK][Profile] Profile updated successfully:', data);
        await saveLastProfileSnapshot(user_id, payload);
        sdkLog.log('🔒 [SDK][Profile] Profile snapshot saved locally');
        markSessionProfileHandled(user_id, payload);
        return {
          skipped: false,
          message: 'Profile updated (API call sent).',
        };
      }

      if (isProfileNotFoundError(serverMessage)) {
        throw new Error(
          `[SDK][Profile] profile not found for user_id "${user_id}". OnUserLogin must complete /device/link for the current channel and environment before updateUserProfile. Log out and log in again if you changed initSdk settings.`
        );
      }

      if (isMandatoryProfileFieldError(serverMessage)) {
        throw new Error(
          `[SDK][Profile] ${serverMessage}. Add the required channel field(s) to additionalInfo (not cohorts) before calling updateUserProfile.`
        );
      }

      if (isDuplicateProfileFieldError(serverMessage)) {
        if (requestPayload.phones?.length && !strippedPhonesForDuplicate) {
          strippedPhonesForDuplicate = true;
          delete requestPayload.phones;
          sdkLog.warn(
            '⚠️ [SDK][Profile] Phone already on profile — omitting phones and retrying update for other fields'
          );
          if (isProfileUpdatePayloadEmpty(requestPayload)) {
            await saveLastProfileSnapshot(user_id, payload);
            markSessionProfileHandled(user_id, payload);
            return {
              skipped: true,
              message:
                'Skipped: phone unchanged on server; no other fields to update.',
            };
          }
          attempt--;
          continue;
        }
        throw new Error(
          `[SDK][Profile] ${serverMessage}. Use a unique phone/email for this user, or omit unchanged phones on profile updates.`
        );
      }

      if (status >= 400 && status < 500) {
        sdkLog.error(
          `🚨 [SDK][Profile] Client error ${status}, not retrying`,
          data
        );
        throw new Error(
          `[SDK][Profile] HTTP ${status}${serverMessage ? `: ${serverMessage}` : ''}`
        );
      }

      if (attempt < MAX_RETRIES) {
        const wait = RETRY_DELAYS[attempt - 1] ?? 5_000;
        sdkLog.warn(
          `⚠️ [SDK][Profile] Server error ${status}, retrying in ${wait}ms...`
        );
        await delay(wait);
      }
    }

    throw new Error(
      `[SDK][Profile] HTTP ${lastStatus} after ${MAX_RETRIES} attempts.`
    );
  } catch (err) {
    sdkLog.error('❌ [SDK][Profile] updateUserProfile failed', err);
    throw err;
  } finally {
    profileUpdateInProgress = false;
    sdkLog.log('🏁 [SDK][Profile] updateUserProfile finished');
  }
}
