/**
 * iOS push notification payload helpers for POST …/notification/push/track
 * (aligns with AppDelegate merged fields + Android NotificationCtaUtils).
 */

const normalizedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const EMBEDDED_JSON_BLOB_KEYS = [
  'payload',
  'extras',
  'custom',
  'mehery_data',
] as const;

function mergeJsonObjectBlobInto(
  merged: Record<string, unknown>,
  rawBlob: unknown
): void {
  if (
    rawBlob != null &&
    typeof rawBlob === 'object' &&
    !Array.isArray(rawBlob)
  ) {
    Object.assign(merged, rawBlob as Record<string, unknown>);
    return;
  }
  if (typeof rawBlob !== 'string') return;
  const text = rawBlob.trim();
  if (!text.startsWith('{')) return;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      Object.assign(merged, parsed as Record<string, unknown>);
    }
  } catch {
    /* ignore */
  }
}

export function mergeIosNotificationPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...payload };
  const rawData = payload.data;
  if (
    rawData != null &&
    typeof rawData === 'object' &&
    !Array.isArray(rawData)
  ) {
    Object.assign(merged, rawData as Record<string, unknown>);
  } else if (typeof rawData === 'string') {
    const text = rawData.trim();
    if (text) {
      try {
        const parsed = JSON.parse(text) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          Object.assign(merged, parsed as Record<string, unknown>);
        }
      } catch {
        /* ignore */
      }
    }
  }
  for (const k of EMBEDDED_JSON_BLOB_KEYS) {
    mergeJsonObjectBlobInto(merged, merged[k]);
  }
  return merged;
}

/** Same host keys as Android [NotificationCtaUtils.trackBaseUrl] (payload-first). */
export function getPushTrackBaseFromMerged(
  merged: Record<string, unknown>
): string {
  const keys = [
    'track_base_url',
    'api_base_url',
    'apiBaseUrl',
    'base_url',
    'push_api_url',
    'pushapp_api_url',
    'mehery_api_base_url',
  ] as const;
  for (const k of keys) {
    const v = normalizedString(merged[k]);
    if (v) return v;
  }
  return '';
}

export function extractClickTrackToken(
  merged: Record<string, unknown>
): string | undefined {
  const keys = [
    't',
    'click_token',
    'clickToken',
    'track_token',
    'trackToken',
  ] as const;
  for (const k of keys) {
    const v = normalizedString(merged[k]);
    if (v) return v;
  }
  return undefined;
}

export type PushTrackEvent = 'opened' | 'cta';

export function buildPushTrackBody(
  event: PushTrackEvent,
  merged: Record<string, unknown>,
  options?: {
    cta?: { ctaId: string; button_id: string };
    ctaId?: string;
  }
): Record<string, unknown> {
  const body: Record<string, unknown> = { event };

  const clickToken = extractClickTrackToken(merged);
  if (clickToken) body.t = clickToken;

  const messageId = normalizedString(merged.messageId || merged.message_id);
  const filterId = normalizedString(merged.filterId || merged.filter_id);
  const notificationId = normalizedString(merged.notification_id);
  if (messageId) body.messageId = messageId;
  if (filterId) body.filterId = filterId;
  if (notificationId) body.notificationId = notificationId;

  if (options?.cta) {
    body.data = {
      ctaId: options.cta.ctaId,
      button_id: options.cta.button_id,
    };
  } else if (options?.ctaId) {
    body.data = { ctaId: options.ctaId, button_id: '' };
  }

  return body;
}

export function parseCtaButtonArray(raw: unknown): Record<string, unknown>[] {
  if (raw == null) return [];
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return [];
    try {
      parsed = JSON.parse(t) as unknown;
    } catch {
      return [];
    }
  }
  if (Array.isArray(parsed)) {
    return parsed.filter(
      (x): x is Record<string, unknown> => !!x && typeof x === 'object'
    );
  }
  if (parsed && typeof parsed === 'object') {
    const o = parsed as Record<string, unknown>;
    const nested =
      (Array.isArray(o.buttons) ? o.buttons : null) ??
      (Array.isArray(o.items) ? o.items : null) ??
      (Array.isArray(o.ctas) ? o.ctas : null);
    if (Array.isArray(nested)) {
      return nested.filter(
        (x): x is Record<string, unknown> => !!x && typeof x === 'object'
      );
    }
  }
  return [];
}

export function machineIdFromButton(
  btn: Record<string, unknown>,
  fallback: string
): string {
  const idKeys = [
    'button_id',
    'id',
    'ctaId',
    'cta_id',
    'actionId',
    'action_id',
    'value',
  ] as const;
  for (const k of idKeys) {
    const s = normalizedString(btn[k]);
    if (s) return s;
  }
  return fallback;
}

export function labelFromButton(
  btn: Record<string, unknown>,
  fallback: string
): string {
  const labelKeys = [
    'button_text',
    'title',
    'label',
    'text',
    'name',
    'buttonTitle',
  ] as const;
  for (const k of labelKeys) {
    const s = normalizedString(btn[k]);
    if (s) return s;
  }
  return fallback;
}

