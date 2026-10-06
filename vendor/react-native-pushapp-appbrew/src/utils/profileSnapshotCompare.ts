export const LEGACY_PROFILE_UPDATED_KEY = 'mehery_profile_updated';

const PROFILE_SNAPSHOT_KEY_PREFIX = 'mehery_last_profile_snapshot:';

export type ProfilePhone = { phone: string; uuid?: string };
export type ProfileEmail = { email: string; uuid?: string };

/**
 * Wire name is a plain string (Mehery docs / upstream SDK).
 * `{ formattedName }` is accepted on input and normalized to a string.
 */
export type ProfileApiPayload = {
  name?: string;
  phones?: ProfilePhone[];
  emails?: ProfileEmail[];
  devices?: unknown[];
  additionalInfo?: Record<string, unknown>;
  cohorts?: Record<string, unknown>;
  code?: string | null;
  rmCode?: string | null;
  source?: string;
};

const RESERVED_INFO_KEYS = new Set([
  'name',
  'phones',
  'mobile',
  'phone',
  'emails',
  'alt_emails',
  'devices',
  'code',
  'rmCode',
  'source',
]);

/** Normalize host/docs name input to a plain string for the PUT body. */
function normalizeName(value: unknown): string | undefined {
  if (value == null) return undefined;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  if (Array.isArray(value)) {
    const joined = value
      .filter(
        (part): part is string =>
          typeof part === 'string' && part.trim().length > 0
      )
      .join(' ')
      .trim();
    return joined ? joined : undefined;
  }

  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    if (typeof rec.formattedName === 'string' && rec.formattedName.trim()) {
      return rec.formattedName.trim();
    }
    const joined = [rec.firstName, rec.lastName, rec.first_name, rec.last_name]
      .filter(
        (part): part is string =>
          typeof part === 'string' && part.trim().length > 0
      )
      .join(' ')
      .trim();
    return joined ? joined : undefined;
  }

  return undefined;
}

function uniqueEmails(emails: ProfileEmail[]): ProfileEmail[] {
  const seen = new Set<string>();
  const unique: ProfileEmail[] = [];
  for (const entry of emails) {
    const key = entry.email.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }
  return unique;
}

function normalizePhones(value: unknown): ProfilePhone[] | undefined {
  if (value == null) return undefined;

  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    const first = value[0];
    if (typeof first === 'string') {
      return value
        .filter(
          (item): item is string =>
            typeof item === 'string' && item.trim().length > 0
        )
        .map((phone) => ({ phone: phone.trim() }));
    }
    if (first && typeof first === 'object' && 'phone' in first) {
      return value as ProfilePhone[];
    }
    return undefined;
  }

  if (typeof value === 'string' && value.trim()) {
    return [{ phone: value.trim() }];
  }

  return undefined;
}

function normalizeEmails(value: unknown): ProfileEmail[] | undefined {
  if (value == null) return undefined;

  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    const first = value[0];
    if (typeof first === 'string') {
      return value
        .filter(
          (item): item is string =>
            typeof item === 'string' && item.trim().length > 0
        )
        .map((email) => ({ email: email.trim() }));
    }
    if (first && typeof first === 'object' && 'email' in first) {
      const emails = (value as ProfileEmail[])
        .map((entry) => {
          const email =
            typeof entry?.email === 'string' ? entry.email.trim() : '';
          if (!email) return undefined;
          return entry.uuid
            ? { email, uuid: entry.uuid }
            : { email };
        })
        .filter((entry): entry is ProfileEmail => entry != null);
      return emails.length ? emails : undefined;
    }
    return undefined;
  }

  if (typeof value === 'string' && value.trim()) {
    return [{ email: value.trim() }];
  }

  return undefined;
}

export function profileSnapshotStorageKey(userId: string): string {
  return `${PROFILE_SNAPSHOT_KEY_PREFIX}${userId.trim()}`;
}

function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeysDeep(obj[key]);
  }
  return sorted;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function copyOptionalTopLevel(
  from: ProfileApiPayload,
  to: ProfileApiPayload
): void {
  if (from.devices !== undefined) to.devices = from.devices;
  if (from.cohorts !== undefined) to.cohorts = from.cohorts;
  if ('code' in from) to.code = from.code;
  if ('rmCode' in from) to.rmCode = from.rmCode;
  if (from.source !== undefined) to.source = from.source;
}

function splitPrimaryAndAltEmails(
  emails?: ProfileEmail[],
  extra?: ProfileEmail[]
): { primary?: ProfileEmail[]; alt?: ProfileEmail[] } {
  const primary = emails?.[0] ? [emails[0]] : undefined;
  const rest = emails && emails.length > 1 ? emails.slice(1) : [];
  const primaryKey = primary?.[0]?.email.trim().toLowerCase();
  const alt = uniqueEmails(
    [...rest, ...(extra ?? [])].filter(
      (entry) => entry.email.trim().toLowerCase() !== primaryKey
    )
  );
  return { primary, alt: alt.length ? alt : undefined };
}

