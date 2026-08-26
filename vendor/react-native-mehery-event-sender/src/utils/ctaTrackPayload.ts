/**
 * CTA track field helpers: `data.ctaId` (button text) + `data.button_id` (machine id).
 */

import {
  labelFromButton,
  legacyLabelAtIndex,
  machineIdFromButton,
  parseCtaButtonArray,
  pushActionButtonIndex,
} from './pushTrackPayload';

export type CtaTrackFields = { ctaId: string; button_id: string };

const normalizedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/** Build CTA data; `button_id` defaults to "" when unknown (in-app). */
export function buildCtaData(ctaId: string, buttonId?: string): CtaTrackFields {
  const label = normalizedString(ctaId);
  const id = normalizedString(buttonId);
  return {
    ctaId: label,
    button_id: id,
  };
}

/** Synthetic / media CTAs use the same value for both fields. */
export function buildSyntheticCtaData(id: string): CtaTrackFields {
  const v = normalizedString(id);
  return { ctaId: v, button_id: v };
}

/**
 * Normalize WebView postMessage fields into CTA track pair.
 * `button_id` is "" when not present or unresolvable.
 */
export function normalizeInAppCtaFields(
  msg: Record<string, unknown>
): CtaTrackFields {
  const data =
    msg.data != null && typeof msg.data === 'object' && !Array.isArray(msg.data)
      ? (msg.data as Record<string, unknown>)
      : {};

  const ctaId = normalizedString(
    msg.ctaId ??
      msg.label ??
      data.label ??
      data.button_text ??
      msg.button_text ??
      msg.value
  );
  const button_id = normalizedString(
    msg.button_id ??
      msg.eventType ??
      data.button_id ??
      data.id ??
      data.actionId ??
      data.eventType
  );

  if (ctaId && button_id) {
    return { ctaId, button_id };
  }
  if (ctaId) {
    return buildCtaData(ctaId, '');
  }
  if (button_id) {
    return { ctaId: button_id, button_id };
  }
  return { ctaId: '', button_id: '' };
}

function legacyActionIdAtIndex(
  merged: Record<string, unknown>,
  index: number
): string {
  const key = `action${index + 1}` as 'action1' | 'action2' | 'action3';
  return normalizedString(merged[key]);
}

function resolveFromLegacySlots(
  merged: Record<string, unknown>,
  actionRaw: string
): CtaTrackFields | null {
  const action = normalizedString(actionRaw);
  if (!action) return null;

  for (let i = 0; i < 3; i++) {
    const actionId = legacyActionIdAtIndex(merged, i);
    const label = legacyLabelAtIndex(merged, i);
    if (actionId && action === actionId) {
      return {
        ctaId: label || actionId,
        button_id: actionId,
      };
    }
    if (label && action === label && actionId) {
      return { ctaId: label, button_id: actionId };
    }
  }
  return null;
}

function resolveFromCtaButtons(
  merged: Record<string, unknown>,
  actionRaw: string
): CtaTrackFields | null {
  const action = normalizedString(actionRaw);
  if (!action) return null;

  const buttons = parseCtaButtonArray(merged.cta_buttons ?? merged.buttons);
  if (buttons.length === 0) return null;

  const idx = pushActionButtonIndex(action);
  if (idx !== null && idx >= 0 && idx < buttons.length) {
    const btn = buttons[idx]!;
    const button_id = machineIdFromButton(btn, `cta_${idx + 1}`);
    const ctaId = labelFromButton(btn, button_id);
    return { ctaId, button_id };
  }

  for (const btn of buttons) {
    const bid = machineIdFromButton(btn, '');
    const label = labelFromButton(btn, bid);
    if (bid && bid === action) {
      return { ctaId: label || bid, button_id: bid };
    }
    if (label && label === action) {
      return { ctaId: label, button_id: bid || '' };
    }
  }
  return null;
}

/**
 * Resolve push CTA tap into label + machine id (both directions: OS id or visible label).
 */
export function resolvePushCtaFields(
  actionRaw: string,
  merged: Record<string, unknown>
): CtaTrackFields {
  const action = normalizedString(actionRaw);
  if (!action) {
    return { ctaId: '', button_id: '' };
  }

  const fromLegacy = resolveFromLegacySlots(merged, action);
  if (fromLegacy) return fromLegacy;

  const fromButtons = resolveFromCtaButtons(merged, action);
  if (fromButtons) return fromButtons;

  const idx = pushActionButtonIndex(action);
  if (idx !== null) {
    const label = legacyLabelAtIndex(merged, idx);
    if (label) {
      return { ctaId: label, button_id: action };
    }
  }

  // OS action id with no mapped label — use id for both so backend can match button_id.
  if (action.startsWith('PUSHAPP_')) {
    return { ctaId: action, button_id: action };
  }

  return { ctaId: action, button_id: '' };
}

/** Build in-app track `data` object for event === 'cta'. */
export function buildInAppCtaData(cta: CtaTrackFields): {
  ctaId: string;
  button_id: string;
} {
  return { ctaId: cta.ctaId, button_id: cta.button_id };
}
