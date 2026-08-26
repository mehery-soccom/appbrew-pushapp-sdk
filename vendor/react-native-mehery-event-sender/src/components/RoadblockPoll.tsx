import { useRef, useState } from 'react';
import { View, StyleSheet, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { hidePollOverlay } from './PollOverlay';
import { buildCommonHeaders } from '../helpers/buildCommonHeaders';
import { getApiBaseUrl } from '../helpers/tenantContext';
import { sdkLog } from '../helpers/sdkLogger';
import { buildInAppTrackData } from '../utils/inAppTrack';
import {
  buildCtaData,
  buildSyntheticCtaData,
  normalizeInAppCtaFields,
  type CtaTrackFields,
} from '../utils/ctaTrackPayload';
import { prepareOverlayPollHtml } from '../helpers/prepareOverlayPollHtml';
import {
  getPollWebViewProps,
  getTransparentContainerStyle,
} from '../helpers/pollTransparency';

export default function RoadblockPoll({
  html,
  onClose,
  messageId,
  filterId,
  journiId,
  pollType,
  style,
  backgroundColor = 'transparent',
  notificationUrl = '',
}: {
  html: string;
  onClose?: () => void;
  messageId?: string;
  filterId?: string;
  journiId?: string;
  pollType?: string;
  style?: Record<string, unknown>;
  backgroundColor?: string;
  notificationUrl?: string;
}) {
  const webViewRef = useRef<WebView>(null);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlayText, setOverlayText] = useState('');

  sdkLog.log('poll type:', pollType);
  sdkLog.log('style:', style);

  sdkLog.log('📨 messageId:', messageId);
  sdkLog.log('📨 filterId:', filterId);
  // console.log('📨 rb html:', html);

  const showOverlay = (text: string) => {
    setOverlayText(text);
    setOverlayVisible(true);
  };

  const hideOverlay = () => {
    setOverlayVisible(false);
    setOverlayText('');
  };
  sdkLog.log('overlay visible:', overlayVisible);
  sdkLog.log('overlay visible:', overlayText);

  // 🔹 Send tracking event to backend
  const sendTrackEvent = async (
    eventType: 'cta' | 'dismissed' | 'longPress' | 'openUrl' | 'unknown',
    value?: string | CtaTrackFields
  ) => {
    let data: Record<string, unknown> = {};
    if (eventType === 'cta' && value) {
      data = buildInAppTrackData(
        'cta',
        typeof value === 'string' ? buildCtaData(value, '') : value
      );
    } else if (typeof value === 'string' && value) {
      data = { ctaId: value };
    }

    const payload = {
      messageId,
      filterId,
      ...(journiId ? { journiId } : {}),
      event: eventType,
      data,
    };

    sdkLog.log('📤 Sending track event:', payload);
    const commonHeaders = await buildCommonHeaders();
    const apiBaseUrl = await getApiBaseUrl();

    try {
      const res = await fetch(`${apiBaseUrl}/v1/notification/in-app/track`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...commonHeaders,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      sdkLog.log('✅ Track API response:', data);
    } catch (error) {
      sdkLog.error('❌ Track API error:', error);
    }
  };

  const normalizeUrl = (rawUrl?: string) => {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    const value = rawUrl.trim();
    if (!value) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
    if (/^https?:\/\//i.test(value)) return value;
    if (/^www\./i.test(value)) return `https://${value}`;
    return '';
  };

  // 🔹 Handle messages from WebView
  const onMessage = async (event: any) => {
    const raw = event.nativeEvent.data;
    try {
      const message = JSON.parse(raw);
      sdkLog.log('📩 Message from WebView:', message);

      switch (message.type) {
        case 'imageClick': {
          const url = normalizeUrl(message.url || '');
          if (url) {
            await sendTrackEvent('cta', buildSyntheticCtaData('MEDIA_CLICK'));
            await sendTrackEvent('openUrl', url);
            await Linking.openURL(url);
          }
          onClose?.() ?? hidePollOverlay();
          break;
        }

        case 'buttonClick': {
          const cta = normalizeInAppCtaFields(message);
          const url = normalizeUrl(message.url || '');
          await sendTrackEvent('cta', cta);
          if (url) {
            try {
              await sendTrackEvent('openUrl', url);
              await Linking.openURL(url);
            } catch (err) {
              sdkLog.error('❌ Failed to open URL:', err);
            }
          }
          onClose?.() ?? hidePollOverlay();
          break;
        }

        case 'closePoll':
          await sendTrackEvent('dismissed');
          onClose?.() ?? hidePollOverlay();
          break;

        case 'longPress':
          await sendTrackEvent('longPress', message.value);
          showOverlay(message.value);
          setTimeout(hideOverlay, 1500);
          break;

        case 'openUrl': {
          const url = normalizeUrl(message.url || '');
          if (url) {
            try {
              await sendTrackEvent('openUrl', url);
              await Linking.openURL(url);
            } catch (err) {
              sdkLog.error('❌ Failed to open URL:', err);
            }
          }
          break;
        }

        default:
          sdkLog.log('default case');
        // console.warn('⚠️ Unknown WebView message type:', message);
        // sendTrackEvent('unknown', JSON.stringify(message));
      }
    } catch (err) {
      // console.warn('⚠️ Invalid message from WebView:', raw);
      // sendTrackEvent('unknown', 'invalid_json');
    }
  };

  // 🔹 Inject JS to handle button events inside HTML
  const injectedJS = `
    (function() {
      function init() {
        document.body.style.touchAction = 'manipulation';
        document.body.style.userSelect = 'none';

        const send = (data) => {
          window.ReactNativeWebView.postMessage(JSON.stringify(data));
        };
        const extractUrl = (el) => {
          const onclickAttr = el.getAttribute('onclick') || '';
          const hrefAttr = el.getAttribute('data-href') || el.getAttribute('href') || '';
          const onClickUrlMatch = onclickAttr.match(/['"]((?:https?:\\/\\/|www\\.)[^'"]+)['"]/i);
          if (onClickUrlMatch && onClickUrlMatch[1]) return onClickUrlMatch[1];
          return hrefAttr || '';
        };

        const attachClickListener = (element) => {
          let pressTimer;

          element.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();

            let value = this.value || this.innerText || '';
            let button_id = this.getAttribute('data-cta-id') || this.getAttribute('data-button-id') || this.getAttribute('data-action-id') || '';
            const onclickAttr = this.getAttribute('onclick') || '';
            const handleMatch = onclickAttr.match(/handleClick\\s*\\(\\s*['"]([^'"]*)['"]\\s*,\\s*['"]([^'"]*)['"]\\s*,\\s*['"]([^'"]*)['"]\\s*\\)/);
            let targetUrl = extractUrl(this);
            if (handleMatch) {
              button_id = handleMatch[1] || button_id;
              value = handleMatch[2] || value;
              targetUrl = handleMatch[3] || targetUrl;
            }
            if (!button_id && value && /^PUSHAPP_/.test(value)) {
              button_id = value;
            }

            send({ type: 'buttonClick', ctaId: value, button_id: button_id, url: targetUrl });
          });

          element.addEventListener('touchstart', function() {
            let value = this.innerText || this.value || 'Button';
            pressTimer = setTimeout(() => {
              send({ type: 'longPress', value });
            }, 600);
          });

          ['touchend', 'touchmove', 'touchcancel'].forEach(ev => {
            element.addEventListener(ev, () => clearTimeout(pressTimer));
          });
        };

        document.querySelectorAll('button').forEach(attachClickListener);
        document.querySelectorAll('a[href]').forEach(attachClickListener);

        document.querySelectorAll('[data-close], .close-button, .poll-close, .close-btn')
          .forEach(el => el.addEventListener('click', () => send({ type: 'closePoll' })));

        var __notificationUrl = '${notificationUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}';
        if (__notificationUrl) {
          document.querySelectorAll('.media-item, .media-preview img').forEach(function(el) {
            el.style.cursor = 'pointer';
            el.addEventListener('click', function(e) {
              e.preventDefault();
              e.stopPropagation();
              send({ type: 'imageClick', url: __notificationUrl });
            });
          });
        }
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }
    })();
  `;

  const preparedHtml = prepareOverlayPollHtml(html, backgroundColor);
  const webViewProps = getPollWebViewProps(backgroundColor);
  const transparentContainerStyle =
    getTransparentContainerStyle(backgroundColor);

  return (
    <View
      style={[styles.container, transparentContainerStyle, { backgroundColor }]}
    >
      <WebView
        ref={webViewRef}
        source={{ html: preparedHtml }}
        style={[styles.webview, { backgroundColor }]}
        onMessage={onMessage}
        injectedJavaScript={injectedJS}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="always"
        userAgent="Mozilla/5.0 (ReactNativeWebView)"
        // @ts-ignore opaque is a valid iOS WebView prop not in current type defs
        opaque={webViewProps.opaque}
        androidLayerType={webViewProps.androidLayerType}
      />

      {/* Long press overlay */}
      {/* <Modal transparent visible={overlayVisible} animationType="fade">
        <Pressable style={styles.overlay} onPress={hideOverlay}>
          <Text style={styles.overlayText}>{overlayText}</Text>
        </Pressable>
      </Modal> */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor: '#fff',
    // borderRadius: 12,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayText: {
    color: '#fff',
    fontSize: 28,
    textAlign: 'center',
    paddingHorizontal: 20,
    fontWeight: '600',
  },
});
