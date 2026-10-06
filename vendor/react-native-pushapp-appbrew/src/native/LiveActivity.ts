import { sdkLog } from '../helpers/sdkLogger';
import {
  Alert,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';

const { LiveActivityModule } = NativeModules;

/** Android 13+ (API 33) requires runtime POST_NOTIFICATIONS. */
export async function ensureAndroidNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const apiLevel =
    typeof Platform.Version === 'number'
      ? Platform.Version
      : parseInt(String(Platform.Version), 10);

  if (Number.isNaN(apiLevel) || apiLevel < 33) return true;

  try {
    const alreadyGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    );
    if (alreadyGranted) return true;

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch (error) {
    sdkLog.warn('ensureAndroidNotificationPermission failed', error);
    return false;
  }
}

export const triggerLiveActivity = (data: Record<string, string>) => {
  sdkLog.log('📣 triggerLiveActivity called with data:', data);

  if (LiveActivityModule?.triggerLiveActivity) {
    try {
      LiveActivityModule.triggerLiveActivity(data);
      sdkLog.log(
        '✅ LiveActivityModule.triggerLiveActivity executed successfully'
      );
    } catch (error) {
      sdkLog.error('❌ Error while calling LiveActivityModule:', error);
    }
  } else {
    sdkLog.warn('⚠️ LiveActivityModule is not available on NativeModules');
  }
};

export type TriggerCarouselNotificationParams = {
  title: string;
  body: string;
  images: string[];
  index?: number;
  notification_id?: string;
};

/**
 * Shows an Android BigPictureStyle carousel notification with Prev/Next actions.
 * Requires at least 2 image URLs. No-op on iOS (use host app notification extensions).
 */
export async function triggerCarouselNotification(
  params: TriggerCarouselNotificationParams
): Promise<boolean> {
  if (Platform.OS !== 'android') {
    sdkLog.warn(
      'triggerCarouselNotification is only supported on Android in this SDK'
    );
    return false;
  }

  if (!LiveActivityModule?.triggerCarousel) {
    sdkLog.warn('⚠️ LiveActivityModule.triggerCarousel is not available');
    Alert.alert(
      'Carousel unavailable',
      'LiveActivityModule is not linked. Rebuild the app after updating the SDK.'
    );
    return false;
  }

  if (!params.images || params.images.length < 2) {
    sdkLog.warn('triggerCarouselNotification requires at least 2 image URLs');
    Alert.alert('Carousel', 'Add at least 2 image URLs.');
    return false;
  }

  const permitted = await ensureAndroidNotificationPermission();
  if (!permitted) {
    Alert.alert(
      'Notifications blocked',
      'Allow notifications for this app in Settings, then try again.'
    );
    return false;
  }

  try {
    LiveActivityModule.triggerCarousel({
      title: params.title,
      body: params.body,
      message: params.body,
      images: params.images,
      index: params.index ?? 0,
      ...(params.notification_id
        ? { notification_id: params.notification_id }
        : {}),
    });
    return true;
  } catch (error) {
    sdkLog.error('❌ Error while calling triggerCarousel:', error);
    Alert.alert('Carousel failed', String(error));
    return false;
  }
}
