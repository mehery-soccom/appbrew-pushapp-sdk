import {
  RENEW_WITHIN_MS,
  shouldRenewCustomerAccessToken,
} from '../sessionKeepAliveLogic'

describe('shouldRenewCustomerAccessToken', () => {
  const now = Date.parse('2026-09-15T12:00:00.000Z')

  it('renews when expiresAt missing', () => {
    expect(shouldRenewCustomerAccessToken(undefined, now)).toBe(true)
    expect(shouldRenewCustomerAccessToken(null, now)).toBe(true)
    expect(shouldRenewCustomerAccessToken('', now)).toBe(true)
  })

  it('renews when already expired', () => {
    expect(
      shouldRenewCustomerAccessToken('2026-09-14T12:00:00.000Z', now)
    ).toBe(true)
  })

  it('renews when within the default 12h window', () => {
    const inSixHours = new Date(now + 6 * 60 * 60 * 1000).toISOString()
    expect(shouldRenewCustomerAccessToken(inSixHours, now)).toBe(true)
  })

  it('skips when expiry is farther than the window', () => {
    const inTwoDays = new Date(now + 48 * 60 * 60 * 1000).toISOString()
    expect(shouldRenewCustomerAccessToken(inTwoDays, now)).toBe(false)
    expect(
      shouldRenewCustomerAccessToken(inTwoDays, now, RENEW_WITHIN_MS)
    ).toBe(false)
  })

  it('renews invalid date strings', () => {
    expect(shouldRenewCustomerAccessToken('not-a-date', now)).toBe(true)
  })
})