function applyCanonicalShape(snapshot: ProfileApiPayload): ProfileApiPayload {
  const extra = { ...(snapshot.additionalInfo ?? {}) };
  const payload: ProfileApiPayload = {};
  copyOptionalTopLevel(snapshot, payload);

  const name = normalizeName(snapshot.name ?? extra.name);
  if (name) payload.name = name;
  delete extra.name;

  const phones =
    snapshot.phones ??
    normalizePhones(extra.phones ?? extra.mobile ?? extra.phone);
  if (phones) payload.phones = phones;
  delete extra.phones;
  delete extra.mobile;
  delete extra.phone;

  // Scalar email stays in additionalInfo (PushApp rejects top-level emails add).
  const liftedEmails = snapshot.emails ?? normalizeEmails(extra.emails);
  delete extra.emails;

  const { primary, alt } = splitPrimaryAndAltEmails(
    liftedEmails,
    normalizeEmails(extra.alt_emails)
  );
  if (primary) payload.emails = primary;
  delete extra.alt_emails;

  const additionalInfo: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extra)) {
    if (RESERVED_INFO_KEYS.has(key)) continue;
    additionalInfo[key] = value;
  }
  if (alt) {
    additionalInfo.alt_emails = alt;
  }
  if (Object.keys(additionalInfo).length) {
    payload.additionalInfo = additionalInfo;
  }

  return payload;
}

function alreadyCanonical(snapshot: ProfileApiPayload): boolean {
  if (isLegacyProfileSnapshot(snapshot)) return false;
  if (snapshot.emails && snapshot.emails.length > 1) return false;
  // Docs / upstream: top-level name is a plain string (not { formattedName }).
  if (snapshot.name !== undefined && typeof snapshot.name !== 'string') {
    return false;
  }
  const extra = snapshot.additionalInfo;
  if (extra && typeof extra === 'object') {
    if (
      'name' in extra ||
      'emails' in extra ||
      'phone' in extra ||
      'phones' in extra ||
      'mobile' in extra
    ) {
      return false;
    }
  }
  return true;
}

/** Lifts legacy identity fields and normalizes name / alt_emails to API shape. */
export function canonicalizeProfileSnapshot(
  snapshot: ProfileApiPayload
): ProfileApiPayload {
  if (alreadyCanonical(snapshot)) {
    return snapshot;
  }
  return applyCanonicalShape(snapshot);
}

export function profilePayloadsEqual(
  a: ProfileApiPayload,
  b: ProfileApiPayload
): boolean {
  return (
    stableStringify(canonicalizeProfileSnapshot(a)) ===
    stableStringify(canonicalizeProfileSnapshot(b))
  );
}

/**
 * Maps SDK `updateUserProfile(info, cohorts)` args to the PUT body expected by
 * CustomerProfileService.updateProfile: top-level name/phones, scalar email
 * and alt emails under additionalInfo, cohort keys in cohorts.
 * PushApp rejects a top-level `emails` add; explicit `emails[]` is the only
 * path that still sets top-level emails.
 */
function phoneNumbersEqual(
  a?: ProfilePhone[],
  b?: ProfilePhone[]
): boolean {
  const normalize = (phones?: ProfilePhone[]) =>
    (phones ?? [])
      .map((entry) => entry.phone.trim())
      .filter(Boolean)
      .sort()
      .join('|');
  return normalize(a) === normalize(b);
}

function emailAddressesEqual(
  a?: ProfileEmail[],
  b?: ProfileEmail[]
): boolean {
  const normalize = (emails?: ProfileEmail[]) =>
    (emails ?? [])
      .map((entry) => entry.email.trim().toLowerCase())
      .filter(Boolean)
      .sort()
      .join('|');
  return normalize(a) === normalize(b);
}

/** True when a prior SDK version stored signup email under additionalInfo.email. */
export function lastSnapshotStoresEmailInAdditionalInfo(
  snapshot?: ProfileApiPayload | null
): boolean {
  if (!snapshot || snapshot.emails?.length) return false;
  const additionalInfo = snapshot.additionalInfo;
  if (!additionalInfo || typeof additionalInfo !== 'object') return false;
  if (typeof additionalInfo.email === 'string' && additionalInfo.email.trim()) {
    return true;
  }
  return Boolean(
    Array.isArray(additionalInfo.emails) && additionalInfo.emails.length
  );
}

/** True when a prior SDK version stored signup phone under additionalInfo.phone. */
export function lastSnapshotStoresPhoneInAdditionalInfo(
  snapshot?: ProfileApiPayload | null
): boolean {
  if (!snapshot || snapshot.phones?.length) return false;
  const additionalInfo = snapshot.additionalInfo;
  if (!additionalInfo || typeof additionalInfo !== 'object') return false;
  if (typeof additionalInfo.phone === 'string' && additionalInfo.phone.trim()) {
    return true;
  }
  if (typeof additionalInfo.mobile === 'string' && additionalInfo.mobile.trim()) {
    return true;
  }
  return Boolean(
    Array.isArray(additionalInfo.phones) && additionalInfo.phones.length
  );
}

