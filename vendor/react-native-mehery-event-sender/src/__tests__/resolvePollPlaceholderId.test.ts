import {
  normalizePlaceholderId,
  resolvePollPlaceholderId,
} from '../helpers/resolvePollPlaceholderId'

describe('resolvePollPlaceholderId', () => {
  it('treats empty compare arrays as missing so style.placeholder_id wins', () => {
    expect(normalizePlaceholderId([])).toBe('')
    expect(resolvePollPlaceholderId([], 'account_tooltip')).toBe(
      'account_tooltip'
    )
  })

  it('prefers a non-empty compare string over style', () => {
    expect(
      resolvePollPlaceholderId('account_tooltip', 'other_tooltip')
    ).toBe('account_tooltip')
  })

  it('unwraps compare arrays that contain an id string', () => {
    expect(resolvePollPlaceholderId(['account_tooltip'], 'other')).toBe(
      'account_tooltip'
    )
  })

  it('returns empty when both sources are empty', () => {
    expect(resolvePollPlaceholderId([], '')).toBe('')
    expect(resolvePollPlaceholderId(null, undefined)).toBe('')
  })
})
