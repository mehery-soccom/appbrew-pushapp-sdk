/** Pure helpers for Shopify CAT renew timing (no RN deps). */

/** Renew when expiry is missing, past, or within this window. */
export const RENEW_WITHIN_MS = 12 * 60 * 60 * 1000

export function shouldRenewCustomerAccessToken(
  expiresAt: string | null | undefined,
  nowMs: number = Date.now(),
  withinMs: number = RENEW_WITHIN_MS
): boolean {
  if (expiresAt == null || !String(expiresAt).trim()) {
    return true
  }
  const expiryMs = new Date(expiresAt).getTime()
  if (!Number.isFinite(expiryMs)) {
    return true
  }
  return expiryMs - nowMs <= withinMs
}
