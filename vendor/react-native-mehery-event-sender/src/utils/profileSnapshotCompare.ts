export const LEGACY_PROFILE_UPDATED_KEY = 'mehery_profile_updated';

const PROFILE_SNAPSHOT_KEY_PREFIX = 'mehery_last_profile_snapshot:';

export type ProfilePhone = { phone: string; uuid?: string };
export type ProfileEmail = { email: string; uuid?: string };

export type ProfileApiPayload = {
  name?: string | Record<string, unknown>;
  phones?: ProfilePhone[];
  emails?: ProfileEmail[];
  devices?: unknown[];
  additionalInfo?: Record<string, unknown>;
  cohorts?: Record<string, unknown>;
};

// `email` stays in additionalInfo — pushapp backend throws on top-level emails add.
const RESERVED_INFO_KEYS = new Set([
  'name',
  'phones',
  'mobile',
  'phone',
  'emails',
  'devices',
]);

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

/** Lifts legacy identity fields from additionalInfo to top-level canonical shape. */
export function canonicalizeProfileSnapshot(
  snapshot: ProfileApiPayload
): ProfileApiPayload {
  if (!isLegacyProfileSnapshot(snapshot)) {
    return snapshot;
  }

  const source = { ...(snapshot.additionalInfo ?? {}) };
  const payload: ProfileApiPayload = {};

  if (snapshot.devices !== undefined) {
    payload.devices = snapshot.devices;
  }
  if (snapshot.cohorts !== undefined) {
    payload.cohorts = snapshot.cohorts;
  }

  if (snapshot.name !== undefined) {
    payload.name = snapshot.name;
  } else if (source.name !== undefined && source.name !== null) {
    const name = source.name;
    if (
      typeof name === 'string' ||
      (typeof name === 'object' && !Array.isArray(name))
    ) {
      payload.name = name as string | Record<string, unknown>;
    }
    delete source.name;
  }

  const phones =
    snapshot.phones ??
    normalizePhones(source.phones ?? source.mobile ?? source.phone);
  if (phones) {
    payload.phones = phones;
  }
  delete source.phones;
  delete source.mobile;
  delete source.phone;

  if (snapshot.emails?.length) {
    payload.emails = snapshot.emails;
  } else if (Array.isArray(source.emails) && source.emails.length) {
    payload.emails = source.emails as ProfileEmail[];
    delete source.emails;
  }

  const additionalInfo: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (RESERVED_INFO_KEYS.has(key)) continue;
    additionalInfo[key] = value;
  }
  if (Object.keys(additionalInfo).length) {
    payload.additionalInfo = additionalInfo;
  }

  return payload;
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
 * CustomerProfileService.updateProfile: top-level name/phones/emails, custom
 * keys in additionalInfo, cohort keys in cohorts.
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

function extractPhonesFromSnapshot(
  snapshot: ProfileApiPayload
): ProfilePhone[] | undefined {
  if (snapshot.phones?.length) {
    return snapshot.phones;
  }
  const additionalInfo = snapshot.additionalInfo;
  if (!additionalInfo) return undefined;
  return normalizePhones(
    additionalInfo.phones ?? additionalInfo.mobile ?? additionalInfo.phone
  );
}

export function isProfileUpdatePayloadEmpty(
  payload: ProfileApiPayload
): boolean {
  return (
    payload.name === undefined &&
    payload.phones === undefined &&
    payload.emails === undefined &&
    payload.devices === undefined &&
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
    'email' in additionalInfo;
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
  if (!lastSuccessful) {
    return desired;
  }

  const canonicalLast = canonicalizeProfileSnapshot(lastSuccessful);
  const outbound: ProfileApiPayload = { ...desired };
  const lastPhones = extractPhonesFromSnapshot(canonicalLast);

  if (
    outbound.phones &&
    lastPhones &&
    phoneNumbersEqual(outbound.phones, lastPhones)
  ) {
    delete outbound.phones;
  }

  if (
    outbound.emails &&
    canonicalLast.emails &&
    stableStringify(outbound.emails) === stableStringify(canonicalLast.emails)
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

  if (info.name !== undefined && info.name !== null) {
    const name = info.name;
    if (
      typeof name === 'string' ||
      (typeof name === 'object' && !Array.isArray(name))
    ) {
      payload.name = name as string | Record<string, unknown>;
    }
  }

  const phones = normalizePhones(info.phones ?? info.mobile ?? info.phone);
  if (phones) {
    payload.phones = phones;
  }

  if (Array.isArray(info.emails) && info.emails.length) {
    payload.emails = info.emails as ProfileEmail[];
  }

  if (Array.isArray(info.devices)) {
    payload.devices = info.devices;
  }

  for (const [key, value] of Object.entries(info)) {
    if (RESERVED_INFO_KEYS.has(key)) continue;
    additionalInfo[key] = value;
  }

  if (Object.keys(additionalInfo).length) {
    payload.additionalInfo = additionalInfo;
  }

  if (Object.keys(cohorts).length) {
    payload.cohorts = cohorts;
  }

  return payload;
}