const IDENTITY_ADDITIONAL_KEYS = [
  'email',
  'emails',
  'phone',
  'phones',
  'mobile',
] as const;

export function stripIdentityKeysFromAdditionalInfo(
  payload: ProfileApiPayload
): ProfileApiPayload {
  if (!payload.additionalInfo) return payload;
  const extra = { ...payload.additionalInfo };
  for (const key of IDENTITY_ADDITIONAL_KEYS) {
    delete extra[key];
  }
  const next = { ...payload };
  if (Object.keys(extra).length) {
    next.additionalInfo = extra;
  } else {
    delete next.additionalInfo;
  }
  return next;
}

export function isProfileUpdatePayloadEmpty(
  payload: ProfileApiPayload
): boolean {
  return (
    payload.name === undefined &&
    payload.phones === undefined &&
    payload.emails === undefined &&
    payload.devices === undefined &&
    payload.source === undefined &&
    !('code' in payload) &&
    !('rmCode' in payload) &&
    (!payload.additionalInfo ||
      Object.keys(payload.additionalInfo).length === 0) &&
    (!payload.cohorts || Object.keys(payload.cohorts).length === 0)
  );
}

/** Old SDK snapshots stored name/phones inside additionalInfo only. */
export function isLegacyProfileSnapshot(snapshot: ProfileApiPayload): boolean {
  const additionalInfo = snapshot.additionalInfo;
  if (!additionalInfo) return false;
  const hasIdentityInAdditional =
    'name' in additionalInfo ||
    'phones' in additionalInfo ||
    'phone' in additionalInfo ||
    'mobile' in additionalInfo ||
    'email' in additionalInfo ||
    'emails' in additionalInfo;
  return (
    hasIdentityInAdditional &&
    snapshot.name === undefined &&
    snapshot.phones === undefined
  );
}

/**
 * Pushapp rejects re-adding a phone that already exists on the profile (or
 * another profile). Omit unchanged phones/emails when we already pushed them.
 */
export function prepareProfileUpdatePayload(
  desired: ProfileApiPayload,
  lastSuccessful?: ProfileApiPayload | null
): ProfileApiPayload {
  const outbound: ProfileApiPayload = { ...desired };

  // Never send `devices` on profile PUT. PushApp treats that array as a
  // replacement list, so a name-only update would drop other linked devices
  // (Device 3→1) even when customer `code` is unchanged.
  delete outbound.devices;

  if (!lastSuccessful) {
    return outbound;
  }

  // Only omit phones/emails when the last *persisted* payload already used
  // top-level arrays. If they lived in additionalInfo, keep sending them so
  // the profile API can move them out of additionalInfo.
  if (
    outbound.phones &&
    lastSuccessful.phones?.length &&
    phoneNumbersEqual(outbound.phones, lastSuccessful.phones)
  ) {
    delete outbound.phones;
  }

  if (
    outbound.emails &&
    lastSuccessful.emails?.length &&
    emailAddressesEqual(outbound.emails, lastSuccessful.emails)
  ) {
    delete outbound.emails;
  }

  return outbound;
}

export function buildProfileApiPayload(
  info: Record<string, unknown>,
  cohorts: Record<string, unknown>
): ProfileApiPayload {
  const additionalInfo: Record<string, unknown> = {};
  const payload: ProfileApiPayload = {};

  const name = normalizeName(info.name);
  if (name) {
    payload.name = name;
  }

  const phones = normalizePhones(info.phones ?? info.mobile ?? info.phone);
  if (phones) {
    payload.phones = phones;
  }

  // Explicit emails[] only. Scalar `email` is not reserved, so it lands in
  // additionalInfo (PushApp rejects a top-level emails add — Starquik contract).
  let alt: ProfileEmail[] | undefined;
  if (Array.isArray(info.emails) && info.emails.length) {
    const { primary, alt: altFromSplit } = splitPrimaryAndAltEmails(
      normalizeEmails(info.emails),
      normalizeEmails(info.alt_emails)
    );
    if (primary) {
      payload.emails = primary;
    }
    alt = altFromSplit;
  } else {
    const altOnly = normalizeEmails(info.alt_emails);
    alt = altOnly?.length ? uniqueEmails(altOnly) : undefined;
  }

  if (Array.isArray(info.devices)) {
    payload.devices = info.devices;
  }

  if (typeof info.code === 'string' || info.code === null) {
    payload.code = info.code as string | null;
  }
  if (typeof info.rmCode === 'string' || info.rmCode === null) {
    payload.rmCode = info.rmCode as string | null;
  }
  if (typeof info.source === 'string' && info.source.trim()) {
    payload.source = info.source.trim();
  }

  for (const [key, value] of Object.entries(info)) {
    if (RESERVED_INFO_KEYS.has(key)) continue;
    additionalInfo[key] = value;
  }

  if (alt) {
    additionalInfo.alt_emails = alt;
  }

  if (Object.keys(additionalInfo).length) {
    payload.additionalInfo = additionalInfo;
  }

  if (Object.keys(cohorts).length) {
    payload.cohorts = cohorts;
  }

  return payload;
}
