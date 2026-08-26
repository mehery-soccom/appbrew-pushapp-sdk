// 📦 External exports (public API)
export { MeheryEventSenderView } from './native/MeheryEventSenderView';
export { BannerScreen } from './components/BannerScreen';
export { CustomBanner } from './components/CustomBanner';
export { getDeviceId } from './utils/device';
export { setDeviceMetadata } from './utils/deviceMetadata';
export { setGeoIP } from './utils/geoIpContext';
export { updatePushToken } from './utils/updateToken';
export type { GeoIpInput, GeoIpPayload } from './types/geoIp';
export type { SdkInitEnvironmentParam } from './helpers/tenantContext';
export { pushappAuth } from './helpers/pushappAuth';
export {
  readCredentialsForEnvironment,
  readNativeAppCredentials,
  sdkEnvironmentToNativeLabel,
} from './helpers/readNativeAppCredentials';

export {
  logUserDetails,
  getLoggedUserDetails,
  OnUserLogin,
  OnUserLogOut,
  type OnUserLoginResult,
} from './utils/user';
export { waitForSdkReady } from './utils/sdkReadiness';
export {
  OnPageClose,
  OnPageOpen,
  sendCustomEvent,
  flushPendingCustomEvents,
  OnAppOpen,
} from './events/custom/CustomEvents';
export type { SendCustomEventOptions } from './events/custom/CustomEvents';

export {
  SDK_EVENT_NAMES,
  OnAppLaunch,
  trackAppInstallIfNeeded,
  trackDefaultLifecycleEvents,
} from './events/default/LifecycleEvents';

export {
  updateUserProfile,
  type UpdateUserProfileResult,
  type UpdateUserProfileOptions,
} from './events/custom/ProfileUpdate';

export { PollOverlayProvider } from './components/PollOverlay';
export { showPollOverlay, hidePollOverlay } from './components/PollOverlay';

export { InlinePollContainer } from './components/RenderInlinePoll';

export {
  triggerCarouselNotification,
  triggerLiveActivity,
  ensureAndroidNotificationPermission,
} from './native/LiveActivity';
export type { TriggerCarouselNotificationParams } from './native/LiveActivity';

import { AppRegistry } from 'react-native';
import { sdkLog, setSdkLogging } from './helpers/sdkLogger';

// 🛠 Imports
import { Platform, NativeModules, NativeEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  requestUserPermission,
  getFcmToken,
  configurePushNotifications,
  setupForegroundNotificationListener,
  setupNotificationOpenTracking,
} from './firebase/Fb';
// import { triggerLiveActivity } from './native/LiveActivity';
import { connectToServer } from './socket/WebSock';
import { getDeviceId as fetchDeviceId } from './utils/device';
// import { registerDeviceWithFCM } from './utils/registerDevice';
import { registerDeviceWithAPNS } from './firebase/IosAPNS';
import { updatePushToken } from './utils/updateToken';
import messaging from '@react-native-firebase/messaging';
// import { showPollOverlay, hidePollOverlay } from './components/PollOverlay';
// 🛡 Safe NativeEventEmitter setup
import { PollOverlayProvider } from './components/PollOverlay';
import { trackDefaultLifecycleEvents } from './events/default/LifecycleEvents';
import { markSdkReady, resetSdkReady } from './utils/sdkReadiness';

export { TooltipPollContainer } from './components/TooltipPollContainer';
export {
  registerFcmBackgroundHandler,
  setFcmBackgroundMessageListener,
} from './firebase/Fb';
export type { FcmBackgroundMessageListener } from './firebase/Fb';
export {
  setNotificationUrlHandler,
  configureNotificationLinkRewrites,
  openNotificationLink,
  rewriteNotificationUrl,
} from './utils/notificationLink';
export type { NotificationLinkRewrite } from './utils/notificationLink';

import { buildCommonHeaders } from './helpers/buildCommonHeaders';
import { resolveDeviceHeaders } from './utils/resolveDeviceHeaders';
import {
  getApiBaseUrl,
  MEHERY_PUSHAPP_HOST_ROOT_KEY,
  resolvePushAppHostRoot,
  storePushAppHostFromInitParam,
  storeTenantFromIdentifier,
  type SdkInitEnvironmentParam,
} from './helpers/tenantContext';
import {
  buildPushTrackBody,
  extractClickTrackToken,
  getPushTrackBaseFromMerged,
  mergeIosNotificationPayload,
  resolveNotificationUrl,
  type PushTrackEvent,
} from './utils/pushTrackPayload';
import {
  resolvePushCtaFields,
  type CtaTrackFields,
} from './utils/ctaTrackPayload';
import { openNotificationLink } from './utils/notificationLink';

