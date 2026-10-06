import { Dimensions, Platform } from 'react-native';
import { getDeviceMetadata } from '../utils/deviceMetadata';
import { getDeviceId } from '../utils/device';
import { resolveDeviceHeaders } from '../utils/resolveDeviceHeaders';
import { SDK_FRAMEWORK, SDK_VERSION } from './sdkInfo';
import { sdkLog } from './sdkLogger';
import {
  getPushappAuthHeaders,
  redactPushappAuthHeadersForLog,
} from './pushappAuth';

export async function buildCommonHeaders() {
  const { width, height } = Dimensions.get('window');

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';

  const locale = Intl.DateTimeFormat().resolvedOptions().locale || 'en';

  const deviceId = await getDeviceId();

  const orientation = width > height ? 'Landscape' : 'Portrait';

  const runtimeHeaders: Record<string, string> = {
    'X-SDK-Framework': SDK_FRAMEWORK,
    'X-SDK-Version': SDK_VERSION,
    'sdk_framework': SDK_FRAMEWORK,
    'sdk_version': SDK_VERSION,

    'X-Screen-Resolution': `${Math.round(width)}x${Math.round(height)}`,
    'X-Device-Orientation': orientation,

    'X-OS-Name': Platform.OS.toUpperCase(),

    'X-Timezone': timezone,
    'X-Locale': locale,

    'X-Device-ID': deviceId,
  };

  const deviceHeaders = await resolveDeviceHeaders();
  const deviceMetadata = getDeviceMetadata?.() ?? {};
  const authHeaders = await getPushappAuthHeaders();

  const headers = sanitizeHeaderMap({
    ...runtimeHeaders,
    ...deviceHeaders,
    ...deviceMetadata,
    ...authHeaders,
  });

  sdkLog.log('[SDK] Common headers:', redactPushappAuthHeadersForLog(headers));

  return headers;
}

/** Android fetch/OkHttp rejects CR/LF; keep values as Latin-1 header-safe strings. */
function sanitizeHeaderValue(value: unknown): string {
  const raw = value == null ? '' : String(value);
  const cleaned = raw
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^\u0020-\u007E]/g, '?')
    .trim();
  return cleaned;
}

function sanitizeHeaderMap(
  headers: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!key) continue;
    out[key] = sanitizeHeaderValue(value);
  }
  return out;
}
