import {
  ACCOUNT_INLINE_PLACEHOLDER_DEFAULT,
  ACCOUNT_PAGE_NAME,
  ACCOUNT_TOOLTIP_PLACEHOLDER_DEFAULT,
  accountInlinePlaceholderId,
  accountTooltipPlaceholderId,
  accountTooltipPlaceholderIds,
} from '../accountPollConstants'
import { configurePushApp } from '../config'

describe('account poll block contracts', () => {
  it('defaults to the standard PushApp placeholder ids', () => {
    expect(ACCOUNT_PAGE_NAME).toBe('account')
    expect(ACCOUNT_INLINE_PLACEHOLDER_DEFAULT).toBe('account_inline')
    expect(ACCOUNT_TOOLTIP_PLACEHOLDER_DEFAULT).toBe(
      'account_edit_profile_tooltip'
    )
    expect(accountInlinePlaceholderId()).toBe(ACCOUNT_INLINE_PLACEHOLDER_DEFAULT)
    expect(accountTooltipPlaceholderId()).toBe(
      ACCOUNT_TOOLTIP_PLACEHOLDER_DEFAULT
    )
    expect(accountTooltipPlaceholderIds()).toEqual(
      expect.arrayContaining(['account_edit_profile_tooltip', 'account_tooltip'])
    )
  })

  it('uses ids passed to setupPushApp', () => {
    configurePushApp({
      channelId: 'acme_123',
      accountInlinePlaceholderId: 'acct_inline',
      accountTooltipPlaceholderId: 'acct_tip',
    })
    expect(accountInlinePlaceholderId()).toBe('acct_inline')
    expect(accountTooltipPlaceholderId()).toBe('acct_tip')
    expect(accountTooltipPlaceholderIds()[0]).toBe('acct_tip')
  })
})
