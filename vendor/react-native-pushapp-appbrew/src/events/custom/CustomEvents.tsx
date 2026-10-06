import AsyncStorage from '@react-native-async-storage/async-storage';
import { showPollOverlay } from '../../components/PollOverlay';
import BannerPoll from '../../components/BannerPoll';
import PipPoll from '../../components/PipPoll';
import BottomSheetPoll from '../../components/BottomSheetPoll';
import RoadblockPoll from '../../components/RoadblockPoll';
import { renderInlinePoll } from '../../components/RenderInlinePoll';
import { renderTooltipPoll } from '../../components/TooltipPollManager';
import Floater from '../../components/FloaterPoll';
import { buildCommonHeaders } from '../../helpers/buildCommonHeaders';
import { getApiBaseUrl } from '../../helpers/tenantContext';
import { SDK_EVENT_NAMES } from '../default/eventNames';
import { getDeviceId } from '../../utils/device';
import { waitForGeoIp } from '../../utils/geoIpContext';
import { sdkLog } from '../../helpers/sdkLogger';
import { resolvePollBackgroundColor } from '../../helpers/resolvePollBackgroundColor';
import { resolvePollPlaceholderId } from '../../helpers/resolvePollPlaceholderId';
import {
  claimInAppAck,
  noteUnchangedInAppPoll,
  releaseInAppAck,
  shouldIgnoreWebSocketPoll,
} from './pollFetchGuard';
import {
  getEffectiveContactId,
  shouldBlockInteractiveBeforeLink,
  waitForEffectiveUserId,
} from '../../utils/user';

export type SendCustomEventOptions = {
  eventType?: 'INTERACTIVE' | 'LOG';
};

type PendingCustomEvent = {
  event_name: string;
  event_data: object;
  options?: SendCustomEventOptions;
};

const PENDING_CUSTOM_EVENT_QUEUE_CAP = 50;
const pendingCustomEvents: PendingCustomEvent[] = [];
let flushingPendingCustomEvents = false;

function enqueuePendingCustomEvent(
  event_name: string,
  event_data: object,
  options?: SendCustomEventOptions
): void {
  if (pendingCustomEvents.length >= PENDING_CUSTOM_EVENT_QUEUE_CAP) {
    const dropped = pendingCustomEvents.shift();
    sdkLog.warn(
      `[SDK] Pending event queue full; dropped oldest: ${dropped?.event_name}`
    );
  }

  pendingCustomEvents.push({ event_name, event_data, options });
  sdkLog.log(
    `[SDK] Queued ${event_name} for later send (pending=${pendingCustomEvents.length})`
  );
}

/** Drain events queued while user_id/link was unavailable. Safe to call repeatedly. */
export async function flushPendingCustomEvents(): Promise<void> {
  if (flushingPendingCustomEvents) return;
  if (pendingCustomEvents.length === 0) return;

  flushingPendingCustomEvents = true;
  sdkLog.log(
    `[SDK] Flushing ${pendingCustomEvents.length} pending custom event(s)`
  );

  try {
    const batch = pendingCustomEvents.splice(0, pendingCustomEvents.length);
    for (const item of batch) {
      await sendCustomEvent(item.event_name, item.event_data, item.options);
    }
  } finally {
    flushingPendingCustomEvents = false;
  }
}

/** Test helper — not part of the public SDK surface. */
export function __resetPendingCustomEventsForTests(): void {
  pendingCustomEvents.length = 0;
  flushingPendingCustomEvents = false;
}

/** Test helper — not part of the public SDK surface. */
export function __getPendingCustomEventCountForTests(): number {
  return pendingCustomEvents.length;
}

function htmlToPlainText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveTemplateValue(
  context: Record<string, any>,
  path: string
): string {
  const keys = path
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);
  let current: any = context;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return '';
    current = current[key];
  }
  if (current == null) return '';
  return String(current);
}

function interpolateTemplateString(
  value: unknown,
  context: Record<string, any>
): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, rawKey) => {
    const key = String(rawKey || '').trim();
    if (!key) return '';
    const directValue = resolveTemplateValue(context, key);
    if (directValue) return directValue;
    if (key.startsWith('data.')) {
      return resolveTemplateValue(context, key.slice(5));
    }
    return '';
  });
}

