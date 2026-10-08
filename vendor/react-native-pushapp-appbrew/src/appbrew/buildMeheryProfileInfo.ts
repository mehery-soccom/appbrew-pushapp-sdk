function trimString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  return null
}

function trimPhone(value: unknown): string | null {
  return trimString(value)
}

type RememberedMeheryIdentity = {
  email?: string
  phone?: string
}

/** Process-local cache so name-only store updates do not drop OTP email/phone. */
let rememberedIdentity: RememberedMeheryIdentity = {}

export function getRememberedMeheryIdentity(): RememberedMeheryIdentity {
  return { ...rememberedIdentity }
}

export function clearRememberedMeheryIdentity(): void {
  rememberedIdentity = {}
}

/**
 * Remember the strongest email/phone we have seen for this session so later
 * Shopify customer payloads (often missing Customer.phone) still PUT them.
 */
export function rememberMeheryIdentityFromUser(user: any): void {
  if (!user || typeof user !== 'object') {
    return
  }
  const email = resolveMeheryEmail(user)
  const phone = resolveMeheryPhone(user)
  if (email) {
    rememberedIdentity.email = email
  }
  if (phone) {
    rememberedIdentity.phone = phone
  }
}

/**
 * Fill missing email/phone on a customer from the remembered identity cache.
 */
export function applyRememberedMeheryIdentity(user: any): any {
  if (!user || typeof user !== 'object') {
    return user
  }
  let next = user
  if (!resolveMeheryEmail(next) && rememberedIdentity.email) {
    next = { ...next, email: rememberedIdentity.email }
  }
  if (!resolveMeheryPhone(next) && rememberedIdentity.phone) {
    next = { ...next, phoneNumber: rememberedIdentity.phone }
  }
  return next
}

/**
 * Build E.164-ish phone from OTP UI fields. Does not invent a country code.
 */
export function formatOtpPhone(
  callingCode?: string | null,
  phoneNumber?: string | null
): string | null {
  const national = trimPhone(phoneNumber)
  if (!national) return null
  if (national.startsWith('+')) return national
  const code = trimPhone(callingCode)?.replace(/^\+/, '')
  if (code) return `+${code}${national}`
  return national
}

/**
 * Merge verified OTP phone onto a Shopify customer when the customer object
 * has no resolvable phone (common for email-first / OTP-only accounts).
 */
export function mergeMeheryIdentityPhone(
  user: any,
  otpPhone?: string | null
): any {
  if (!user || typeof user !== 'object') {
    return user
  }
  const phone = trimPhone(otpPhone)
  if (!phone) {
    return user
  }
  if (resolveMeheryPhone(user)) {
    return user
  }
  return { ...user, phoneNumber: phone }
}

/**
 * Merge verified OTP / form email when Shopify customer.email is empty.
 */
export function mergeMeheryIdentityEmail(
  user: any,
  otpEmail?: string | null
): any {
  if (!user || typeof user !== 'object') {
    return user
  }
  const email = trimString(otpEmail)
  if (!email) {
    return user
  }
  if (resolveMeheryEmail(user)) {
    return user
  }
  return { ...user, email }
}

/** Merge phone + email helpers in one call (OTP / signup). */
export function mergeMeheryIdentityFields(
  user: any,
  opts?: { phone?: string | null; email?: string | null }
): any {
  let next = user
  next = mergeMeheryIdentityPhone(next, opts?.phone)
  next = mergeMeheryIdentityEmail(next, opts?.email)
  return next
}

/**
 * Shopify Storefront `Customer.phone` is often null for email-first accounts;
 * the number usually lives on `defaultAddress.phone` or `addresses.edges[].node.phone`.
 * OTP/UI paths may still pass `phoneNumber` / `mobile`.
 */
