import { WebView } from 'react-native-webview';
import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Linking,
  Platform,
  Pressable,
} from 'react-native';
import { sendCustomEvent } from '../events/custom/CustomEvents';
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
import inlinePollEmitter from './InlinePollEmitter';

const inlinePollRegistry: Record<
  string,
  {
    htmlContent: string;
    style?: any;
    updatedAt: number;
    messageId?: string;
    filterId?: string;
    journiId?: string;
  }
> = {};

export async function renderInlinePoll(
  placeholderId: string,
  htmlContent: string | null,
  style?: any,
  {
    messageId,
    filterId,
    journiId,
  }: { messageId?: string; filterId?: string; journiId?: string } = {}
) {
  // 🧹 Clear if null
  if (!htmlContent) {
    delete inlinePollRegistry[placeholderId];
    sdkLog.log(`🧹 Cleared inline poll for ${placeholderId}`);
    inlinePollEmitter.emit('inlinePollUpdated', { placeholderId, poll: null });
    return;
  }

  const pollData = {
    htmlContent,
    style,
    messageId,
    filterId,
    journiId,
    updatedAt: Date.now(),
  };

  // 🧠 Save in memory only
  inlinePollRegistry[placeholderId] = pollData;
  sdkLog.log(
    `💾 Saved inline poll in memory for ${placeholderId} @ ${pollData.updatedAt}`
  );
  inlinePollEmitter.emit('inlinePollUpdated', {
    placeholderId,
    poll: pollData,
  });
}

const MIN_HEIGHT = 1;
const FALLBACK_HEIGHT = 120;
const HEIGHT_BUFFER = 0;

