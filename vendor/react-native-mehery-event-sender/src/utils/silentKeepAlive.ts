import { buildCommonHeaders } from '../helpers/buildCommonHeaders';
import { sdkLog } from '../helpers/sdkLogger';
import { getHttpHostBaseUrl } from '../helpers/tenantContext';
import { getDeviceId } from './device';
import { silentKeepAliveDedupeKey } from './silentKeepAliveType';

export { isSilentKeepAlive } from './silentKeepAliveType';

const recentReplyKeys = new Set<string>();
const RECENT_REPLY_LIMIT = 50;

/** POST /pushapp/silent/ping so the server can update last_active (pong). */
export async function replySilentKeepAlive(payload?: unknown): Promise<void> {
  console.log('[Mehery SDK] silent ping: replySilentKeepAlive invoked', {
    payloadType:
      payload && typeof payload === 'object'
        ? (payload as Record<string, unknown>).type
        : undefined,
  });

  const key = silentKeepAliveDedupeKey(payload);
  if (key) {
    if (recentReplyKeys.has(key)) {
      console.log(
        '[Mehery SDK] silent ping: skipped (already replied for key)',
        key
      );
      sdkLog.log('⏭️ Silent keep-alive already replied:', key);
      return;
    }
    recentReplyKeys.add(key);
    if (recentReplyKeys.size > RECENT_REPLY_LIMIT) {
      const oldest = recentReplyKeys.values().next().value as
        | string
        | undefined;
      if (oldest) recentReplyKeys.delete(oldest);
    }
  }

  try {
    const device_id = await getDeviceId();
    if (!device_id) {
      console.log('[Mehery SDK] silent ping: skipped (missing device_id)');
      sdkLog.warn('⚠️ Silent keep-alive skipped: missing device_id');
      return;
    }

    const host = await getHttpHostBaseUrl();
    const commonHeaders = await buildCommonHeaders();
    const url = `${host}/pushapp/silent/ping`;
    console.log('[Mehery SDK] silent ping: POSTing /pushapp/silent/ping', {
      url,
      device_id,
    });
    sdkLog.log('📡 Silent keep-alive pong:', { url, device_id });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...commonHeaders,
      },
      body: JSON.stringify({ device_id }),
    });

    if (!res.ok) {
      console.log('[Mehery SDK] silent ping: HTTP failed', res.status);
      sdkLog.warn('⚠️ Silent keep-alive HTTP', res.status);
      return;
    }
    console.log('[Mehery SDK] silent ping: success', {
      device_id,
      status: res.status,
    });
    sdkLog.log('✅ Silent keep-alive pong sent');
  } catch (err) {
    console.log('[Mehery SDK] silent ping: failed', err);
    sdkLog.error('❌ Silent keep-alive failed:', err);
  }
}