const { PushTokenManager } = NativeModules;
// const pushEmitter = PushTokenManager
//   ? new NativeEventEmitter(PushTokenManager)
//   : {
//       addListener: () => ({ remove: () => {} }),
//       removeAllListeners: () => {},
//     };
// // 🚀 SDK Init
sdkLog.log('PushTokenManager:', NativeModules.PushTokenManager);

let iosListenerAdded = false;

export const iosChecker = () => {
  if (!PushTokenManager) {
    sdkLog.warn('⚠️ Native module PushTokenManager is NOT available.');
    return;
  }

  if (iosListenerAdded) {
    sdkLog.log('ℹ️ iOS listener already added, skipping duplicate.');
    return;
  }

  const pushEmitter = new NativeEventEmitter(PushTokenManager);

  sdkLog.log('🍏 iOS: Setting up PushTokenEvent listener');
  pushEmitter.addListener('PushTokenEvent', async ({ type, token }) => {
    sdkLog.log(`📡 Received ${type} token from native: ${token}`);
    const isRegistered = await AsyncStorage.getItem('isRegistered');
    if (isRegistered === 'true') {
      updatePushToken(token);
    } else {
      registerDeviceWithAPNS(token);
    }
  });

  iosListenerAdded = true;
};

let notificationListenerAdded = false;
const seenIosPushTrackEvents = new Set<string>();
const IOS_PUSH_TRACK_CACHE_LIMIT = 100;

type IosPushTrackEvent = PushTrackEvent;

const normalizePayloadString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const trackIosPushEvent = async (
  event: IosPushTrackEvent,
  payload: Record<string, unknown>,
  cta?: CtaTrackFields
) => {
  const merged = mergeIosNotificationPayload(payload);
  const messageId = normalizePayloadString(
    merged.messageId || merged.message_id
  );
  const filterId = normalizePayloadString(merged.filterId || merged.filter_id);
  const notificationId = normalizePayloadString(merged.notification_id);

  const dedupeKey = [
    event,
    messageId,
    filterId,
    cta?.ctaId || '',
    cta?.button_id || '',
    notificationId,
  ]
    .join(':')
    .toLowerCase();
  if (seenIosPushTrackEvents.has(dedupeKey)) return;
  seenIosPushTrackEvents.add(dedupeKey);
  if (seenIosPushTrackEvents.size > IOS_PUSH_TRACK_CACHE_LIMIT) {
    const oldest = seenIosPushTrackEvents.values().next().value as
      | string
      | undefined;
    if (oldest) seenIosPushTrackEvents.delete(oldest);
  }

  if (!extractClickTrackToken(merged)) {
    sdkLog.log(
      '[PushTrack] iOS skipped (missing click token t / click_token in payload)',
      event
    );
    return;
  }

  const body = buildPushTrackBody(event, merged, cta ? { cta } : undefined);

  try {
    const commonHeaders = await buildCommonHeaders();
    let apiBaseUrl = getPushTrackBaseFromMerged(merged);
    if (!apiBaseUrl) {
      apiBaseUrl = await getApiBaseUrl();
    }
    if (!apiBaseUrl?.trim()) {
      sdkLog.log(
        '[PushTrack] iOS skipped (no api_base_url in payload and getApiBaseUrl empty)',
        event
      );
      return;
    }
    const endpoint = `${apiBaseUrl.replace(/\/$/, '')}/v1/notification/push/track`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...commonHeaders,
      },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      sdkLog.log('[PushTrack] iOS', event, 'HTTP', res.status);
    } else {
      sdkLog.log('[PushTrack] iOS', event, 'HTTP', res.status, '(not ok)');
    }
  } catch (err) {
    sdkLog.log('⚠️ iOS push track failed (non-blocking):', err);
  }
};

/* -------------------------------------------------------------------------- */
/*                    SILENT NOTIFICATION DAILY LOGIC                           */
/* -------------------------------------------------------------------------- */

const SILENT_PING_KEY = 'mehery_last_silent_ping_date';

const isAfterNoon = () => {
  const now = new Date();

  const noon = new Date();
  noon.setHours(12, 0, 0, 0); // 12:00 PM local time

  return now >= noon;
};

const shouldRunSilentPingToday = async (): Promise<boolean> => {
  const lastRun = await AsyncStorage.getItem(SILENT_PING_KEY);
  const today = new Date().toISOString().split('T')[0];

  if (lastRun === today) return false;

  await AsyncStorage.setItem(SILENT_PING_KEY, today ?? '');
  return true;
};

