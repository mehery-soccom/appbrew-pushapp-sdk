import { useState, useRef, useEffect, useCallback } from 'react';
import { sdkLog } from '../helpers/sdkLogger';
import {
  View,
  TouchableOpacity,
  Text,
  Dimensions,
  StyleSheet,
  PanResponder,
  Animated,
  Linking,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { buildCommonHeaders } from '../helpers/buildCommonHeaders';
import { getApiBaseUrl } from '../helpers/tenantContext';
import { buildInAppTrackData } from '../utils/inAppTrack';
import {
  buildCtaData,
  normalizeInAppCtaFields,
  type CtaTrackFields,
} from '../utils/ctaTrackPayload';
import { preparePipPollHtml } from '../helpers/preparePipPollHtml';
import {
  getPollWebViewProps,
  getTransparentContainerStyle,
} from '../helpers/pollTransparency';

const { width, height } = Dimensions.get('window');

interface PipPollProps {
  html: string;
  fullscreen?: boolean;
  alignment?: string; // "top-left", "center-right", etc
  messageId?: string;
  filterId?: string;
  journiId?: string;
  onClose?: () => void;
  backgroundColor?: string;
}

export default function PipPoll({
  html,
  fullscreen,
  alignment,
  messageId,
  filterId,
  journiId,
  onClose,
  backgroundColor = 'transparent',
}: PipPollProps) {
  const [maximized, setMaximized] = useState(false);
  const pan = useRef(new Animated.ValueXY()).current;

  // Convert alignment string to initial x/y
  const getInitPos = useCallback((): { x: number; y: number } => {
    const w = width / 3;
    const h = height / 4;
    const topInset = Platform.OS === 'ios' ? 52 : 10;
    const edgePadding = 10;
    let x: number, y: number;

    if (alignment) {
      const [vertical, horizontal] = alignment.split('-');

      if (vertical === 'top') y = topInset;
      else if (vertical === 'center') y = (height - h) / 2;
      else if (vertical === 'bottom') y = height - h - edgePadding;
      else y = height - h - edgePadding;

      if (horizontal === 'left') x = edgePadding;
      else if (horizontal === 'center') x = (width - w) / 2;
      else if (horizontal === 'right') x = width - w - edgePadding;
      else x = edgePadding;
    } else {
      x = edgePadding;
      y = height - h - edgePadding;
    }

    return { x, y };
  }, [alignment]);

  useEffect(() => {
    pan.setValue(getInitPos());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alignment]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return (
          (Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5) &&
          !maximized &&
          !fullscreen
        );
      },
      onPanResponderGrant: () => {
        const x = (pan.x as any).__getValue();
        const y = (pan.y as any).__getValue();
        pan.setOffset({ x, y });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: () => {
        pan.flattenOffset();
      },
    })
  ).current;

  const preparedHtml = preparePipPollHtml(html, backgroundColor);
  const webViewProps = getPollWebViewProps(backgroundColor);
  const transparentContainerStyle =
    getTransparentContainerStyle(backgroundColor);

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

  // Fullscreen / Maximized Mode
  if (maximized || fullscreen) {
    return (
      <View
        style={[
          styles.fullscreenContainer,
          transparentContainerStyle,
          { width, height, backgroundColor },
        ]}
      >
        <WebView
          source={{ html: preparedHtml }}
          style={[styles.web, { backgroundColor }]}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          originWhitelist={['*']}
          injectedJavaScript={injectedJS}
          onMessage={onMessage}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          scalesPageToFit={false}
          opaque={webViewProps.opaque}
          androidLayerType={webViewProps.androidLayerType}
        />
        <TouchableOpacity
          style={styles.maxBtn}
          onPress={() => {
            sendTrackEvent('dismissed').catch(() => {});
            onClose?.();
          }}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        >
          <Text style={styles.maxBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const containerStyle = { width: width / 3, height: height / 4 };

  return (
    <Animated.View
      style={[
        containerStyle,
        pan.getLayout(),
        styles.pipContainer,
        transparentContainerStyle,
        { backgroundColor },
      ]}
      {...(!maximized && !fullscreen ? panResponder.panHandlers : {})}
    >
      <WebView
        source={{ html: preparedHtml }}
        style={[styles.web, { backgroundColor }]}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        originWhitelist={['*']}
        injectedJavaScript={injectedJS}
        onMessage={onMessage}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        scalesPageToFit={false}
        opaque={webViewProps.opaque}
        androidLayerType={webViewProps.androidLayerType}
      />
      <TouchableOpacity
        style={styles.maxBtnSmall}
        onPress={() => setMaximized(true)}
        accessibilityRole="button"
        accessibilityLabel="Enter fullscreen"
        hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
      >
        <Text style={styles.maxBtnGlyph}>⛶</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullscreenContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 10000,
    elevation: 10000,
  },
  web: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  pipContainer: {
    position: 'absolute',
    zIndex: 400,
    elevation: 5,
    borderRadius: 8,
    overflow: 'hidden',
  },
  maxBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    right: 12,
    padding: 6,
    zIndex: 10001,
  },
  maxBtnSmall: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    padding: 6,
  },
  maxBtnText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 20,
    lineHeight: 22,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  maxBtnGlyph: {
    color: 'white',
    fontSize: 18,
    lineHeight: 20,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
});
