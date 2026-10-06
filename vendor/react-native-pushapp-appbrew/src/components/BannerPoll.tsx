import { useRef } from 'react';
import { sdkLog } from '../helpers/sdkLogger';
import {
  View,
  StyleSheet,
  Linking,
  Platform,
  Dimensions,
  TouchableOpacity,
  Text,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { buildCommonHeaders } from '../helpers/buildCommonHeaders';
import { getApiBaseUrl } from '../helpers/tenantContext';
import { prepareBannerPollHtml } from '../helpers/prepareBannerPollHtml';
import {
  getPollWebViewProps,
  getTransparentContainerStyle,
} from '../helpers/pollTransparency';
import { buildInAppTrackData } from '../utils/inAppTrack';
import {
  buildCtaData,
  buildSyntheticCtaData,
  normalizeInAppCtaFields,
  type CtaTrackFields,
} from '../utils/ctaTrackPayload';

export default function BannerPoll({
  html,
  messageId,
  filterId,
  journiId,
  onClose,
  backgroundColor = 'transparent',
  notificationUrl = '',
}: {
  html: string;
  messageId?: string;
  filterId?: string;
  journiId?: string;
  onClose?: () => void;
  backgroundColor?: string;
  notificationUrl?: string;
}) {
  const webViewRef = useRef<WebView>(null);
  /** Monotonic per touch; HTML fallback runs only if no CTA handled for this seq. */
  const tapSeqRef = useRef(0);
  const ctaHandledSeqRef = useRef(0);
  const lastTouchSeqRef = useRef(0);
  const bannerWidthRef = useRef(0);
  const cleanHtml = html.replace(/<\/?body[^>]*>/g, '');
  const preparedHtml = prepareBannerPollHtml(cleanHtml, backgroundColor);
  const webViewProps = getPollWebViewProps(backgroundColor);
  const transparentContainerStyle =
    getTransparentContainerStyle(backgroundColor);
  const hasIframe = /<iframe[\s>]/i.test(cleanHtml);
  // console.log('🧾 [BannerPoll] Raw HTML:', html);
  // console.log('🧾 [BannerPoll] Clean HTML:', cleanHtml);
  sdkLog.log('📨 messageId at bann:', messageId);
  sdkLog.log('📨 filterId at bann:', filterId);
  sdkLog.log('[BannerPoll] HTML contains iframe:', hasIframe);
  // Send track event helper
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(`${apiBaseUrl}/v1/notification/in-app/track`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...commonHeaders,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

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

  const fireAndForgetTrack = (
    eventType: 'cta' | 'dismissed' | 'longPress' | 'openUrl' | 'unknown',
    value?: string | CtaTrackFields
  ) => {
    sendTrackEvent(eventType, value).catch((err) => {
      sdkLog.warn(
        '[BannerPoll] Track event failed (non-blocking):',
        eventType,
        err
      );
    });
  };

  const extractFallbackCtas = (sourceHtml: string) => {
    const htmlValue = sourceHtml || '';
    const ctas: Array<{ label: string; url: string }> = [];
    const handleClickRe =
      /handleClick\s*\(\s*['"]([^'"]*)['"]\s*,\s*['"]([^'"]*)['"]\s*,\s*['"]([^'"]*)['"]\s*\)/gi;
    let m: RegExpExecArray | null;
    while ((m = handleClickRe.exec(htmlValue)) !== null) {
      const label = String(m[2] || '').trim();
      const url = normalizeUrl(String(m[3] || '').trim());
      ctas.push({ label, url });
    }
    return ctas;
  };

  const markCtaHandledForCurrentTouch = () => {
    ctaHandledSeqRef.current = lastTouchSeqRef.current;
  };

  const fallbackTapFromHtml = async (x: number, y: number, forSeq: number) => {
    if (forSeq !== lastTouchSeqRef.current) return;
    if (ctaHandledSeqRef.current === forSeq) return;
    const ctas = extractFallbackCtas(cleanHtml);
    if (!ctas.length) return;
    const w =
      bannerWidthRef.current > 0
        ? bannerWidthRef.current
        : Dimensions.get('window').width;
    // CTA stack is usually on the right; ignore obvious left-side title taps.
    if (x < w * 0.38) return;
    let picked = ctas[0];
    if (ctas.length > 1) {
      picked = y < w * 0.22 ? ctas[0] : ctas[1];
    }
    if (!picked) return;
    markCtaHandledForCurrentTouch();
    sdkLog.log('[BannerPoll][HTML fallback CTA]', {
      x,
      y,
      picked,
      total: ctas.length,
      forSeq,
    });
    fireAndForgetTrack('cta', buildCtaData(picked.label || 'fallback_cta', ''));
    if (picked.url) {
      try {
        await Linking.openURL(encodeURI(picked.url));
        fireAndForgetTrack('openUrl', picked.url);
      } catch (err) {
        sdkLog.warn('[BannerPoll][HTML fallback] open failed:', err);
      }
    }
  };

  const handleNativeUrlIntercept = async (rawUrl?: string) => {
    const url = normalizeUrl(rawUrl || '');
    if (!url) return false;
    try {
      sdkLog.log('[BannerPoll][NativeIntercept] Opening URL:', url);
      markCtaHandledForCurrentTouch();
      fireAndForgetTrack('cta', buildSyntheticCtaData('native_intercept'));
      await Linking.openURL(encodeURI(url));
      fireAndForgetTrack('openUrl', url);
      return true;
    } catch (err) {
      sdkLog.warn('[BannerPoll][NativeIntercept] Failed to open URL:', err);
      return false;
    }
  };

  // Runs before template HTML/scripts: real `handleClick` in their bundle is trapped
  // inside `window.onload` (not global), so inline onclick would be a no-op without this.
  const bridgeHandleClick = `
  (function() {
    window.handleClick = function (eventType, label, value) {
      var lab = typeof label === 'string' ? label : '';
      var button_id = typeof eventType === 'string' ? eventType : '';
      var url = typeof value === 'string' ? value : '';
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: 'buttonClick', ctaId: lab, button_id: button_id, url: url, source: 'handleClick' })
        );
      }
    };
  })();
  true;
  `;

  // Injected JavaScript for webview
  const injectedJS = `
  (function() {
    function init() {
      function postToRn(payload) {
        if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) return;
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
      postToRn({
        type: '__bannerInjected',
        phase: 'init',
        readyState: document.readyState,
        hasIframe: !!document.querySelector('iframe'),
      });

      // Prevent zooming
      let meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
      document.head.appendChild(meta);

      const style = document.createElement('style');
      style.innerHTML = \`
        html, body {
          margin: 0; padding: 0;
          overflow: hidden;
          width: 100%; height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          touch-action: manipulation;
        }
        button, a,
        input[type="button"], input[type="submit"], input[type="reset"],
        [onclick], [role="button"], [data-cta], [data-cta-id] {
          cursor: pointer;
          touch-action: manipulation;
          position: relative;
          z-index: 1000 !important;
          pointer-events: auto !important;
        }
      \`;
      document.head.appendChild(style);

      const extractFromHandleClick = (onclickAttr) => {
        if (!onclickAttr) return { eventType: '', label: '', url: '' };
        var m = onclickAttr.match(
          /handleClick\\s*\\(\\s*['"]([^'"]*)['"]\\s*,\\s*['"]([^'"]*)['"]\\s*,\\s*['"]([^'"]*)['"]\\s*\\)/
        );
        if (m) return { eventType: m[1] || '', label: m[2] || '', url: m[3] || '' };
        return { eventType: '', label: '', url: '' };
      };

      const extractUrl = (el) => {
        const onclickAttr = el.getAttribute('onclick') || '';
        var handled = extractFromHandleClick(onclickAttr);
        if (handled.url) return handled.url;
        const hrefAttr =
          el.getAttribute('data-href') ||
          el.getAttribute('data-url') ||
          el.getAttribute('href') ||
          '';
        var onClickUrlMatch = onclickAttr.match(
          /['"]((?:https?:\\/\\/|www\\.|[a-z0-9.-]+\\.[a-z]{2,})[^'"]*)['"]/i
        );
        if (onClickUrlMatch && onClickUrlMatch[1]) return onClickUrlMatch[1];
        return hrefAttr || '';
      };

      const extractButtonId = (el) => {
        var onclickAttr = el.getAttribute('onclick') || '';
        var handled = extractFromHandleClick(onclickAttr);
        if (handled.eventType) return handled.eventType;
        return (
          el.getAttribute('data-cta-id') ||
          el.getAttribute('data-button-id') ||
          el.getAttribute('data-action-id') ||
          ''
        );
      };

      const extractCtaLabel = (el) => {
        var onclickAttr = el.getAttribute('onclick') || '';
        var handled = extractFromHandleClick(onclickAttr);
        if (handled.label) return handled.label;
        return (
          el.getAttribute('data-cta') ||
          el.value ||
          el.innerText ||
          el.textContent ||
          ''
        );
      };

      var __meheryLastCtaTs = 0;
      function logTouchDebug(payload) {
        postToRn(Object.assign({ type: '__bannerTouchDebug' }, payload));
      }
      function logBannerTap(payload) {
        postToRn(Object.assign({ type: '__bannerTapped' }, payload));
      }
      function resolveInteractiveTarget(rawTarget) {
        if (!rawTarget) return null;
        var targetEl =
          rawTarget.nodeType === 3 && rawTarget.parentElement
            ? rawTarget.parentElement
            : rawTarget;
        if (!targetEl || !targetEl.closest) return null;
        var byClosest = targetEl.closest(
          [
            'button',
            'a[href]',
            'a[onclick]',
            'input[type="button"]',
            'input[type="submit"]',
            'input[type="reset"]',
            '[role="button"]',
            '[data-cta]',
            '[data-cta-id]',
            '.cta-button',
            '[onclick*="handleClick"]',
            '[onclick]',
            '[tabindex]',
          ].join(', ')
        );
        if (byClosest) return byClosest;
        var el = targetEl;
        for (var depth = 0; el && depth < 10; depth++) {
          var onclk = el.getAttribute && el.getAttribute('onclick');
          if (onclk && onclk.indexOf('handleClick') !== -1) return el;
          el = el.parentElement;
        }
        return null;
      }
      function pickInteractiveAtPoint(x, y) {
        var candidates = [];
        if (document.elementsFromPoint) {
          candidates = document.elementsFromPoint(x, y) || [];
        } else if (document.elementFromPoint) {
          var one = document.elementFromPoint(x, y);
          if (one) candidates = [one];
        }
        var hitTopTag =
          candidates[0] && candidates[0].tagName ? candidates[0].tagName : '';
        for (var i = 0; i < candidates.length; i++) {
          var found = resolveInteractiveTarget(candidates[i]);
          if (found) return { el: found, hitTopTag: hitTopTag };
        }
        for (var j = 0; j < candidates.length; j++) {
          var c = candidates[j];
          if (!c || !c.getAttribute) continue;
          var onclickAttr = c.getAttribute('onclick') || '';
          var hrefAttr = c.getAttribute('href') || c.getAttribute('data-url') || c.getAttribute('data-href') || '';
          var roleAttr = c.getAttribute('role') || '';
          var cStyle = window.getComputedStyle ? window.getComputedStyle(c) : null;
          var looksClickable = !!onclickAttr || !!hrefAttr || roleAttr === 'button' || (cStyle && cStyle.cursor === 'pointer');
          if (looksClickable) return { el: c, hitTopTag: hitTopTag };
        }
        return { el: null, hitTopTag: hitTopTag };
      }
      function emitCtaFromElement(interactiveEl, e) {
        if (!interactiveEl) return;
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        var now = Date.now();
        if (now - __meheryLastCtaTs < 400) return;
        __meheryLastCtaTs = now;

        var ctaId = String(extractCtaLabel(interactiveEl)).trim();
        var button_id = String(extractButtonId(interactiveEl)).trim();
        if (!button_id && ctaId && /^PUSHAPP_/.test(ctaId)) {
          button_id = ctaId;
        }
        var url = extractUrl(interactiveEl);
        var type =
          interactiveEl.tagName && interactiveEl.tagName.toLowerCase() === 'a'
            ? 'link'
            : 'buttonClick';
        logBannerTap({
          phase: 'cta',
          tag: interactiveEl.tagName || '',
          ctaId: ctaId,
          url: url,
        });
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: type, ctaId: ctaId, button_id: button_id, url: url })
          );
        }
      }

      // RN WebView (esp. Android) often does not fire a reliable synthetic "click" for taps.
      // elementFromPoint often returns only html/body; elementsFromPoint finds the real control.
      document.addEventListener(
        'touchend',
        function (e) {
          var t = e.changedTouches && e.changedTouches[0];
          if (!t) return;
          var x = t.clientX;
          var y = t.clientY;
          var picked = pickInteractiveAtPoint(x, y);
          logTouchDebug({
            phase: 'touchend',
            x: x,
            y: y,
            hitTopTag: picked.hitTopTag || '',
            resolved: !!picked.el,
            resolvedTag: picked.el && picked.el.tagName ? picked.el.tagName : '',
          });
          logBannerTap({
            phase: 'touchend',
            x: x,
            y: y,
            resolved: !!picked.el,
            resolvedTag: picked.el && picked.el.tagName ? picked.el.tagName : '',
            hitTopTag: picked.hitTopTag || '',
          });
          if (!picked.el) return;
          emitCtaFromElement(picked.el, e);
        },
        { capture: true, passive: false }
      );

      document.addEventListener(
        'click',
        function (e) {
          var interactiveEl = resolveInteractiveTarget(e.target);
          if (!interactiveEl && typeof e.clientX === 'number') {
            interactiveEl = pickInteractiveAtPoint(e.clientX, e.clientY).el;
          }
          logTouchDebug({
            phase: 'click',
            x: e.clientX,
            y: e.clientY,
            resolved: !!interactiveEl,
            resolvedTag: interactiveEl && interactiveEl.tagName ? interactiveEl.tagName : '',
          });
          logBannerTap({
            phase: 'click',
            x: e.clientX,
            y: e.clientY,
            resolved: !!interactiveEl,
            resolvedTag: interactiveEl && interactiveEl.tagName ? interactiveEl.tagName : '',
          });
          if (!interactiveEl) return;
          emitCtaFromElement(interactiveEl, e);
        },
        true
      );

      // Fallback delegated handler for creatives that stop propagation internally.
      document.body.addEventListener(
        'click',
        function (e) {
          var interactiveEl = resolveInteractiveTarget(e.target);
          if (!interactiveEl) return;
          logBannerTap({
            phase: 'delegated-click',
            resolved: true,
            resolvedTag: interactiveEl.tagName || '',
          });
          emitCtaFromElement(interactiveEl, e);
        },
        { capture: true }
      );

      // Some creatives render CTA elements late; force CTA styles repeatedly.
      var observer = new MutationObserver(function () {
        document
          .querySelectorAll('button, a, input[type="button"], input[type="submit"], input[type="reset"], [onclick], [role="button"], [data-cta], [data-cta-id]')
          .forEach(function (el) {
            el.style.pointerEvents = 'auto';
            el.style.position = 'relative';
            el.style.zIndex = '1000';
          });
      });
      observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true,
      });

      window.addEventListener(
        'touchstart',
        function (e) {
          var t = e.touches && e.touches[0];
          postToRn({
            type: '__bannerInjected',
            phase: 'touchstart',
            x: t ? t.clientX : null,
            y: t ? t.clientY : null,
          });
        },
        { capture: true, passive: true }
      );

      document.querySelectorAll('[data-close], .close-button, .poll-close, .close-btn')
        .forEach(el => {
          el.addEventListener('click', function() {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'dismissed' }));
          });
        });

      var __notificationUrl = '${notificationUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}';
      if (__notificationUrl) {
        document.querySelectorAll('.media-item, .media-preview img').forEach(function(el) {
          el.style.cursor = 'pointer';
          el.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            postToRn({ type: 'imageClick', url: __notificationUrl });
          }, { capture: true });
        });
      }
    }

    try {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }
    } catch (err) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({
            type: '__bannerInjectedError',
            message: err && err.message ? String(err.message) : 'unknown',
            stack: err && err.stack ? String(err.stack) : '',
          })
        );
      }
    }
  })();
  true;
`;

  const reinjectAndProbeTap = (x: number, y: number) => {
    const probeJS = `
      (function() {
        try {
          var rawX = ${Math.round(x)};
          var rawY = ${Math.round(y)};
          var vw = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
          var vh = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
          var dpr = Math.max(1, window.devicePixelRatio || 1);
          var points = [
            [rawX, rawY],
            [rawX / dpr, rawY / dpr],
            [rawX * dpr, rawY * dpr],
            [rawX + 12, rawY],
            [rawX - 12, rawY],
            [rawX, rawY + 12],
            [rawX, rawY - 12],
          ];
          function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
          var candidates = [];
          function appendFromPoint(px, py) {
            var x = clamp(px, 1, vw - 1);
            var y = clamp(py, 1, vh - 1);
            var arr = [];
            if (document.elementsFromPoint) {
              arr = document.elementsFromPoint(x, y) || [];
            } else if (document.elementFromPoint) {
              var single = document.elementFromPoint(x, y);
              arr = single ? [single] : [];
            }
            for (var i = 0; i < arr.length; i++) candidates.push(arr[i]);
          }
          for (var p = 0; p < points.length; p++) appendFromPoint(points[p][0], points[p][1]);
          var selector = [
            'button',
            'a[href]',
            'a[onclick]',
            'input[type="button"]',
            'input[type="submit"]',
            'input[type="reset"]',
            '[role="button"]',
            '[data-cta]',
            '[data-cta-id]',
            '[onclick]',
            '[tabindex]',
          ].join(', ');
          var interactive = null;
          for (var i = 0; i < candidates.length; i++) {
            var node = candidates[i];
            if (!node || !node.closest) continue;
            var hit = node.closest(selector);
            if (hit) {
              interactive = hit;
              break;
            }
          }
          if (!interactive && candidates.length > 0) {
            var c = candidates[0];
            if (c && c.getAttribute) {
              var onclickAttr = c.getAttribute('onclick') || '';
              var hrefAttr = c.getAttribute('href') || c.getAttribute('data-url') || c.getAttribute('data-href') || '';
              var roleAttr = c.getAttribute('role') || '';
              var cStyle = window.getComputedStyle ? window.getComputedStyle(c) : null;
              var looksClickable = !!onclickAttr || !!hrefAttr || roleAttr === 'button' || (cStyle && cStyle.cursor === 'pointer');
              if (looksClickable) interactive = c;
            }
          }
          if (!interactive) {
            var allHandleClickNodes = document.querySelectorAll('[onclick*="handleClick"], [onclick], button, a[href], [role="button"]');
            var best = null;
            var bestDist = Infinity;
            for (var n = 0; n < allHandleClickNodes.length; n++) {
              var el = allHandleClickNodes[n];
              if (!el || !el.getBoundingClientRect) continue;
              var r = el.getBoundingClientRect();
              var cx = r.left + r.width / 2;
              var cy = r.top + r.height / 2;
              var dx = cx - rawX;
              var dy = cy - rawY;
              var dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < bestDist) {
                best = el;
                bestDist = dist;
              }
            }
            if (best && bestDist < Math.max(vw, vh) * 0.35) interactive = best;
          }
          if (interactive) {
            try {
              if (typeof interactive.click === 'function') interactive.click();
            } catch (_) {}
            try {
              var ev = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
              interactive.dispatchEvent(ev);
            } catch (_) {}
            if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: '__nativeTapProbe',
                x: rawX,
                y: rawY,
                hitTopTag: candidates[0] && candidates[0].tagName ? candidates[0].tagName : '',
                resolvedTag: interactive.tagName || '',
                candidateCount: candidates.length,
              }));
            }
          } else if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            try {
              var target = document.elementFromPoint(rawX, rawY);
              if (target) {
                var down = new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: rawX, clientY: rawY });
                var up = new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: rawX, clientY: rawY });
                var clk = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: rawX, clientY: rawY });
                target.dispatchEvent(down);
                target.dispatchEvent(up);
                target.dispatchEvent(clk);
              }
            } catch (_) {}
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: '__nativeTapProbe',
              x: rawX,
              y: rawY,
              hitTopTag: candidates[0] && candidates[0].tagName ? candidates[0].tagName : '',
              resolvedTag: '',
              candidateCount: candidates.length,
            }));
          }
        } catch (err) {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: '__nativeTapProbeError',
              message: err && err.message ? String(err.message) : 'unknown',
            }));
          }
        }
      })();
      true;
    `;
    webViewRef.current?.injectJavaScript(probeJS);
  };

  return (
    <View
      style={[styles.container, transparentContainerStyle, { backgroundColor }]}
      pointerEvents="auto"
      collapsable={Platform.OS === 'android' ? false : undefined}
      onLayout={(e) => {
        bannerWidthRef.current = e.nativeEvent.layout.width;
      }}
    >
      <TouchableOpacity
        style={styles.closeBtn}
        onPress={() => {
          fireAndForgetTrack('dismissed');
          onClose?.();
        }}
      >
        <Text style={styles.closeText}>✕</Text>
      </TouchableOpacity>
      <WebView
        ref={webViewRef}
        source={{ html: preparedHtml }}
        style={[styles.webview, { backgroundColor }]}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        scalesPageToFit={false}
        nestedScrollEnabled={Platform.OS === 'android'}
        androidLayerType={webViewProps.androidLayerType}
        // @ts-ignore opaque is a valid iOS WebView prop not in current type defs
        opaque={webViewProps.opaque}
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically
        onTouchStart={() => {
          sdkLog.log('[BannerPoll][Native] WebView touch start');
        }}
        onTouchEnd={(e) => {
          tapSeqRef.current += 1;
          const seq = tapSeqRef.current;
          lastTouchSeqRef.current = seq;
          const x = e?.nativeEvent?.locationX ?? e?.nativeEvent?.pageX ?? 0;
          const y = e?.nativeEvent?.locationY ?? e?.nativeEvent?.pageY ?? 0;
          sdkLog.log('[BannerPoll][Native] WebView touch end', { x, y, seq });
          reinjectAndProbeTap(x, y);
          setTimeout(() => {
            fallbackTapFromHtml(x, y, seq).catch(() => {});
          }, 500);
        }}
        onTouchCancel={() => {
          sdkLog.log('[BannerPoll][Native] WebView touch cancel');
        }}
        onTouchMove={() => {}}
        injectedJavaScriptBeforeContentLoaded={bridgeHandleClick}
        injectedJavaScript={bridgeHandleClick + injectedJS}
        onShouldStartLoadWithRequest={(req: any) => {
          const url = req?.url || '';
          if (!url) return true;
          // Allow initial inline HTML loads.
          if (
            url.startsWith('about:blank') ||
            url.startsWith('data:text/html')
          ) {
            return true;
          }
          // Native fallback for release/APK where injected click handlers may not fire.
          handleNativeUrlIntercept(url);
          return false;
        }}
        onMessage={async (event) => {
          try {
            const msg = JSON.parse(event.nativeEvent.data);
            if (msg.type === '__bannerTouchDebug') {
              if (Platform.OS === 'android') {
                sdkLog.log('[BannerPoll][Android WebView touch]', {
                  phase: msg.phase,
                  x: msg.x,
                  y: msg.y,
                  hitTopTag: msg.hitTopTag,
                  resolved: msg.resolved,
                  resolvedTag: msg.resolvedTag,
                });
              }
              return;
            }
            if (msg.type === '__bannerTapped') {
              sdkLog.log('[BannerPoll] Banner tapped:', msg);
              return;
            }
            if (msg.type === '__bannerInjected') {
              sdkLog.log('[BannerPoll][Injected]', msg);
              return;
            }
            if (msg.type === '__bannerInjectedError') {
              sdkLog.log('[BannerPoll][InjectedError]', msg);
              return;
            }
            if (msg.type === '__nativeTapProbe') {
              sdkLog.log('[BannerPoll][NativeTapProbe]', msg);
              return;
            }
            if (msg.type === '__nativeTapProbeError') {
              sdkLog.log('[BannerPoll][NativeTapProbeError]', msg);
              return;
            }
            if (msg.type === 'imageClick') {
              markCtaHandledForCurrentTouch();
              const url = normalizeUrl(msg.url || '');
              fireAndForgetTrack('cta', buildSyntheticCtaData('MEDIA_CLICK'));
              if (url) {
                await Linking.openURL(encodeURI(url));
                fireAndForgetTrack('openUrl', url);
              }
              return;
            }
            sdkLog.log('📩 BannerPoll message:', msg);

            // Template posts { event: "INAPP_CTA", data: { label, value } }
            if (msg.event === 'INAPP_CTA' || msg.type === 'INAPP_CTA') {
              markCtaHandledForCurrentTouch();
              const cta = normalizeInAppCtaFields(msg);
              const rawUrl = msg.data?.value || msg.url || '';
              const url = normalizeUrl(
                typeof rawUrl === 'string' ? rawUrl : String(rawUrl || '')
              );
              fireAndForgetTrack('cta', cta);
              if (url) {
                await Linking.openURL(encodeURI(url));
                fireAndForgetTrack('openUrl', url);
              }
              return;
            }

            if (msg.type === 'buttonClick' || msg.type === 'cta') {
              markCtaHandledForCurrentTouch();
              const cta = normalizeInAppCtaFields(msg);
              const rawUrl = msg.url || msg.value || '';
              const url = normalizeUrl(rawUrl);

              fireAndForgetTrack('cta', cta);
              if (url) {
                sdkLog.log('🌐 Opening CTA link:', url);
                const finalUrl = encodeURI(url);
                await Linking.openURL(finalUrl);
                fireAndForgetTrack('openUrl', url);
              }
            } else if (msg.type === 'link' || msg.type === 'openUrl') {
              markCtaHandledForCurrentTouch();
              const cta = normalizeInAppCtaFields(msg);
              const url = normalizeUrl(msg.url);
              if (cta.ctaId) {
                sdkLog.log(
                  '[BannerPoll] CTA from link tap:',
                  cta.ctaId,
                  url || '(no url)'
                );
                fireAndForgetTrack('cta', cta);
              }
              if (url) {
                sdkLog.log('🌐 Opening link:', url);
                const finalUrl = encodeURI(url);
                await Linking.openURL(finalUrl);
                fireAndForgetTrack('openUrl', url);
              }
            } else if (msg.type === 'dismissed') {
              markCtaHandledForCurrentTouch();
              sdkLog.log('🚪 Banner dismissed');
              fireAndForgetTrack('dismissed');
              onClose?.();
            } else {
              fireAndForgetTrack('unknown');
            }
          } catch (err) {
            sdkLog.warn(
              '⚠️ Invalid message from WebView:',
              event.nativeEvent.data
            );
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    width: '100%',
    minHeight: 100,
    height: 100,
    zIndex: 9999,
    borderRadius: 0,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  closeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10001,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
});