function trackIdFromButton(
  btn: Record<string, unknown>,
  fallback: string
): string {
  const id = machineIdFromButton(btn, '');
  if (id) return id;
  return labelFromButton(btn, fallback);
}

export function pushActionButtonIndex(actionId: string): number | null {
  if (
    actionId === 'PUSHAPP_ACTION_1' ||
    actionId === 'PUSHAPP_OPT_IN' ||
    actionId === 'PUSHAPP_YES'
  ) {
    return 0;
  }
  if (actionId === 'PUSHAPP_ACTION_2' || actionId.endsWith('_MID')) {
    return 1;
  }
  if (
    actionId === 'PUSHAPP_ACTION_3' ||
    actionId === 'PUSHAPP_NOT_INTERESTED' ||
    actionId === 'PUSHAPP_NO'
  ) {
    return 2;
  }
  const parts = actionId.split('_');
  const last = parts[parts.length - 1] ?? '';
  const n = parseInt(last, 10);
  if (!Number.isNaN(n) && last !== '') {
    return Math.max(0, n - 1);
  }
  return null;
}

export function legacyLabelAtIndex(
  merged: Record<string, unknown>,
  index: number
): string {
  const titleKeys = [
    ['title1', 'cta1_title', 'button1_title'],
    ['title2', 'cta2_title', 'button2_title'],
    ['title3', 'cta3_title', 'button3_title'],
  ] as const;
  const defaults = ['Open', 'View', 'More'] as const;
  const keys = titleKeys[index];
  if (!keys) return '';
  for (const k of keys) {
    const s = normalizedString(merged[k]);
    if (s) return s;
  }
  return defaults[index] ?? '';
}

/**
 * Map UNNotification actionIdentifier to semantic CTA id for track body `data.ctaId`.
 */
export function resolveIosSemanticCtaId(
  actionId: string,
  merged: Record<string, unknown>
): string {
  const id = normalizedString(actionId);
  if (!id) return '';

  for (let i = 1; i <= 3; i++) {
    const ak = `action${i}` as const;
    if (normalizedString(merged[ak]) === id) {
      const label = legacyLabelAtIndex(merged, i - 1);
      return label || id;
    }
  }

  const buttons = parseCtaButtonArray(merged.cta_buttons ?? merged.buttons);
  if (buttons.length > 0) {
    const idx = pushActionButtonIndex(id);
    if (idx !== null && idx >= 0 && idx < buttons.length) {
      return trackIdFromButton(buttons[idx]!, `cta_${idx + 1}`);
    }
    for (const btn of buttons) {
      const bid = machineIdFromButton(btn, '');
      if (bid && bid === id) {
        return trackIdFromButton(btn, id);
      }
    }
  }

  const idx = pushActionButtonIndex(id);
  if (idx !== null) {
    const legacy = legacyLabelAtIndex(merged, idx);
    if (legacy) return legacy;
  }

  return id;
}

/** Aligns with Android [NotificationPushTrack.normalizeTargetUrl]. */
export function normalizeTargetUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const NOTIFICATION_URL_KEYS = ['notification_url', 'notificationUrl'] as const;

function notificationUrlFromDict(dict: Record<string, unknown>): string {
  for (const k of NOTIFICATION_URL_KEYS) {
    const raw = normalizedString(dict[k]);
    if (raw) return normalizeTargetUrl(raw);
  }
  return '';
}

function parseJsonObjectRecord(raw: unknown): Record<string, unknown> | null {
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Body-tap link from FCM data (`notification_url` / `notificationUrl`), including
 * Mehery template nests (`style`, `templateData`, `template`).
 */
export function resolveNotificationUrl(
  merged: Record<string, unknown>
): string {
  const root = notificationUrlFromDict(merged);
  if (root) return root;

  const styleObj = parseJsonObjectRecord(merged.style);
  if (styleObj) {
    const fromStyle = notificationUrlFromDict(styleObj);
    if (fromStyle) return fromStyle;
  }

  const templateData = parseJsonObjectRecord(merged.templateData);
  if (templateData) {
    const fromTemplateData = notificationUrlFromDict(templateData);
    if (fromTemplateData) return fromTemplateData;
    const styleInTemplateData = parseJsonObjectRecord(templateData.style);
    if (styleInTemplateData) {
      const fromNested = notificationUrlFromDict(styleInTemplateData);
      if (fromNested) return fromNested;
    }
  }

  const template = parseJsonObjectRecord(merged.template);
  if (template) {
    const templateDataNested = parseJsonObjectRecord(template.data);
    if (templateDataNested) {
      const fromData = notificationUrlFromDict(templateDataNested);
      if (fromData) return fromData;
    }
    const styleInTemplate = parseJsonObjectRecord(template.style);
    if (styleInTemplate) {
      const fromTemplateStyle = notificationUrlFromDict(styleInTemplate);
      if (fromTemplateStyle) return fromTemplateStyle;
    }
  }

  return '';
}