const sendDailyPing = async () => {
  try {
    const channelId = await AsyncStorage.getItem('mehery_channel_id');
    const contactId = await AsyncStorage.getItem('contact_id');

    if (!channelId || !contactId) {
      sdkLog.warn('⚠️ Missing channel_id or contact_id. Skipping ping.');
      return;
    }

    const payload = {
      channel_id: channelId,
      contact_id: contactId,
    };

    sdkLog.log('📡 Sending silent daily ping:', payload);
    const commonHeaders = await buildCommonHeaders();

    const apiBaseUrl = await getApiBaseUrl();
    await fetch(`${apiBaseUrl}/ping`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...commonHeaders,
      },
      body: JSON.stringify(payload),
    });

    sdkLog.log('✅ Silent daily ping sent');

    const currentToken = await messaging().getToken();
    if (currentToken) {
      updatePushToken(currentToken);
    }
  } catch (err) {
    sdkLog.error('❌ Silent ping failed:', err);
  }
};

// export const addNotificationDebugListener = () => {
//   if (!PushTokenManager) {
//     console.warn('⚠️ PushTokenManager not available for notification listener');
//     return;
//   }

//   if (notificationListenerAdded) {
//     console.log('ℹ️ Notification listener already added');
//     return;
//   }

//   const emitter = new NativeEventEmitter(PushTokenManager);

//   console.log('🔔 Setting up notification payload listener');

//   emitter.addListener('PushNotificationEvent', async (payload) => {
//     console.log(
//       '📦 [SDK][JS] Notification payload received:',
//       JSON.stringify(payload, null, 2)
//     );
//     console.log('🚨 LISTENER FIRED');
//     console.log('📦 Payload raw:', payload);

//     // 🚀 Send to Slack
//     // await sendPayloadToSlack(payload);
//   });

//   notificationListenerAdded = true;
// };

export const addNotificationDebugListener = () => {
  if (!PushTokenManager) return;
  if (notificationListenerAdded) return;

  const emitter = new NativeEventEmitter(PushTokenManager);

  emitter.addListener('PushNotificationEvent', async (payload) => {
    sdkLog.log('📦 Push payload received:', payload);

    if (payload?.type !== 'silent_daily_ping') {
      const raw = payload as Record<string, unknown>;
      const merged = mergeIosNotificationPayload(raw);
      const actionId = normalizePayloadString(merged.actionIdentifier);
      const isDefaultTap =
        actionId === 'com.apple.UNNotificationDefaultActionIdentifier';
      const isDismiss =
        actionId === 'com.apple.UNNotificationDismissActionIdentifier';

      if (actionId && !isDefaultTap && !isDismiss) {
        const cta = resolvePushCtaFields(actionId, merged);
        await trackIosPushEvent('cta', merged, cta);
      } else if (isDefaultTap) {
        await trackIosPushEvent('opened', merged);
        const bodyUrl = resolveNotificationUrl(merged);
        if (bodyUrl) {
          try {
            await openNotificationLink(bodyUrl);
            sdkLog.log(
              '[PushNotificationEvent] iOS body tap opened notification_url:',
              bodyUrl
            );
          } catch (e) {
            sdkLog.warn(
              '[PushNotificationEvent] iOS openNotificationLink failed:',
              e
            );
          }
        } else {
          sdkLog.warn(
            '[PushNotificationEvent] iOS body tap: no notification_url in payload (checked style/templateData). Keys:',
            Object.keys(merged).join(', ')
          );
        }
      }
      return;
    }

    // ⏰ Ensure it's after 12 noon
    if (!isAfterNoon()) {
      sdkLog.log('⏳ Silent ping received before 12 noon, skipping');
      return;
    }

    // 🧠 Ensure only once per day
    const shouldRun = await shouldRunSilentPingToday();
    if (!shouldRun) {
      sdkLog.log('⏭️ Silent ping already executed today');
      return;
    }

    await sendDailyPing();
  });

  notificationListenerAdded = true;
};

let sdkMounted = false;

// export const initSdk = () => {
//   fetchDeviceId();
//   iosChecker();
//   connectToServer();
//   if (!sdkMounted) {
//     AppRegistry.registerComponent(
//       'MeherySdkOverlay',
//       () => PollOverlayProvider
//     );
//     sdkMounted = true;
//   }
//   console.log('SDK Initialized');
//   if (Platform.OS === 'android') {
//     console.log('📱 Android: Initializing push notification setup');

//     requestUserPermission();
//     configurePushNotifications();
//     setupForegroundNotificationListener();

//     triggerLiveActivity({
//       message1: 'Welcome!',
//       message2: 'Live activity running',
//       message3: 'Tap to continue',
//       progressPercent: '0.85',
//       message1FontColorHex: '#00000',
//       message2FontColorHex: '#CCCCCC',
//       message3FontColorHex: '#888888',
//       progressColorHex: '#00FF00',
//       backgroundColorHex: '#FFFFFF',
//       imageUrl: 'https://example.com/sample.png',
//       bg_color_gradient: '',
//       bg_color_gradient_dir: '',
//       align: 'center',
//       activity_id: 'demo_activity_001',
//       theme: 'dark',
//     });

