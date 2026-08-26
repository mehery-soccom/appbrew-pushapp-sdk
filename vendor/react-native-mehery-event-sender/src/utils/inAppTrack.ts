/**
 * In-app CTA track payload helper (shape only; POST stays in poll components).
 */

import {
  buildInAppCtaData,
  type CtaTrackFields,
} from './ctaTrackPayload';

export type InAppTrackEvent =
  | 'cta'
  | 'dismissed'
  | 'longPress'
  | 'openUrl'
  | 'unknown';

/** Build `data` for in-app track when event is `cta`. */
export function buildInAppTrackData(
  eventType: InAppTrackEvent,
  cta?: CtaTrackFields
): Record<string, unknown> {
  if (eventType === 'cta' && cta) {
    return buildInAppCtaData(cta);
  }
  return {};
}
