import { Linking, NativeModules, Platform } from 'react-native';

export type NotificationLinkRewrite = {
  httpsHost: string;
  appScheme: string;
};

type NotificationUrlHandler = (url: string) => void | Promise<void>;

let notificationUrlHandler: NotificationUrlHandler | null = null;
let linkRewrites: NotificationLinkRewrite[] = [];

const { MeheryPushTrack } = NativeModules;

function syncNativeRewrites() {
  if (Platform.OS !== 'android' || !MeheryPushTrack?.setNotificationLinkRewrite) {
    return;
  }
  const first = linkRewrites[0];
  if (!first) {
    MeheryPushTrack.setNotificationLinkRewrite('', '');
    return;
  }
  MeheryPushTrack.setNotificationLinkRewrite(first.httpsHost, first.appScheme);
}

/** Host app handles navigation (e.g. React Navigation). Takes precedence over Linking.openURL. */
export function setNotificationUrlHandler(
  handler: NotificationUrlHandler | null
): void {
  notificationUrlHandler = handler;
}

/**
 * Rewrite https app-link hosts to a custom scheme before opening.
 * Example: { httpsHost: 'app.go.link', appScheme: 'myapp' }
 */
export function configureNotificationLinkRewrites(
  rewrites: NotificationLinkRewrite[]
): void {
  linkRewrites = rewrites.filter(
    (item) => item.httpsHost?.trim() && item.appScheme?.trim()
  );
  syncNativeRewrites();
}

export function rewriteNotificationUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  for (const { httpsHost, appScheme } of linkRewrites) {
    const prefix = `https://${httpsHost}/`;
    const hostOnly = `https://${httpsHost}`;
    if (!trimmed.startsWith(prefix) && trimmed !== hostOnly) continue;

    const path = trimmed.startsWith(prefix)
      ? trimmed.slice(prefix.length).replace(/^\//, '')
      : '';
    return path ? `${appScheme}://${path}` : `${appScheme}://`;
  }

  return trimmed;
}

export async function openNotificationLink(url: string): Promise<void> {
  if (!url?.trim()) return;

  if (notificationUrlHandler) {
    await notificationUrlHandler(url);
    return;
  }

  const target = rewriteNotificationUrl(url);
  await Linking.openURL(target);
}
