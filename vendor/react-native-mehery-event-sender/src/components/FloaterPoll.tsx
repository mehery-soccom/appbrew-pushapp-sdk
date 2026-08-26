import { useRef, useEffect } from 'react';
import { sdkLog } from '../helpers/sdkLogger';
import {
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
  Linking,
  Pressable,
} from 'react-native';
import { WebView } from 'react-native-webview';
import Video from 'react-native-video';
import { buildCommonHeaders } from '../helpers/buildCommonHeaders';
import { getApiBaseUrl } from '../helpers/tenantContext';
import { buildInAppTrackData } from '../utils/inAppTrack';
import {
  buildCtaData,
  normalizeInAppCtaFields,
  type CtaTrackFields,
} from '../utils/ctaTrackPayload';
import { prepareOverlayPollHtml } from '../helpers/prepareOverlayPollHtml';
import {
  getPollWebViewProps,
  getTransparentContainerStyle,
} from '../helpers/pollTransparency';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface FloaterProps {
  html?: string;
  videoUrl?: string;
  position?: 'top' | 'center' | 'bottom';
  horizontalAlign?: 'left' | 'center' | 'right';
  width?: number;
  height?: number;
  messageId?: string;
  filterId?: string;
  journiId?: string;
  onClose?: () => void;
  backgroundColor?: string;
}

export default function Floater({
  html,
  videoUrl,
  position = 'bottom',
  horizontalAlign = 'center',
  width = 130,
  height = 130,
  messageId,
  filterId,
  journiId,
  onClose,
  backgroundColor = 'transparent',
}: FloaterProps) {
  // ✅ Compute initial position based on alignment
  const initialTop =
    position === 'top'
      ? 50
      : position === 'center'
        ? (screenHeight - height) / 2
        : screenHeight - height - 80;

  const initialLeft =
    horizontalAlign === 'left'
      ? 12
      : horizontalAlign === 'right'
        ? screenWidth - width - 12
        : (screenWidth - width) / 2;

  const pan = useRef(
    new Animated.ValueXY({ x: initialLeft, y: initialTop })
  ).current;
  const positionRef = useRef({ x: initialLeft, y: initialTop }); // ✅ persistent tracker

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
      onPanResponderMove: (_, gesture) => {
        const newX = positionRef.current.x + gesture.dx;
        const newY = positionRef.current.y + gesture.dy;

        pan.setValue({ x: newX, y: newY });
      },
      onPanResponderRelease: (_, gesture) => {
        let newX = positionRef.current.x + gesture.dx;
        let newY = positionRef.current.y + gesture.dy;

        // ✅ Clamp to screen bounds
        if (newX < 0) newX = 0;
        if (newY < 0) newY = 0;
        if (newX + width > screenWidth) newX = screenWidth - width;
        if (newY + height > screenHeight) newY = screenHeight - height;

        positionRef.current = { x: newX, y: newY };

        Animated.spring(pan, {
          toValue: { x: newX, y: newY },
          useNativeDriver: false,
        }).start();
      },
    })
  ).current;

  // 🧹 Reset on unmount
  useEffect(() => {
    return () => {
      pan.setValue({ x: initialLeft, y: initialTop });
      positionRef.current = { x: initialLeft, y: initialTop };
    };
  }, [pan, initialLeft, initialTop]);

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
    const commonHeaders = await buildCommonHeaders();
    const apiBaseUrl = await getApiBaseUrl();

    try {
      await fetch(`${apiBaseUrl}/v1/notification/in-app/track`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...commonHeaders,
        },
        body: JSON.stringify(payload),
      });
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
            const ctaId = this.value || this.innerText || '';
            let button_id = this.getAttribute('data-cta-id') || this.getAttribute('data-button-id') || this.getAttribute('data-action-id') || '';
            const onclickAttr = this.getAttribute('onclick') || '';
            const handleMatch = onclickAttr.match(/handleClick\\s*\\(\\s*['"]([^'"]*)['"]\\s*,\\s*['"]([^'"]*)['"]\\s*,\\s*['"]([^'"]*)['"]\\s*\\)/);
            let url = extractUrl(this);
            if (handleMatch) {
              button_id = handleMatch[1] || button_id;
              const label = handleMatch[2] || ctaId;
              url = handleMatch[3] || url;
              send({ type: 'buttonClick', ctaId: label, button_id: button_id, url });
              return;
            }
            if (!button_id && ctaId && /^PUSHAPP_/.test(ctaId)) {
              button_id = ctaId;
            }
            send({ type: 'buttonClick', ctaId, button_id, url });
          });
        };

        document.querySelectorAll('button').forEach(attachClickListener);
        document.querySelectorAll('a[href]').forEach(attachClickListener);
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initListeners);
      } else {
        initListeners();
      }
    })();
    true;
  `;

  const onMessage = async (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      switch (msg.type) {
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
          break;
        }
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
      }
    } catch (error) {
      await sendTrackEvent('unknown', 'invalid_json');
    }
  };

  const handleOverlayClose = () => {
    sendTrackEvent('dismissed').catch(() => {});
    onClose?.();
  };

  const preparedHtml = prepareOverlayPollHtml(html || '', backgroundColor);
  const webViewProps = getPollWebViewProps(backgroundColor);
  const transparentContainerStyle =
    getTransparentContainerStyle(backgroundColor);

  return (
    <Pressable style={styles.overlay} onPress={handleOverlayClose}>
      <Animated.View
        style={[
          styles.container,
          transparentContainerStyle,
          {
            width,
            height,
            backgroundColor,
            transform: [{ translateX: pan.x }, { translateY: pan.y }],
          },
        ]}
        onStartShouldSetResponder={() => true}
        {...panResponder.panHandlers}
      >
        {videoUrl ? (
          <Video
            source={{ uri: videoUrl }}
            style={styles.video}
            resizeMode="contain"
            controls
            paused={false}
            repeat={false}
            ignoreSilentSwitch="ignore"
          />
        ) : (
          <WebView
            source={{ html: preparedHtml }}
            style={[styles.webview, { backgroundColor }]}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowsFullscreenVideo
            scrollEnabled={false}
            injectedJavaScript={injectedJS}
            onMessage={onMessage}
            opaque={webViewProps.opaque}
            androidLayerType={webViewProps.androidLayerType}
          />
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: screenWidth,
    height: screenHeight,
    zIndex: 9998,
    backgroundColor: 'transparent',
  },
  container: {
    position: 'absolute',
    borderRadius: 8,
    overflow: 'hidden',
    elevation: 5,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  video: {
    width: '100%',
    height: '100%',
  },
});
