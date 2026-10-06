import { useRef, useEffect } from 'react';
import { sdkLog } from '../helpers/sdkLogger';
import {
  Animated,
  Dimensions,
  StyleSheet,
  PanResponder,
  Linking,
  TouchableOpacity,
  Text,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { buildCommonHeaders } from '../helpers/buildCommonHeaders';
import { prepareBottomSheetHtml } from '../helpers/prepareBottomSheetHtml';
import {
  getPollWebViewProps,
  getTransparentContainerStyle,
  isTransparentPollBackground,
} from '../helpers/pollTransparency';
import { getApiBaseUrl } from '../helpers/tenantContext';
import { buildInAppTrackData } from '../utils/inAppTrack';
import {
  buildCtaData,
  buildSyntheticCtaData,
  normalizeInAppCtaFields,
  type CtaTrackFields,
} from '../utils/ctaTrackPayload';

const { height } = Dimensions.get('window');

interface BottomSheetPollProps {
  html: string;
  onClose?: () => void;
  pollType?: string;
  messageId?: string;
  filterId?: string;
  journiId?: string;
  backgroundColor?: string;
  notificationUrl?: string;
}

export default function BottomSheetPoll({
  html,
  onClose,
  messageId,
  filterId,
  journiId,
  backgroundColor = 'transparent',
  notificationUrl = '',
}: BottomSheetPollProps) {
  const translateY = useRef(new Animated.Value(height)).current;
  const preparedHtml = prepareBottomSheetHtml(html, backgroundColor);
  const webViewProps = getPollWebViewProps(backgroundColor);
  const transparentContainerStyle =
    getTransparentContainerStyle(backgroundColor);
  const isTransparentBackground = isTransparentPollBackground(backgroundColor);

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  const handleClose = () => {
    Animated.timing(translateY, {
      toValue: height,
      duration: 200,
      useNativeDriver: true,
    }).start(onClose);
  };

  // ✅ Updated sendTrackEvent using your version
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

  const handleDismiss = async () => {
    await sendTrackEvent('dismissed');
    handleClose();
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 15,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 100) handleDismiss();
        else
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
      },
    })
  ).current;

  const injectedJS = `
    (function() {
      function initListeners() {
        const send = (data) => window.ReactNativeWebView.postMessage(JSON.stringify(data));
        const extractUrl = (el) => {
          const onclickAttr = el.getAttribute('onclick') || '';
          const hrefAttr = el.getAttribute('data-href') || el.getAttribute('href') || '';
          const onClickUrlMatch = onclickAttr.match(/['"]((?:https?:\\/\\/|www\\.)[^'"]+)['"]/i);
          if (onClickUrlMatch && onClickUrlMatch[1]) return onClickUrlMatch[1];
          return hrefAttr || '';
        };

        const attachClickListener = (element) => {
          element.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();

            let value = this.innerText || this.value || '';
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
        };

        document.querySelectorAll('button').forEach(attachClickListener);
        document.querySelectorAll('a[href]').forEach(attachClickListener);

        document.querySelectorAll('[data-close], .poll-close, .close-btn').forEach(el =>
          el.addEventListener('click', () => send({ type: 'closePoll' }))
        );

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
        document.addEventListener('DOMContentLoaded', initListeners);
      } else {
        initListeners();
      }
    })();
  `;

  const onMessage = async (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      switch (msg.type) {
        case 'imageClick': {
          const url = normalizeUrl(msg.url || '');
          if (url) {
            await sendTrackEvent('cta', buildSyntheticCtaData('MEDIA_CLICK'));
            await sendTrackEvent('openUrl', url);
            await Linking.openURL(url);
          }
          handleClose();
          break;
        }

        case 'buttonClick':
        case 'cta': {
          const cta = normalizeInAppCtaFields(msg);
          const url = normalizeUrl(msg.url || msg.value || '');
          await sendTrackEvent('cta', cta);
          if (url) {
            try {
              await sendTrackEvent('openUrl', url);
              await Linking.openURL(url);
            } catch (err) {
              sdkLog.error('❌ Failed to open URL:', err);
            }
          }
          handleClose();
          break;
        }

        case 'closePoll':
          await sendTrackEvent('dismissed');
          handleClose();
          break;

        case 'openUrl':
        case 'link': {
          const url = normalizeUrl(msg.url);
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
          await sendTrackEvent('unknown', JSON.stringify(msg));
          break;
      }
    } catch (error) {
      await sendTrackEvent('unknown', 'invalid_json');
    }
  };

  return (
    <Animated.View
      style={[
        styles.sheet,
        isTransparentBackground && styles.sheetTransparent,
        transparentContainerStyle,
        { backgroundColor, transform: [{ translateY }] },
      ]}
      {...panResponder.panHandlers}
    >
      <TouchableOpacity style={styles.closeBtn} onPress={handleDismiss}>
        <Text style={styles.closeText}>✕</Text>
      </TouchableOpacity>
      <WebView
        originWhitelist={['*']}
        source={{ html: preparedHtml }}
        style={[styles.webview, { backgroundColor }]}
        injectedJavaScript={injectedJS}
        injectedJavaScriptBeforeContentLoaded="true;"
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="always"
        bounces={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        scalesPageToFit={false}
        scrollEnabled={false}
        opaque={webViewProps.opaque}
        androidLayerType={webViewProps.androidLayerType}
        onMessage={onMessage}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    height: height * 0.56,
    width: '100%',
    alignSelf: 'center',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  sheetTransparent: {
    elevation: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  closeBtn: {
    position: 'absolute',
    top: 40,
    right: 14,
    zIndex: 1000,
    backgroundColor: 'rgba(17,24,39,0.08)',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: { fontSize: 15, color: '#111827', fontWeight: '700' },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
