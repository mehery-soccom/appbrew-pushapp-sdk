import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  LEGACY_PROFILE_UPDATED_KEY,
  type ProfileApiPayload,
  profileSnapshotStorageKey,
  stableStringify,
} from './profileSnapshotCompare';

export {
  LEGACY_PROFILE_UPDATED_KEY,
  buildProfileApiPayload,
  canonicalizeProfileSnapshot,
  isLegacyProfileSnapshot,
  isProfileUpdatePayloadEmpty,
  prepareProfileUpdatePayload,
  profilePayloadsEqual,
  profileSnapshotStorageKey,
  stableStringify,
} from './profileSnapshotCompare';
export type { ProfileApiPayload } from './profileSnapshotCompare';

export async function loadLastProfileSnapshot(
  userId: string
): Promise<ProfileApiPayload | null> {
  const raw = await AsyncStorage.getItem(profileSnapshotStorageKey(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ProfileApiPayload;
    if (parsed && typeof parsed === 'object') {
      const hasTopLevel =
        'name' in parsed || 'phones' in parsed || 'emails' in parsed;
      const hasAdditional =
        parsed.additionalInfo && typeof parsed.additionalInfo === 'object';
      if (hasTopLevel || hasAdditional || parsed.cohorts) {
        return parsed;
      }
    }
  } catch {
    // ignore corrupt snapshot
  }
  return null;
}

export async function saveLastProfileSnapshot(
  userId: string,
  payload: ProfileApiPayload
): Promise<void> {
  await AsyncStorage.setItem(
    profileSnapshotStorageKey(userId),
    stableStringify(payload)
  );
}

export async function clearStoredProfileSnapshot(
  userId?: string | null
): Promise<void> {
  const removals: string[] = [LEGACY_PROFILE_UPDATED_KEY];
  const trimmed = userId?.trim();
  if (trimmed) {
    removals.push(profileSnapshotStorageKey(trimmed));
  }
  await AsyncStorage.multiRemove(removals);
}
