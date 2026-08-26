export function tryParseRegisterResponse(text: string): unknown | null {
  try {
    return text?.trim() ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

const FORBIDDEN_EVENT_USER_IDS = new Set(['guest']);

export function isAcceptableEventUserId(userId: string): boolean {
  const trimmed = userId.trim();
  return Boolean(trimmed) && !FORBIDDEN_EVENT_USER_IDS.has(trimmed.toLowerCase());
}

export function extractUserIdFromRegisterResponse(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const device = (data as Record<string, unknown>).device;
  if (device && typeof device === 'object') {
    const userId = (device as Record<string, unknown>).user_id;
    if (typeof userId === 'string' && userId.trim()) return userId.trim();
  }
  return '';
}

export function extractContactIdFromRegisterResponse(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const device = (data as Record<string, unknown>).device;
  if (device && typeof device === 'object') {
    const contactId = (device as Record<string, unknown>).contact_id;
    if (typeof contactId === 'string' && contactId.trim()) {
      return contactId.trim();
    }
  }
  return '';
}

/** Guest id from a register response body (never Shopify login user_id). */
export function guestUserIdFromRegisterResponse(parsed: unknown): string {
  const userId = extractUserIdFromRegisterResponse(parsed);
  return isAcceptableEventUserId(userId) ? userId : '';
}

export function extractSessionIdFromRegisterResponse(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const root = data as Record<string, unknown>;
  const device = root.device;
  if (device && typeof device === 'object') {
    const sid = (device as Record<string, unknown>).session_id;
    if (typeof sid === 'string' && sid.trim()) return sid.trim();
  }
  if (typeof root.session_id === 'string' && root.session_id.trim()) {
    return root.session_id.trim();
  }
  if (typeof root.sessionId === 'string' && root.sessionId.trim()) {
    return root.sessionId.trim();
  }
  return '';
}