//     getFcmToken();
//   } else {
//     console.log('🍏 iOS: Listening for FCM token from native emitter');
//   }
// };

export const initSdk = async (
  context: any,
  identifier: string,
  environment: SdkInitEnvironmentParam = true,
  logs: boolean = true
) => {
  resetSdkReady();
  setSdkLogging(logs);
  let initSucceeded = false;
  try {
    sdkLog.log('🧩 Initializing Mehery SDK...');
    void resolveDeviceHeaders();
    sdkLog.log(context ? 'Received' : 'Not provided');
    sdkLog.log(`🏷️ Identifier: ${identifier}`);
    if (environment === 'development') {
      sdkLog.log('🌐 Environment: development (pushapp.in)');
    } else {
      sdkLog.log(
        `🧪 ${environment ? 'Sandbox (pushapp.xyz)' : 'Production (pushapp.ai)'}`
      );
    }

    const tenant = await storeTenantFromIdentifier(identifier);
    sdkLog.log(`🏢 Resolved tenant: ${tenant}`);

    const [previousChannelId, previousHostRoot] = await AsyncStorage.multiGet([
      'mehery_channel_id',
      MEHERY_PUSHAPP_HOST_ROOT_KEY,
    ]).then((entries) => entries.map(([_, value]) => value ?? ''));
    const nextHostRoot = resolvePushAppHostRoot(environment);
    const initContextChanged =
      (previousChannelId && previousChannelId !== identifier) ||
      (previousHostRoot && previousHostRoot !== nextHostRoot);

    await storePushAppHostFromInitParam(environment);

    if (initContextChanged) {
      sdkLog.warn(
        '[SDK] Channel or environment changed — clearing cached registration so /device/register runs again.'
      );
      await AsyncStorage.multiRemove([
        'lastRegisteredState',
        'lastRegisteredToken',
        'isRegistered',
        'UserRegistered',
        'registered_user_id',
        'contact_id',
        'UserLoggedIn',
        'mehery_registered_channel_id',
      ]);
    }

    // Keep raw identifier as channel_id for API compatibility.
    await AsyncStorage.setItem('mehery_channel_id', identifier);
    sdkLog.log(`💾 Saved Channel ID: ${identifier}`);

    // ✅ Fetch or create device ID (await so early custom events have x-device-id)
    await fetchDeviceId();

    // ✅ iOS specific setup
    if (Platform.OS === 'ios') {
      iosChecker();
      addNotificationDebugListener();
      // FCM does not show banners in foreground on iOS; onMessage must schedule a local notification.
      setupForegroundNotificationListener();
      setupNotificationOpenTracking();
    }

    // ✅ Mount overlay component only once
    if (!sdkMounted) {
      AppRegistry.registerComponent(
        'MeherySdkOverlay',
        () => PollOverlayProvider
      );
      sdkMounted = true;
      sdkLog.log('🧱 SDK Overlay mounted');
    }

    // ✅ Platform-specific setup
    if (Platform.OS === 'android') {
      sdkLog.log('📱 Android: Initializing push notification setup');

      const MeheryPushTrack = NativeModules.MeheryPushTrack as
        | { setApiBaseUrl?: (url: string) => void }
        | undefined;
      if (MeheryPushTrack?.setApiBaseUrl) {
        try {
          MeheryPushTrack.setApiBaseUrl(await getApiBaseUrl());
        } catch (e) {
          sdkLog.warn('MeheryPushTrack.setApiBaseUrl failed', e);
        }
      }

      await requestUserPermission();
      configurePushNotifications();
      setupForegroundNotificationListener();
      setupNotificationOpenTracking();

      // triggerLiveActivity({
      //   message1: 'Welcome!',
      //   message2: 'Live activity running',
      //   message3: 'Tap to continue',
      //   progressPercent: '0.85',
      //   message1FontColorHex: '#000000',
      //   message2FontColorHex: '#CCCCCC',
      //   message3FontColorHex: '#888888',
      //   progressColorHex: '#00FF00',
      //   backgroundColorHex: '#FFFFFF',
      //   imageUrl: 'https://example.com/sample.png',
      //   bg_color_gradient: '',
      //   bg_color_gradient_dir: '',
      //   align: 'center',
      //   activity_id: 'demo_activity_001',
      //   theme: environment ? 'light' : 'dark',
      // });

      await getFcmToken();
    }

    await trackDefaultLifecycleEvents();

    // Connect after register identity is available for guest user id in WS auth.
    await connectToServer();

    sdkLog.log('✅ SDK Initialized Successfully');
    initSucceeded = true;
  } catch (error) {
    sdkLog.error('❌ Error initializing SDK:', error);
  } finally {
    markSdkReady(initSucceeded);
  }
};
