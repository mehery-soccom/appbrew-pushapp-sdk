/**
 * PushApp Account tab contracts — must match in-app campaign placeholder ids.
 * Override via react-native-config (requires native rebuild after .env change):
 *   MEHERY_ACCOUNT_INLINE_PLACEHOLDER_ID
 *   MEHERY_ACCOUNT_TOOLTIP_PLACEHOLDER_ID
 */

import Config from 'react-native-config'

export const ACCOUNT_PAGE_NAME = 'account'

export const ACCOUNT_INLINE_PLACEHOLDER_DEFAULT = 'account_inline'
/** PushApp Account tooltip campaign placeholder id. */
export const ACCOUNT_TOOLTIP_PLACEHOLDER_DEFAULT =
  'account_edit_profile_tooltip'

function readEnv(key: string): string | undefined {
  try {
    const direct = (Config as Record<string, string | undefined>)[key]?.trim()
    if (direct) {
      return direct
    }
  } catch {
    /* ignore */
  }
  try {
    const constants = (
      Config as { getConstants?: () => Record<string, string> }
    ).getConstants?.()
    const fromConstants = constants?.[key]?.trim()
    if (fromConstants) {
      return fromConstants
    }
  } catch {
    /* ignore */
  }
  return undefined
}

export const ACCOUNT_INLINE_PLACEHOLDER_ID =
  readEnv('MEHERY_ACCOUNT_INLINE_PLACEHOLDER_ID') ||
  ACCOUNT_INLINE_PLACEHOLDER_DEFAULT

export const ACCOUNT_TOOLTIP_PLACEHOLDER_ID =
  readEnv('MEHERY_ACCOUNT_TOOLTIP_PLACEHOLDER_ID') ||
  ACCOUNT_TOOLTIP_PLACEHOLDER_DEFAULT

/**
 * Tooltip ids to mount + request via widget_open.
 * Primary is `account_edit_profile_tooltip`; keep `account_tooltip` as alias.
 */
export const ACCOUNT_TOOLTIP_PLACEHOLDER_IDS: string[] = Array.from(
  new Set(
    [
      ACCOUNT_TOOLTIP_PLACEHOLDER_ID,
      ACCOUNT_TOOLTIP_PLACEHOLDER_DEFAULT,
      'account_edit_profile_tooltip',
      'account_tooltip',
    ].filter(Boolean)
  )
)