// 📌 Sends a custom event, then triggers the poll fetchi
export async function sendCustomEvent(
  event_name: string,
  event_data: object,
  options?: SendCustomEventOptions
): Promise<boolean> {
  const user_id = await waitForEffectiveUserId();
  if (!user_id) {
    sdkLog.warn(
      `[SDK] Skipping ${event_name} event: server user_id unavailable (wait for /device/register).`
    );
    enqueuePendingCustomEvent(event_name, event_data, options);
    return false;
  }

  const event_type = options?.eventType ?? 'INTERACTIVE';
  if (
    event_type === 'INTERACTIVE' &&
    (await shouldBlockInteractiveBeforeLink())
  ) {
    sdkLog.warn(
      `[SDK] Skipping ${event_name} event: fired before /device/link — call OnUserLogin first`
    );
    enqueuePendingCustomEvent(event_name, event_data, options);
    return false;
  }
  const device_id = await getDeviceId();
  sdkLog.log('device id:', device_id);

  const channel_id = await AsyncStorage.getItem('mehery_channel_id');
  sdkLog.log('channel id at custom:', channel_id);

  const geoIP = await waitForGeoIp();
  const session_id = (await AsyncStorage.getItem('sessionId')) ?? '';

  const payload = {
    user_id,
    channel_id,
    event_name,
    event_data,
    session_id,
    event_type,
    geoIP,
  };

  sdkLog.log(`📡 Sending ${event_name} event:`, payload);
  const commonHeaders = await buildCommonHeaders();
  const apiBaseUrl = await getApiBaseUrl();
  try {
    const res = await fetch(`${apiBaseUrl}/v1/event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': device_id ?? '',
        ...commonHeaders,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
    const data = await res.json();
    sdkLog.log(`✅ ${event_name} event logged successfully:`, data);

    if (event_type !== 'LOG') {
      schedulePollCheck(`after-event:${event_name}`);
    }

    if (!flushingPendingCustomEvents && pendingCustomEvents.length > 0) {
      void flushPendingCustomEvents();
    }
    return true;
  } catch (err) {
    sdkLog.error(`❌ Failed to log ${event_name} event:`, err);
    return false;
  }
}

// 📌 Fetches poll HTML and shows in overlay

const POLL_DEBOUNCE_MS = 400;
const WS_POLL_SIGNAL_DELAY_MS = 1000;
const POLL_ADVANCE_DELAY_MS = 400;

type QueuedOverlayPoll = {
  htmlContent: string;
  code: string;
  style: Record<string, any>;
  filterId: string;
  messageId: string;
  journiId: string;
};

let pollQueue: QueuedOverlayPoll[] = [];
let showingPoll = false;
let pollFetchInFlight = false;
let pollFetchScheduled = false;
let pollDebounceTimer: ReturnType<typeof setTimeout> | null = null;

async function runPollFetchLoop(): Promise<void> {
  if (pollFetchInFlight) {
    pollFetchScheduled = true;
    return;
  }

  pollFetchInFlight = true;
  try {
    do {
      pollFetchScheduled = false;
      await sendPollEvent();
    } while (pollFetchScheduled);
  } finally {
    pollFetchInFlight = false;
  }
}

export function schedulePollCheck(
  reason?: string,
  delayMs = POLL_DEBOUNCE_MS
): void {
  if (reason) {
    sdkLog.log(`[SDK] schedulePollCheck: ${reason}`);
  }
  if (pollDebounceTimer) clearTimeout(pollDebounceTimer);
  pollDebounceTimer = setTimeout(() => {
    pollDebounceTimer = null;
    void runPollFetchLoop();
  }, delayMs);
}

export function handleWebSocketPollSignal(): void {
  if (shouldIgnoreWebSocketPoll()) {
    sdkLog.log(
      '[SDK] WebSocket POLL ignored — unchanged in-app already on screen'
    );
    return;
  }
  sdkLog.log(
    `[SDK] WebSocket POLL signal — checking queue in ${WS_POLL_SIGNAL_DELAY_MS}ms`
  );
  setTimeout(() => {
    if (pollQueue.length > 0 && !showingPoll) {
      sdkLog.log('[SDK] Showing queued poll from WebSocket signal');
      showNextPoll();
    }
    schedulePollCheck('websocket-poll');
  }, WS_POLL_SIGNAL_DELAY_MS);
}

export function onPollDismissed(): void {
  sdkLog.log(
    `[SDK] onPollDismissed — queue: ${pollQueue.length}, showing: ${showingPoll}`
  );
  showingPoll = false;
  if (pollQueue.length > 0) {
    setTimeout(() => showNextPoll(), POLL_ADVANCE_DELAY_MS);
  } else {
    schedulePollCheck('after-dismiss');
  }
}

function isOverlayPollCode(code: string): boolean {
  return (
    code.includes('roadblock') ||
    code.includes('floater') ||
    code.includes('banner') ||
    code.includes('picture-in-picture') ||
    code.includes('bottomsheet')
  );
}

function renderQueuedPoll(poll: QueuedOverlayPoll): boolean {
  const { htmlContent, code, style, filterId, messageId, journiId } = poll;
  const backgroundColor = resolvePollBackgroundColor(style?.bg_color);
  const notificationUrl =
    typeof style?.notification_url === 'string'
      ? style.notification_url.trim()
      : '';
  const commonProps = {
    html: htmlContent,
    visible: true,
    pollType: code,
    filterId,
    messageId,
    journiId,
    backgroundColor,
    notificationUrl,
  };

  if (code.includes('roadblock')) {
    showPollOverlay(
      <RoadblockPoll
        html={htmlContent}
        pollType={code}
        style={style}
        filterId={filterId}
        messageId={messageId}
        journiId={journiId}
        backgroundColor={backgroundColor}
        notificationUrl={notificationUrl}
      />
    );
    return true;
  }

  if (code.includes('floater')) {
    const verticalAlign = String(style?.vertical_align ?? 'flex-end');
    const horizontalAlign = String(style?.horizontal_align ?? 'center');
    const floaterPosition =
      verticalAlign === 'flex-start'
        ? 'top'
        : verticalAlign === 'center'
          ? 'center'
          : 'bottom';
    const floaterHorizontalAlign =
      horizontalAlign === 'flex-start'
        ? 'left'
        : horizontalAlign === 'flex-end'
          ? 'right'
          : 'center';
    showPollOverlay(
      <Floater
        {...commonProps}
        position={floaterPosition}
        horizontalAlign={floaterHorizontalAlign}
      />
    );
    return true;
  }

  if (code.includes('banner')) {
    showPollOverlay(<BannerPoll {...commonProps} />);
    return true;
  }

  if (code.includes('picture-in-picture')) {
    const alignment = getAlignment(style);
    showPollOverlay(
      <PipPoll {...commonProps} alignment={alignment} fullscreen={false} />
    );
    return true;
  }

  if (code.includes('bottomsheet')) {
    showPollOverlay(
      <BottomSheetPoll
        {...commonProps}
        onClose={() => sdkLog.log('BottomSheet closed')}
      />
    );
    return true;
  }

  return false;
}
// export async function sendPollEvent() {
//   const user_id = await AsyncStorage.getItem('user_id');
//   const device_id = await AsyncStorage.getItem('device_id');
//   if (!user_id || !device_id) return;

//   console.log('showing poll:', showingPoll);
//   const payload = { contact_id: `${user_id}_${device_id}` };

//   try {
//     const res = await fetch(
//       'https://demo.pushapp.co.in/pushapp/api/v1/notification/in-app/poll',
//       {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify(payload),
//       }
//     );

//     const data = await res.json();
//     console.log('poll data:', data);

//     if (data.results?.length > 0) {
//       data.results.forEach((poll: any) => {
//         const htmlContent = poll?.template?.style?.html;
//         const code = poll?.template?.style?.code ?? '';
//         const style = poll?.template?.style ?? {};
//         const event = poll?.event ?? {};

//         const filter_id = poll?.filterId ?? '';
//         const messag_id = poll?.messageId ?? '';

//         console.log('poll.filterId from poll api:', poll.filterId);
//         console.log('poll.contactId from poll api:', poll.contactId);

//         console.log('poll.messageId from poll api:', poll.messageId);
//         sendAck(poll.contactId, poll.messageId);
//         // 🔹 Handle inline poll case
//         if (code.includes('inline') && event?.event_data?.compare) {
//           const placeholderId = event.event_data.compare;

//           // Dispatch/render inline poll → you’ll use WebView or a component
//           renderInlinePoll(placeholderId, htmlContent, style);
//         } else if (event?.event_data?.compare && code.includes('tooltip')) {
//           console.log('style:', style);

//           const tooltipData = {
//             compare: event.event_data.compare,
//             html: style?.html,
//             width: style?.width || 70,
//             align: style?.align || 'center',
//             bgColor: style?.bg_color || '',
//             line1: style?.line_1 || '',
//             line2: style?.line_2 || '',
//             line1Icon: style?.line1_icon || '',
//             line1IconPosition: style?.line1_icon_position || 'prepend',
//             line1Color: style?.line1_font_color || '#000000',
//             line2Color: style?.line2_font_color || '#000000',
//             line1FontSize: style?.line1_font_size || 12,
//             line2FontSize: style?.line2_font_size || 10,
//             line1TextStyles: style?.line1_text_styles || [],
//             line2TextStyles: style?.line2_text_styles || [],
//             line1FontTextStyles: style?.line1_font_text_styles || [],
//             line2FontTextStyles: style?.line2_font_text_styles || [],
//           };

//           console.log('✅ Final tooltipData:', tooltipData);

//           // ✅ Now dispatch to the TooltipPoll container
//           // setTimeout(() => {
//           //   renderTooltipPoll(event.event_data.compare, {
//           //     ...tooltipData,
//           //     tooltipKey: event.eventId || Date.now(), // unique key
//           //   });
//           // }, 2000); // 10,000 ms = 10 seconds

//           // console.log('setting widget send');

//           renderTooltipPoll(event.event_data.compare, {
//             ...tooltipData,
//             tooltipKey: event.eventId || Date.now(), // unique key
//           });

//           console.log('🎯 Tooltip candidate:', {
//             code,
//             compare: event?.event_data?.compare,
//             tooltipData,
//           });
//         } else if (code.includes('roadblock')) {
//           // Only roadblocks go into the queue
//           pollQueue.push({ htmlContent, code, style });
//         } else if (code.includes('floater')) {
//           const overlayProps = {
//             html: htmlContent,
//             visible: true,
//             pollType: code,
//           };
//           showPollOverlay(<Floater {...overlayProps} />);
//         } else {
//           // All others show immediately
//           const overlayProps = {
//             html: htmlContent,
//             visible: true,
//             pollType: code,
//           };
//           if (code.includes('banner')) {
//             console.log('🎯 Showing Banner Poll');
//             showPollOverlay(<BannerPoll {...overlayProps} />);
//           } else if (code.includes('picture-in-picture')) {
//             const alignment = getAlignment(style);
//             console.log('🎯 Showing Pip Poll');
//             showPollOverlay(
//               <PipPoll
//                 {...overlayProps}
//                 alignment={alignment}
//                 fullscreen={false}
//               />
//             );
//           } else if (code.includes('bottomsheet')) {
//             console.log('🎯 Showing BottomSheet Poll');
//             showPollOverlay(
//               <BottomSheetPoll
//                 {...overlayProps}
//                 onClose={() => console.log('BottomSheet closed')}
//               />
//             );
//           }
//         }
//       });

//       showNextPoll();
//     }
//   } catch (err) {
//     console.error('❌ API error:', err);
//   }
// }

export async function sendPollEvent() {
  const device_id = await AsyncStorage.getItem('device_id');
  if (!device_id) return;

  const contact_id = await getEffectiveContactId(device_id);
  if (!contact_id) {
    sdkLog.warn(
      '[SDK] Skipping poll fetch: contact_id unavailable (registration may not be complete).'
    );
    return;
  }

  sdkLog.log('showing poll:', showingPoll);
  const payload = { contact_id };
  const commonHeaders = await buildCommonHeaders();
  const apiBaseUrl = await getApiBaseUrl();

  try {
    const res = await fetch(`${apiBaseUrl}/v1/notification/in-app/poll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...commonHeaders,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    sdkLog.log('poll data:', data);

    if (data.results?.length > 0) {
      let embeddedCount = 0;
      let freshCount = 0;
      data.results.forEach((poll: any) => {
        const htmlContent = poll?.template?.style?.html;
        const code = poll?.template?.style?.code ?? '';
        const style = poll?.template?.style ?? {};
        const event = poll?.event ?? {};
        const templateModelData = poll?.template?.model?.data ?? {};
        const filter_id = poll?.filterId ?? '';
        const message_id = poll?.messageId ?? '';
        const journi_id = poll?.journiId ?? '';

        sdkLog.log('poll.filterId:', filter_id);
        sdkLog.log('poll.messageId:', message_id);
        sdkLog.log('poll.journiId:', journi_id);

        void sendAck(poll.contactId, message_id);

        // Prefer journey event compare; fall back to template style.placeholder_id.
        // Empty `compare: []` is truthy in JS — normalize so fallback works.
        const placeholderId = resolvePollPlaceholderId(
          event?.event_data?.compare,
          style?.placeholder_id
        );

        if (code.includes('inline') && placeholderId) {
          embeddedCount += 1;
          if (
            renderInlinePoll(placeholderId, htmlContent, style, {
              filterId: filter_id,
              messageId: message_id,
              journiId: journi_id,
            })
          ) {
            freshCount += 1;
          }
        } else if (code.includes('tooltip')) {
          embeddedCount += 1;
          // Empty placeholder still renders: TooltipPollManager fans out to
          // registered containers (campaigns often send compare: []).
          const interpolationContext = {
            ...templateModelData,
            ...(event?.event_data ?? {}),
            ...(poll?.event_data ?? {}),
          };
          const rawTooltipTitle =
            htmlToPlainText(style?.richline_1) || style?.line_1 || '';
          const tooltipTitle = interpolateTemplateString(
            rawTooltipTitle,
            interpolationContext
          );
          const tooltipBody = interpolateTemplateString(
            style?.line_2 || '',
            interpolationContext
          );
          const tooltipData = {
            compare: placeholderId,
            html: style?.html,
            width: style?.width || 70,
            align: style?.align || 'center',
            bgColor: resolvePollBackgroundColor(style?.bg_color),
            line1: tooltipTitle,
            line2: tooltipBody,
            line1Icon: style?.line1_icon || '',
            line1IconPosition: style?.line1_icon_position || 'prepend',
            line1Color: style?.line1_font_color || '#000000',
            line2Color: style?.line2_font_color || '#000000',
            line1FontSize: style?.line1_font_size || 12,
            line2FontSize: style?.line2_font_size || 10,
            line1TextStyles: style?.line1_text_styles || [],
            line2TextStyles: style?.line2_text_styles || [],
            line1FontTextStyles: style?.line1_font_text_styles || [],
            line2FontTextStyles: style?.line2_font_text_styles || [],
            filterId: filter_id,
            messageId: message_id,
            journiId: journi_id,
            notificationUrl:
              typeof style?.notification_url === 'string'
                ? style.notification_url.trim()
                : '',
          };

          if (!placeholderId) {
            sdkLog.warn(
              '[SDK] tooltip poll missing placeholder_id/compare; broadcasting to registered containers'
            );
          }

          if (
            renderTooltipPoll(placeholderId, {
              ...tooltipData,
              // Prefer stable ids so remounts don't look like a new campaign.
              tooltipKey: event?.eventId || message_id || Date.now(),
            })
          ) {
            freshCount += 1;
          }
        } else if (isOverlayPollCode(code)) {
          freshCount += 1;
          pollQueue.push({
            htmlContent,
            code,
            style,
            filterId: filter_id,
            messageId: message_id,
            journiId: journi_id,
          });
        }
      });

      if (embeddedCount > 0 && freshCount === 0) {
        noteUnchangedInAppPoll();
      }

      if (!showingPoll) {
        showNextPoll();
      }
    }
  } catch (err) {
    sdkLog.warn('❌ API error:', err);
  }
}

export async function sendAck(contactId: string, messageId: string) {
  if (!contactId || !messageId) {
    sdkLog.warn('⚠️ Missing contactId or messageId for ACK');
    return;
  }

  if (!claimInAppAck(messageId)) {
    sdkLog.log(`⏭️ Skip duplicate ack for ${messageId}`);
    return;
  }

  const payload = {
    messageId,
    contact_id: contactId,
  };

  const commonHeaders = await buildCommonHeaders();
  const apiBaseUrl = await getApiBaseUrl();

  try {
    const res = await fetch(`${apiBaseUrl}/v1/notification/in-app/ack`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...commonHeaders,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    sdkLog.log('✅ Acknowledgement response:', data);
  } catch (error) {
    releaseInAppAck(messageId);
    sdkLog.warn('❌ ACK API error:', error);
  }
}
function showNextPoll(): void {
  if (showingPoll) {
    sdkLog.log('[SDK] showNextPoll skipped — poll already showing');
    return;
  }

  if (pollQueue.length === 0) {
    return;
  }

  const nextPoll = pollQueue.shift();
  if (!nextPoll) return;

  sdkLog.log(
    `[SDK] showNextPoll — type: ${nextPoll.code}, remaining: ${pollQueue.length}`
  );

  const rendered = renderQueuedPoll(nextPoll);
  if (rendered) {
    showingPoll = true;
  } else {
    showNextPoll();
  }
}

export function triggerNextPoll() {
  onPollDismissed();
}
function getAlignment(style: any) {
  const vertical = (style.vertical_align ?? 'flex-end').toString();
  const horizontal = (style.horizontal_align ?? 'flex-end').toString();

  let verticalPart = 'bottom';
  if (vertical === 'flex-start') verticalPart = 'top';
  if (vertical === 'center') verticalPart = 'center';

  let horizontalPart = 'right';
  if (horizontal === 'flex-start') horizontalPart = 'left';
  if (horizontal === 'center') horizontalPart = 'center';

  return `${verticalPart}-${horizontalPart}`;
}
/** Fires page_open (+ widget_open) after 2s. Returns a cancel fn for unmount cleanup. */
export function OnPageOpen(page_name: string): () => void {
  const timer = setTimeout(() => {
    try {
      // LOG: analytics-only — INTERACTIVE schedules poll checks and can show
      // roadblocks that steal focus from screens like Search Suggestions.
      sendCustomEvent('page_open', { page: page_name }, { eventType: 'LOG' });
      sendCustomEvent(
        'widget_open',
        { compare: 'center' },
        { eventType: 'LOG' }
      );
      sendCustomEvent(
        'widget_open',
        { compare: 'login_banner' },
        { eventType: 'LOG' }
      );
    } catch (error) {
      sdkLog.log(`Error sending events for page: ${page_name}`, error);
    }
  }, 2000); // 2000ms = 2 seconds

  return () => clearTimeout(timer);
}

export function OnPageClose(page_name = 'login') {
  return sendCustomEvent(
    'page_closed',
    { page: page_name },
    { eventType: 'LOG' }
  );
}

export function OnAppOpen() {
  sdkLog.log('⏳ Waiting 3 seconds before triggering app_open...');

  setTimeout(() => {
    void (async () => {
      try {
        sdkLog.log('🚀 Triggering app_open event');
        await sendCustomEvent(
          SDK_EVENT_NAMES.APP_OPEN,
          {},
          { eventType: 'LOG' }
        );
        schedulePollCheck('app-open');
      } catch (error) {
        sdkLog.error('❌ Error during OnAppOpen:', error);
      }
    })();
  }, 1000); // 1000ms = 1 seconds delay
}

export function OnAppClose() {
  sendCustomEvent(SDK_EVENT_NAMES.APP_CLOSE, {}, { eventType: 'LOG' });
}

/**
 * 📌 Sends a custom event from anywhere in the front-end
 * @param eventName - The name of the event
 * @param eventData - Any object data you want to send with the event
 */
