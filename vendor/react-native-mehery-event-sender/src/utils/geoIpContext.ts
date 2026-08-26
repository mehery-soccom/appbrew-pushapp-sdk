import type { GeoIpInput, GeoIpPayload } from '../types/geoIp';
import { sdkLog } from '../helpers/sdkLogger';

const DEFAULT_TIMEOUT_MS = 4000;
const SESSION_ID_STORAGE_KEY = 'sessionId';
const SESSION_GEO_SYNC_RETRY_DELAYS_MS = [0, 400, 1200] as const;

function mergeGeoInput(base: GeoIpInput, patch: GeoIpInput): GeoIpInput {
  return {
    ...base,
    ...patch,
    location: { ...base.location, ...patch.location },
    country: { ...base.country, ...patch.country },
    region: { ...base.region, ...patch.region },
    city: { ...base.city, ...patch.city },
    area: { ...base.area, ...patch.area },
  };
}

function str(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v == null) return '';
  return String(v);
}

function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return 0;
}

/** Build API payload; missing values become "" or 0 for lat/lng. */
export function buildGeoIpPayload(input: GeoIpInput = {}): GeoIpPayload {
  return {
    ip: str(input.ip),
    location: {
      lat: num(input.location?.lat),
      lng: num(input.location?.lng),
    },
    country: {
      iso_code: str(input.country?.iso_code),
      name: str(input.country?.name),
    },
    region: {
      iso_code: str(input.region?.iso_code),
      name: str(input.region?.name),
    },
    city: { name: str(input.city?.name) },
    area: { name: str(input.area?.name) },
  };
}

let hostPartial: GeoIpInput = {};
let earlyNotify: Array<() => void> = [];
let firstWaitCompleted = false;
let setGeoEverCalled = false;
let syncInFlight = false;
let syncQueued = false;

function flushEarlyNotify() {
  const fns = earlyNotify;
  earlyNotify = [];
  fns.forEach((fn) => fn());
}

/**
 * Host app supplies geo/IP data. Merges with any prior `setGeoIP` values.
 * Completes an in-flight first `waitForGeoIp` early when possible.
 */
export function setGeoIP(partial: GeoIpInput): void {
  hostPartial = mergeGeoInput(hostPartial, partial);
  setGeoEverCalled = true;
  flushEarlyNotify();
  scheduleSessionGeoSync().catch(() => {
    // Errors are logged inside syncSessionGeoInBackground.
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postSessionGeoUpdate(
  session_id: string,
  geoIP: GeoIpPayload
): Promise<void> {
  const { buildCommonHeaders } = require('../helpers/buildCommonHeaders');
  const { getApiBaseUrl } = require('../helpers/tenantContext');
  const commonHeaders = await buildCommonHeaders();
  const apiBaseUrl = await getApiBaseUrl();
  const endpoint = `${apiBaseUrl}/session/geo`;
  sdkLog.log(`🌍 Session geo sync request started: ${endpoint}`);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...commonHeaders,
    },
    body: JSON.stringify({ session_id, geoIP }),
  });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `session geo update failed: ${response.status}${
        errorBody ? ` - ${errorBody}` : ''
      }`
    );
  }
  sdkLog.log(
    `✅ Session geo sync request succeeded: ${endpoint} (status ${response.status})`
  );
}

async function syncSessionGeoInBackground(): Promise<void> {
  let session_id = '';
  try {
    const AsyncStorage =
      require('@react-native-async-storage/async-storage')?.default;
    session_id = (
      await AsyncStorage?.getItem?.(SESSION_ID_STORAGE_KEY)
    )?.trim();
  } catch {
    session_id = '';
  }
  if (!session_id) return;

  const geoIP = buildGeoIpPayload(hostPartial);

  for (const delayMs of SESSION_GEO_SYNC_RETRY_DELAYS_MS) {
    if (delayMs > 0) {
      await delay(delayMs);
    }
    try {
      await postSessionGeoUpdate(session_id, geoIP);
      return;
    } catch (error) {
      const isFinalAttempt =
        delayMs ===
        SESSION_GEO_SYNC_RETRY_DELAYS_MS[
          SESSION_GEO_SYNC_RETRY_DELAYS_MS.length - 1
        ];
      if (isFinalAttempt) {
        sdkLog.warn('⚠️ Failed to sync session geo context:', error);
      } else {
        sdkLog.warn('⚠️ Retrying session geo sync after failure:', error);
      }
    }
  }
}

async function scheduleSessionGeoSync(): Promise<void> {
  if (syncInFlight) {
    syncQueued = true;
    return;
  }

  syncInFlight = true;
  try {
    do {
      syncQueued = false;
      await syncSessionGeoInBackground();
    } while (syncQueued);
  } finally {
    syncInFlight = false;
  }
}

/**
 * First call: wait up to `timeoutMs` for `setGeoIP`, or until timeout, then return built payload.
 * Later calls: return immediately from current merged host partial (no further delay).
 */
export async function waitForGeoIp(options?: {
  timeoutMs?: number;
}): Promise<GeoIpPayload> {
  if (firstWaitCompleted) {
    return buildGeoIpPayload(hostPartial);
  }

  if (setGeoEverCalled) {
    firstWaitCompleted = true;
    return buildGeoIpPayload(hostPartial);
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  await Promise.race([
    new Promise<void>((resolve) => {
      earlyNotify.push(resolve);
    }),
    delay(timeoutMs),
  ]);

  firstWaitCompleted = true;
  return buildGeoIpPayload(hostPartial);
}

/** Clears in-memory geo state (unit tests only). */
export function resetGeoIpContextForTests(): void {
  hostPartial = {};
  earlyNotify = [];
  firstWaitCompleted = false;
  setGeoEverCalled = false;
  syncInFlight = false;
  syncQueued = false;
}
