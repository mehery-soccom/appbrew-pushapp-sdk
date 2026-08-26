import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getFcmToken } from '../firebase/Fb';
import { registerDeviceWithAPNS } from '../firebase/IosAPNS';
import { sdkLog } from '../helpers/sdkLogger';
import {
  DEFAULT_USER_ID_WAIT_MS,
  waitForEffectiveUserId,
} from './user';

const TOKEN_POLL_MS = 400;
const DEFAULT_TIMEOUT_MS = 15_000;
/** Brief pause after register so the event API can resolve the device. */
export const POST_REGISTER_SETTLE_MS = 1_000;

async function waitForStoredPushToken(timeoutMs: number): Promise<string> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const [lastRegisteredToken, apnsToken] = await AsyncStorage.multiGet([
      'lastRegisteredToken',
      'APNStoken',
    ]).then((entries) => entries.map(([_, value]) => value || ''));

    const token = lastRegisteredToken || apnsToken;
    if (token) return token;

    await new Promise((resolve) => setTimeout(resolve, TOKEN_POLL_MS));
  }

  return '';
}

async function waitForRegisteredFlag(timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if ((await AsyncStorage.getItem('isRegistered')) === 'true') {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, TOKEN_POLL_MS));
  }

  return (await AsyncStorage.getItem('isRegistered')) === 'true';
}

export function settleAfterRegister(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, POST_REGISTER_SETTLE_MS));
}

/**
 * Ensures `/device/register` has completed and a server-assigned user id is
 * available before lifecycle events are sent.
 */
export async function ensureDeviceRegistered(
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<boolean> {
  const startedAt = Date.now();
  const remainingMs = () => Math.max(timeoutMs - (Date.now() - startedAt), 0);

  if ((await AsyncStorage.getItem('isRegistered')) === 'true') {
    const userId = await waitForEffectiveUserId(
      Math.min(remainingMs(), DEFAULT_USER_ID_WAIT_MS)
    );
    if (userId) return true;
  }

  sdkLog.log(
    '[SDK] Waiting for device registration before lifecycle events...'
  );

  if (Platform.OS === 'android') {
    try {
      await getFcmToken();
    } catch (error) {
      sdkLog.warn('[SDK] getFcmToken failed during ensureDeviceRegistered', error);
    }
  } else {
    const token = await waitForStoredPushToken(remainingMs());
    if (token) {
      try {
        await registerDeviceWithAPNS(token);
      } catch (error) {
        sdkLog.warn(
          '[SDK] registerDeviceWithAPNS failed during ensureDeviceRegistered',
          error
        );
      }
    }
  }

  const registered = await waitForRegisteredFlag(remainingMs());
  if (!registered) {
    sdkLog.warn(
      '[SDK] Device registration not confirmed before lifecycle events.'
    );
    return false;
  }

  await settleAfterRegister();

  const userId = await waitForEffectiveUserId(remainingMs());
  if (!userId) {
    sdkLog.warn(
      '[SDK] Device registered but server user_id unavailable before lifecycle events.'
    );
    return false;
  }

  return true;
}
