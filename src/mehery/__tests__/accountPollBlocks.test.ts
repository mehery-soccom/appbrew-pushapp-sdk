jest.mock('react-native-config', () => ({
  MEHERY_ACCOUNT_INLINE_PLACEHOLDER_ID: undefined,
  MEHERY_ACCOUNT_TOOLTIP_PLACEHOLDER_ID: undefined,
  getConstants: () => ({}),
}))

import {
  ACCOUNT_INLINE_PLACEHOLDER_DEFAULT,
  ACCOUNT_INLINE_PLACEHOLDER_ID,
  ACCOUNT_PAGE_NAME,
  ACCOUNT_TOOLTIP_PLACEHOLDER_DEFAULT,
  ACCOUNT_TOOLTIP_PLACEHOLDER_ID,
  ACCOUNT_TOOLTIP_PLACEHOLDER_IDS,
} from '../accountPollConstants'

describe('account poll block contracts', () => {
  it('exports PushApp placeholder ids and page name used on Account', () => {
    expect(ACCOUNT_PAGE_NAME).toBe('account')
    expect(ACCOUNT_INLINE_PLACEHOLDER_DEFAULT).toBe('account_inline')
    expect(ACCOUNT_TOOLTIP_PLACEHOLDER_DEFAULT).toBe(
      'account_edit_profile_tooltip'
    )
    // Without native Config overrides in Jest, resolved ids === defaults.
    expect(ACCOUNT_INLINE_PLACEHOLDER_ID).toBe(ACCOUNT_INLINE_PLACEHOLDER_DEFAULT)
    expect(ACCOUNT_TOOLTIP_PLACEHOLDER_ID).toBe(
      ACCOUNT_TOOLTIP_PLACEHOLDER_DEFAULT
    )
    expect(ACCOUNT_TOOLTIP_PLACEHOLDER_IDS).toEqual(
      expect.arrayContaining([
        'account_edit_profile_tooltip',
        'account_tooltip',
      ])
    )
  })
})