export function resolveMeheryPhone(user: any): string | null {
  const direct =
    trimPhone(user?.phone) ??
    trimPhone(user?.phoneNumber) ??
    trimPhone(user?.mobile)
  if (direct) return direct

  const fromDefault = trimPhone(user?.defaultAddress?.phone)
  if (fromDefault) return fromDefault

  const edges = user?.addresses?.edges
  if (Array.isArray(edges)) {
    for (const edge of edges) {
      const fromAddress = trimPhone(edge?.node?.phone)
      if (fromAddress) return fromAddress
    }
  }

  const phones = user?.phones
  if (Array.isArray(phones) && phones.length) {
    const first = phones[0]
    if (typeof first === 'string') {
      return trimPhone(first)
    }
    if (first && typeof first === 'object') {
      return trimPhone((first as { phone?: unknown }).phone)
    }
  }

  return null
}

/**
 * Resolve signup / account email from common Shopify + OTP shapes.
 */
export function resolveMeheryEmail(user: any): string | null {
  const direct =
    trimString(user?.email) ??
    trimString(user?.emailAddress) ??
    trimString(user?.defaultEmail)
  if (direct) return direct

  const emails = user?.emails
  if (Array.isArray(emails) && emails.length) {
    const first = emails[0]
    if (typeof first === 'string') {
      return trimString(first)
    }
    if (first && typeof first === 'object') {
      return trimString((first as { email?: unknown }).email)
    }
  }

  return null
}

/**
 * Host identity → SDK `updateUserProfile` info (Starquik call shape).
 *
 * ```ts
 * updateUserProfile({
 *   name: 'Jane Doe',
 *   phones: ['+919876543210'],
 *   email: 'jane@example.com',
 *   // alt_emails: [{ email: '…' }] when available
 * })
 * ```
 *
 * SDK wire PUT: string `name`, `phones[].phone`, scalar `email` and
 * `alt_emails` under `additionalInfo`. Omits `source` (admin-only).
 */
export function buildMeheryProfileInfo(user: any): Record<string, unknown> {
  const enriched = applyRememberedMeheryIdentity(user)
  rememberMeheryIdentityFromUser(enriched)

  const info: Record<string, unknown> = {}

  const fromParts = [enriched?.firstName, enriched?.lastName]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(' ')
    .trim()
  const fromString =
    typeof enriched?.name === 'string' ? enriched.name.trim() : ''
  const fromObject =
    enriched?.name &&
    typeof enriched.name === 'object' &&
    typeof enriched.name.formattedName === 'string'
      ? enriched.name.formattedName.trim()
      : ''
  const fromDisplay =
    typeof enriched?.displayName === 'string'
      ? enriched.displayName.trim()
      : ''
  const name = fromParts || fromString || fromObject || fromDisplay
  if (name) {
    info.name = name
  }

  const phone = resolveMeheryPhone(enriched)
  if (phone) {
    info.phones = [phone]
  }

  const email = resolveMeheryEmail(enriched)
  if (email) {
    info.email = email
  }

  const altEmails = resolveMeheryAltEmails(enriched, email)
  if (altEmails?.length) {
    info.alt_emails = altEmails
  }

  return info
}

/**
 * Optional alternate emails from Shopify / host shapes (never invent).
 * Excludes the primary email when both are present.
 */
function resolveMeheryAltEmails(
  user: any,
  primaryEmail?: string | null
): Array<{ email: string }> | undefined {
  const primaryKey = primaryEmail?.trim().toLowerCase() ?? ''
  const out: Array<{ email: string }> = []
  const seen = new Set<string>()

  const push = (raw: unknown) => {
    const value = trimString(raw)
    if (!value) return
    const key = value.toLowerCase()
    if (primaryKey && key === primaryKey) return
    if (seen.has(key)) return
    seen.add(key)
    out.push({ email: value })
  }

  const altList = user?.alt_emails ?? user?.altEmails
  if (Array.isArray(altList)) {
    for (const entry of altList) {
      if (typeof entry === 'string') {
        push(entry)
      } else if (entry && typeof entry === 'object') {
        push((entry as { email?: unknown }).email)
      }
    }
  }

  // emails[1+] → alt when emails[0] was used as primary
  const emails = user?.emails
  if (Array.isArray(emails) && emails.length > 1) {
    for (const entry of emails.slice(1)) {
      if (typeof entry === 'string') {
        push(entry)
      } else if (entry && typeof entry === 'object') {
        push((entry as { email?: unknown }).email)
      }
    }
  }

  return out.length ? out : undefined
}
