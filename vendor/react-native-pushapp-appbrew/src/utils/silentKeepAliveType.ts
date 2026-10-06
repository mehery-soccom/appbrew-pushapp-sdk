export const SILENT_KEEPALIVE_TYPE = 'silent_keepalive';

function payloadType(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const rec = payload as Record<string, unknown>;
  const nested =
    rec.data && typeof rec.data === 'object'
      ? (rec.data as Record<string, unknown>)
      : null;
  return String(rec.type ?? nested?.type ?? '');
}

export function isSilentKeepAlive(payload: unknown): boolean {
  return payloadType(payload) === SILENT_KEEPALIVE_TYPE;
}

export function silentKeepAliveDedupeKey(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const rec = payload as Record<string, unknown>;
  const nested =
    rec.data && typeof rec.data === 'object'
      ? (rec.data as Record<string, unknown>)
      : null;
  const id = rec.messageId ?? rec.timestamp ?? nested?.timestamp;
  return id != null && String(id).length > 0 ? String(id) : null;
}
