/**
 * PushApp Account tab contracts — must match in-app campaign placeholder ids.
 * Override with `accountInlinePlaceholderId` / `accountTooltipPlaceholderId`
 * in setupPushApp().
 */

import { peekPushAppConfig } from './config'

export const ACCOUNT_PAGE_NAME = 'account'

export const ACCOUNT_INLINE_PLACEHOLDER_DEFAULT = 'account_inline'
/** PushApp Account tooltip campaign placeholder id. */
export const ACCOUNT_TOOLTIP_PLACEHOLDER_DEFAULT =
  'account_edit_profile_tooltip'

export function accountInlinePlaceholderId(): string {
  return (
    peekPushAppConfig()?.accountInlinePlaceholderId?.trim() ||
    ACCOUNT_INLINE_PLACEHOLDER_DEFAULT
  )
}

export function accountTooltipPlaceholderId(): string {
  return (
    peekPushAppConfig()?.accountTooltipPlaceholderId?.trim() ||
    ACCOUNT_TOOLTIP_PLACEHOLDER_DEFAULT
  )
}

/**
 * Tooltip ids to mount + request via widget_open.
 * Primary is the configured id; keep `account_tooltip` as alias.
 */
export function accountTooltipPlaceholderIds(): string[] {
  return Array.from(
    new Set(
      [
        accountTooltipPlaceholderId(),
        ACCOUNT_TOOLTIP_PLACEHOLDER_DEFAULT,
        'account_tooltip',
      ].filter(Boolean)
    )
  )
}
