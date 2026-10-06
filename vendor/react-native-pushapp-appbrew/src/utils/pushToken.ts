/**
 * FCM registration tokens contain ':' (e.g. APA91b...).
 * APNs device tokens are hex. Using FCM as the iOS `token` on
 * `/device/register` or `/update/token` replaces the Mongo session
 * ObjectId with an MD5 and `/device/link` 500s (CastError).
 */
export function isFcmLikePushToken(
  token: string | null | undefined
): boolean {
  return Boolean(token && token.includes(':'));
}

export function pickApnsToken(
  ...candidates: Array<string | null | undefined>
): string {
  for (const candidate of candidates) {
    const token = (candidate ?? '').trim();
    if (token && !isFcmLikePushToken(token)) {
      return token;
    }
  }
  return '';
}

/**
 * Stable 64-char hex stand-in for APNs when the iOS Simulator never delivers a
 * real device token. Must stay hex-only (no ':') so /device/register + /device/link
 * do not hit the FCM-as-token CastError path.
 */
export function buildDevApnsToken(seed: string): string {
  let hex = '';
  const source = seed.trim() || 'mehery-sim';
  for (let i = 0; i < source.length; i++) {
    hex += source.charCodeAt(i).toString(16).padStart(2, '0');
  }
  // Mix in a fixed salt so short seeds still fill 64 hex chars uniquely enough.
  const salt = '6d65686572792d73696d2d61706e73'; // "mehery-sim-apns" hex
  hex = `${hex}${salt}${hex}`;
  return hex.slice(0, 64).padEnd(64, '0');
}
