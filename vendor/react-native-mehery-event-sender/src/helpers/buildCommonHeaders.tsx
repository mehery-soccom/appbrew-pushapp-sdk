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

  const headers = {
    ...runtimeHeaders,
    ...deviceHeaders,
    ...deviceMetadata,
    ...authHeaders,
  };

  sdkLog.log('[SDK] Common headers:', redactPushappAuthHeadersForLog(headers));

  return headers;
}
