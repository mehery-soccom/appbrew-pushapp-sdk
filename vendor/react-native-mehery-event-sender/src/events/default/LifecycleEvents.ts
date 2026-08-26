import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';
import { sendCustomEvent, schedulePollCheck } from '../custom/CustomEvents';
import { SDK_EVENT_NAMES } from './eventNames';
import { ensureDeviceRegistered } from '../../utils/ensureDeviceRegistered';
import { sdkLog } from '../../helpers/sdkLogger';

export { SDK_EVENT_NAMES };

const APP_INSTALL_SENT_KEY = 'mehery_app_install_sent';
const APP_INSTALL_VERSION_KEY = 'mehery_app_install_version';

export async function trackAppInstallIfNeeded(): Promise<void> {
  const currentVersion = DeviceInfo.getVersion() || 'unknown';
  const storedVersion = await AsyncStorage.getItem(APP_INSTALL_VERSION_KEY);

  if (storedVersion === currentVersion) {
    return;
  }

  // Legacy: boolean flag from older SDK — seed version without re-sending.
  if (!storedVersion) {
    const legacySent = await AsyncStorage.getItem(APP_INSTALL_SENT_KEY);
    if (legacySent === 'true') {
      await AsyncStorage.setItem(APP_INSTALL_VERSION_KEY, currentVersion);
      await AsyncStorage.removeItem(APP_INSTALL_SENT_KEY);
      return;
    }
  }

  const isUpdate = Boolean(storedVersion);
  const attributes: Record<string, string | boolean> = {
    app_version: currentVersion,
    update: isUpdate,
  };
  if (storedVersion) {
    attributes.previous_version = storedVersion;
  }

  const success = await sendCustomEvent(
    SDK_EVENT_NAMES.APP_INSTALL,
    attributes,
    { eventType: 'LOG' }
  );
  if (success) {
    await AsyncStorage.setItem(APP_INSTALL_VERSION_KEY, currentVersion);
    await AsyncStorage.removeItem(APP_INSTALL_SENT_KEY);
  }
}

export async function OnAppLaunch(): Promise<void> {
  await sendCustomEvent(SDK_EVENT_NAMES.APP_LAUNCH, {}, { eventType: 'LOG' });
}

export async function trackDefaultLifecycleEvents(): Promise<void> {
  const registered = await ensureDeviceRegistered();
  if (!registered) {
    sdkLog.warn(
      '[SDK] Skipping app_install and app_launch until device registration succeeds.'
    );
    return;
  }

  await trackAppInstallIfNeeded();
  await OnAppLaunch();
  schedulePollCheck('lifecycle');
}