export function InlinePollContainer({
  placeholderId,
}: {
  placeholderId: string;
}) {
  const [poll, setPoll] = useState<any>(
    inlinePollRegistry[placeholderId] || null
  );
  const [contentHeight, setContentHeight] = useState<number>(FALLBACK_HEIGHT);
  const lastHeightRef = useRef(0);
  const mountTimeRef = useRef(Date.now());
  const lastNativeTapRef = useRef(0);
  const webViewRef = useRef<WebView>(null);

  // 🔄 Load poll data on mount / placeholder change, and react immediately to updates
  useEffect(() => {
    const applyPoll = (memPoll: (typeof inlinePollRegistry)[string] | null) => {
      setPoll(memPoll?.htmlContent ? memPoll : null);
    };

    applyPoll(inlinePollRegistry[placeholderId] || null);

    const onUpdated = ({
      placeholderId: updatedId,
      poll: nextPoll,
    }: {
      placeholderId: string;
      poll: (typeof inlinePollRegistry)[string] | null;
    }) => {
      if (updatedId !== placeholderId) return;
      sdkLog.log(`🔄 Inline poll updated for ${placeholderId}`);
      applyPoll(nextPoll);
    };

    inlinePollEmitter.on('inlinePollUpdated', onUpdated);
    return () => {
      inlinePollEmitter.off('inlinePollUpdated', onUpdated);
    };
  }, [placeholderId]);

  // 🛰 Track CTA and open events
  const sendTrackEvent = async (
    eventType: 'cta' | 'dismissed' | 'longPress' | 'openUrl' | 'unknown',
    value?: string | CtaTrackFields
  ) => {
    if (!poll) return;

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
      messageId: poll.messageId,
      filterId: poll.filterId,
      ...(poll.journiId ? { journiId: poll.journiId } : {}),
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
    const value = rawUrl.trim().replace(/^['"]|['"]$/g, '');
    if (!value) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
    if (/^https?:\/\//i.test(value)) return value;
    if (/^www\./i.test(value)) return `https://${value}`;
    if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(value))
      return `https://${value}`;
    return '';
  };

  // Reset height when poll content changes
  useEffect(() => {
    if (poll?.htmlContent) {
      mountTimeRef.current = Date.now();
      lastHeightRef.current = 0;
      setContentHeight(FALLBACK_HEIGHT);
    }
  }, [poll?.htmlContent, poll?.updatedAt]);

  // 🧩 Handle messages from WebView
  const onMessage = (event: any) => {
    const raw = event.nativeEvent.data;
    try {
      const message = JSON.parse(raw);

      if (
        message.type === 'contentHeight' &&
        typeof message.height === 'number'
      ) {
        const newHeight = Math.max(MIN_HEIGHT, message.height + HEIGHT_BUFFER);
        const elapsed = Date.now() - mountTimeRef.current;
        // Block late height growth (e.g. double-tap zoom) after initial layout settles
        if (
          lastHeightRef.current > 0 &&
          newHeight > lastHeightRef.current &&
          elapsed > 1000
        ) {
          return;
        }
        if (Math.abs(newHeight - lastHeightRef.current) > 2) {
          lastHeightRef.current = newHeight;
          setContentHeight(newHeight);
        }
        return;
      }
      sdkLog.log('📩 InlinePoll message:', message);

      switch (message.type) {
        case 'imageClick': {
          const url = normalizeUrl(message.url || '');
          if (url) {
            const mediaCta = buildSyntheticCtaData('MEDIA_CLICK');
            sendTrackEvent('cta', mediaCta);
            sendTrackEvent('openUrl', url);
            sendCustomEvent('sendcta', {
              ctaId: mediaCta.ctaId,
              button_id: mediaCta.button_id,
              url,
              compare: placeholderId,
              messageId: poll?.messageId,
              filterId: poll?.filterId,
            });
            Linking.openURL(encodeURI(url)).catch((err) =>
              sdkLog.error('Failed to open URL:', err)
            );
          }
          break;
        }

        case 'buttonClick':
        case 'cta': {
          const cta = normalizeInAppCtaFields(message);
          const url = normalizeUrl(message.url || message.value || '');
          sendTrackEvent('cta', cta);
          sendCustomEvent('sendcta', {
            ctaId: cta.ctaId,
            button_id: cta.button_id,
            url: url || undefined,
            compare: placeholderId,
            messageId: poll?.messageId,
            filterId: poll?.filterId,
          });
          if (url) {
            Linking.openURL(encodeURI(url)).catch((err) =>
              sdkLog.error('❌ Failed to open URL:', err)
            );
          }
          break;
        }

        case 'closePoll':
          sendTrackEvent('dismissed');
          break;

        case 'longPress':
          sendTrackEvent('longPress', message.value);
          break;

        case 'openUrl':
        case 'link': {
          const url = normalizeUrl(message.url);
          sendTrackEvent('openUrl', url);
          if (url) {
            Linking.openURL(encodeURI(url)).catch((err) =>
              sdkLog.error('❌ Failed to open URL:', err)
            );
          }
          break;
        }

        default:
          sdkLog.warn('⚠️ Unknown message type:', message);
          sendTrackEvent('unknown', JSON.stringify(message));
      }
    } catch (err) {
      sdkLog.warn('⚠️ Invalid message from WebView:', raw);
      sendTrackEvent('unknown', JSON.stringify(raw));
    }
  };

  useEffect(() => {
    if (poll?.htmlContent) {
      sdkLog.log('🧩 Inline poll rendered:', placeholderId);
      sendCustomEvent('widget_open', {
        compare: placeholderId,
        messageId: poll?.messageId,
        filterId: poll?.filterId,
      });
    }
  }, [placeholderId, poll]);

  const handleWebViewLoadEnd = useCallback(() => {
    webViewRef.current?.injectJavaScript(
      'if (window.__meheryInlineInitListeners) { window.__meheryInlineInitListeners(); } true;'
    );
  }, []);

  const handleNotificationNativeTap = useCallback(() => {
    const url = normalizeUrl(
      typeof poll?.style?.notification_url === 'string'
        ? poll.style.notification_url.trim()
        : ''
    );
    if (!url) return;

    const now = Date.now();
    if (now - lastNativeTapRef.current < 400) return;
    lastNativeTapRef.current = now;

    const mediaCta = buildSyntheticCtaData('MEDIA_CLICK');
    sendTrackEvent('cta', mediaCta);
    sendTrackEvent('openUrl', url);
    sendCustomEvent('sendcta', {
      ctaId: mediaCta.ctaId,
      button_id: mediaCta.button_id,
      url,
      compare: placeholderId,
      messageId: poll?.messageId,
      filterId: poll?.filterId,
    });
    Linking.openURL(encodeURI(url)).catch((err) =>
      sdkLog.error('Failed to open URL:', err)
    );
  }, [poll, placeholderId]);

  if (!poll?.htmlContent) return null;

  const inlineNotificationUrl =
    typeof poll?.style?.notification_url === 'string'
      ? poll.style.notification_url.trim()
      : '';

  const injectedJS = `
    (function() {
      const send = (data) => window.ReactNativeWebView.postMessage(JSON.stringify(data));
      document.addEventListener('gesturestart', function(e) { e.preventDefault(); }, { passive: false });
      document.addEventListener('dblclick', function(e) { e.preventDefault(); }, { passive: false });
function measureAndSend() {
  var wrapper = document.querySelector('.banner-wrapper')
    || document.querySelector('.preview-wrapper')
    || document.body;
  var height = wrapper
    ? Math.ceil(wrapper.getBoundingClientRect().height)
    : Math.ceil(document.documentElement.scrollHeight);
  send({ type: 'contentHeight', height: height });
}
      if (document.readyState === 'complete') {
        measureAndSend();
        setTimeout(measureAndSend, 400);
      } else {
        window.addEventListener('load', function() {
          measureAndSend();
        });
      }
      document.querySelectorAll('img').forEach(function(img) {
        img.onload = measureAndSend;
        if (img.complete) measureAndSend();
      });
      
      function initListeners() {
        var __notificationUrl = '${inlineNotificationUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}';

        document.querySelectorAll('*').forEach(function(el) {
          if (!el || !el.style) return;
          el.style.boxShadow = 'none';
          el.style.webkitBoxShadow = 'none';
          el.style.filter = 'none';
          el.style.outline = 'none';
        });

        var shadowKill = document.getElementById('inline-poll-shadow-kill');
        if (!shadowKill) {
          shadowKill = document.createElement('style');
          shadowKill.id = 'inline-poll-shadow-kill';
          (document.body || document.documentElement).appendChild(shadowKill);
        }
        shadowKill.textContent = [
          '*, *::before, *::after {',
          '  box-shadow: none !important;',
          '  -webkit-box-shadow: none !important;',
          '  filter: none !important;',
          '  -webkit-filter: none !important;',
          '  text-shadow: none !important;',
          '  outline: none !important;',
          '}',
        ].join('\\n');

        document.querySelectorAll('.preview-wrapper, .banner-wrapper, .pop-up-dimensions, .pop-up-vertical-content').forEach(function(el) {
          el.style.margin = '0';
          el.style.padding = '0';
          el.style.minHeight = '0';
          el.style.border = 'none';
        });

        document.querySelectorAll('body, html, .preview-wrapper, .banner-wrapper, .media-preview, .media-item, img').forEach(function(el) {
          el.style.pointerEvents = 'auto';
          if (__notificationUrl) el.style.cursor = 'pointer';
        });

        if (window.__meheryInlineButtonsBound) return;
        window.__meheryInlineButtonsBound = true;

        const attachClickListener = function(element) {
          element.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            var value = this.value || this.innerText || '';
            var button_id = this.getAttribute('data-cta-id') || this.getAttribute('data-button-id') || this.getAttribute('data-action-id') || '';
            var url = '';
            var onclick = (this.getAttribute('onclick') || '');
            var href = (this.getAttribute('data-href') || this.getAttribute('href') || '');
            var handleMatch = onclick.match(/handleClick\\s*\\(\\s*['"]([^'"]*)['"]\\s*,\\s*['"]([^'"]*)['"]\\s*,\\s*['"]([^'"]*)['"]\\s*\\)/);
            if (handleMatch) {
              button_id = handleMatch[1] || button_id;
              value = handleMatch[2] || value;
              url = handleMatch[3] || '';
            } else {
              var match = onclick.match(/handleClick\\s*\\([^,]*,[^,]*,\\s*['"]([^'"]+)['"]\\)/) || onclick.match(/['"]((?:https?:\\/\\/|www\\.)[^'"]+)['"]/);
              if (match) {
                url = match[1] || '';
              } else if (href) {
                url = href;
              }
            }
            if (!button_id && value && /^PUSHAPP_/.test(value)) {
              button_id = value;
            }
            send({ type: 'buttonClick', ctaId: value, button_id: button_id, url: url });
          }, true);
        };

        document.querySelectorAll('button').forEach(attachClickListener);
        document.querySelectorAll('a').forEach(attachClickListener);

        document.querySelectorAll('[data-close], .close-button, .poll-close, .close-btn').forEach(el => {
          el.addEventListener('click', () => send({ type: 'closePoll' }));
        });
      }

      window.__meheryInlineInitListeners = initListeners;

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initListeners);
      } else {
        initListeners();
      }
      window.addEventListener('load', function() {
        initListeners();
        setTimeout(initListeners, 300);
      });
    })();
    true;
  `;

  const layoutFixStyles = `
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
<style id="inline-poll-layout-fix">
  *, *::before, *::after {
    box-shadow: none !important;
    -webkit-box-shadow: none !important;
    filter: none !important;
    -webkit-filter: none !important;
    text-shadow: none !important;
    outline: none !important;
  }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    height: auto !important;
    min-height: 0 !important;
    overflow: hidden !important;
    touch-action: manipulation;
    -webkit-text-size-adjust: 100%;
    background: #ffffff !important;
  }
  .preview-wrapper,
  .preview-wrapper.pop-up-dimensions,
  .pop-up-dimensions,
  .banner-wrapper,
  .pop-up-vertical-content {
    position: relative !important;
    top: auto !important;
    left: auto !important;
    right: auto !important;
    bottom: auto !important;
    transform: none !important;
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    min-height: 0 !important;
    height: auto !important;
    box-shadow: none !important;
    -webkit-box-shadow: none !important;
    filter: none !important;
    border: none !important;
  }
  /* Only strip background on the outer shells — keep the banner's own
     campaign background (e.g. inline style background: rgb(0,0,0)). */
  .preview-wrapper,
  .preview-wrapper.pop-up-dimensions,
  .pop-up-dimensions,
  .pop-up-vertical-content {
    background: transparent !important;
  }
  .banner-wrapper {
    min-height: 0 !important;
  }
  .media-preview, .media-item {
    margin: 0 !important;
    padding: 0 !important;
  }
</style>`;

  const injectInlineHtmlFixes = (html: string) => {
    const shadowKillLate = `
<style id="inline-poll-shadow-kill-late">
  *, *::before, *::after {
    box-shadow: none !important;
    -webkit-box-shadow: none !important;
    filter: none !important;
    -webkit-filter: none !important;
    drop-shadow: none !important;
    text-shadow: none !important;
    outline: none !important;
  }
  .preview-wrapper, .preview-wrapper.pop-up-dimensions, .pop-up-dimensions,
  .banner-wrapper, .pop-up-vertical-content, .media-preview, .media-item,
  [class*="wrapper"], [class*="preview"], [class*="banner"] {
    box-shadow: none !important;
    -webkit-box-shadow: none !important;
    filter: none !important;
    -webkit-filter: none !important;
    outline: none !important;
    border: none !important;
    margin: 0 !important;
    padding: 0 !important;
    min-height: 0 !important;
  }
</style>`;
    let result = html;
    if (/<\/head>/i.test(result)) {
      result = result.replace(/<\/head>/i, `${layoutFixStyles}</head>`);
    } else {
      result = layoutFixStyles + result;
    }
    if (/<\/body>/i.test(result)) {
      return result.replace(/<\/body>/i, `${shadowKillLate}</body>`);
    }
    return result + shadowKillLate;
  };

  const injectedHTML = injectInlineHtmlFixes(poll.htmlContent);
  const containerHeight = Math.max(MIN_HEIGHT, contentHeight);
  const hasNotificationUrl = !!inlineNotificationUrl.trim();

  return (
    <View
      style={[styles.container, { height: containerHeight }]}
      key={poll?.updatedAt}
      collapsable={Platform.OS === 'android' ? false : undefined}
      pointerEvents="box-none"
    >
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: injectedHTML }}
        injectedJavaScript={injectedJS}
        injectedJavaScriptBeforeContentLoaded="true;"
        onMessage={onMessage}
        onLoadEnd={handleWebViewLoadEnd}
        pointerEvents={hasNotificationUrl ? 'none' : 'auto'}
        style={[styles.webview, { height: containerHeight }]}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        scalesPageToFit={false}
        nestedScrollEnabled={Platform.OS === 'android'}
        setSupportMultipleWindows={false}
        mixedContentMode="always"
        androidLayerType="software"
        javaScriptEnabled
        domStorageEnabled
      />
      {hasNotificationUrl ? (
        <Pressable
          style={[styles.tapOverlay, { height: containerHeight }]}
          onPress={handleNotificationNativeTap}
          android_ripple={{ color: 'rgba(0,0,0,0.04)', borderless: true }}
          accessibilityRole="link"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    ...Platform.select({
      android: { elevation: 0 },
      ios: {
        shadowColor: 'transparent',
        shadowOpacity: 0,
        shadowRadius: 0,
        shadowOffset: { width: 0, height: 0 },
      },
    }),
  },
  webview: {
    backgroundColor: '#ffffff',
    ...Platform.select({
      android: { elevation: 0 },
      ios: {
        shadowColor: 'transparent',
        shadowOpacity: 0,
        shadowRadius: 0,
        shadowOffset: { width: 0, height: 0 },
      },
    }),
  },
  tapOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    backgroundColor: 'transparent',
  },
});
