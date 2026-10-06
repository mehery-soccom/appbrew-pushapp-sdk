/**
 * Excel / Event Analytics payload for dual-send after a successful profile PUT.
 */

export function buildUpdateUserProfileEventPayload(
  profileInfo: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  if (typeof profileInfo.name === 'string' && profileInfo.name.trim()) {
    out.name = profileInfo.name.trim()
  } else if (
    profileInfo.name &&
    typeof profileInfo.name === 'object' &&
    typeof (profileInfo.name as { formattedName?: string }).formattedName ===
      'string'
  ) {
    const formatted = (
      profileInfo.name as { formattedName: string }
    ).formattedName.trim()
    if (formatted) {
      out.name = formatted
    }
  }

  if (typeof profileInfo.email === 'string' && profileInfo.email.trim()) {
    out.email = profileInfo.email.trim()
  } else if (Array.isArray(profileInfo.emails) && profileInfo.emails.length) {
    const first = profileInfo.emails[0]
    if (typeof first === 'string' && first.trim()) {
      out.email = first.trim()
    } else if (
      first &&
      typeof first === 'object' &&
      typeof (first as { email?: string }).email === 'string'
    ) {
      const e = (first as { email: string }).email.trim()
      if (e) {
        out.email = e
      }
    }
  }

  let phone: string | undefined
  if (typeof profileInfo.phone === 'string' && profileInfo.phone.trim()) {
    phone = profileInfo.phone.trim()
  } else if (Array.isArray(profileInfo.phones) && profileInfo.phones.length) {
    const first = profileInfo.phones[0]
    if (typeof first === 'string' && first.trim()) {
      phone = first.trim()
    } else if (
      first &&
      typeof first === 'object' &&
      typeof (first as { phone?: string }).phone === 'string'
    ) {
      const p = (first as { phone: string }).phone.trim()
      if (p) {
        phone = p
      }
    }
  }
  if (phone) {
    out.phone = phone
  }

  return out
}
