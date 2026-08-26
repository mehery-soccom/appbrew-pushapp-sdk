import React, { useEffect, useState, useCallback } from 'react';
import { View, Linking } from 'react-native';
import TooltipPoll from './TooltipPoll';
import tooltipEmitter from './TooltipEmitter';
import {
  getCachedTooltipPoll,
  renderTooltipPoll,
} from './TooltipPollManager';
import { sdkLog } from '../helpers/sdkLogger';
import { buildCommonHeaders } from '../helpers/buildCommonHeaders';
import { getApiBaseUrl } from '../helpers/tenantContext';
import { buildInAppTrackData } from '../utils/inAppTrack';
import {
  buildSyntheticCtaData,
  type CtaTrackFields,
} from '../utils/ctaTrackPayload';

export { renderTooltipPoll };

function normalizeUrl(rawUrl?: string) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const value = rawUrl.trim().replace(/^['"]|['"]$/g, '');
  if (!value) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^www\./i.test(value)) return `https://${value}`;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(value)) return `https://${value}`;
  return '';
}

export function TooltipPollContainer({
  placeholderId,
  children,
}: {
  placeholderId: string;
  children: React.ReactNode;
}) {
  const [tooltipData, setTooltipData] = useState<any>(null);

  const sendTrackEvent = useCallback(
    async (
      eventType: 'cta' | 'dismissed' | 'longPress' | 'openUrl' | 'unknown',
      value?: string | CtaTrackFields
    ) => {
      if (!tooltipData) return;

      let data: Record<string, unknown> = {};
      if (eventType === 'cta' && value) {
        data = buildInAppTrackData(
          'cta',
          typeof value === 'string'
            ? { ctaId: value, button_id: '' }
            : value
        );
      } else if (typeof value === 'string' && value) {
        data = { ctaId: value };
      }

      const payload = {
        messageId: tooltipData.messageId,
        filterId: tooltipData.filterId,
        ...(tooltipData.journiId ? { journiId: tooltipData.journiId } : {}),
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
    },
    [tooltipData]
  );

  const handleTooltipPress = useCallback(async () => {
    const url = normalizeUrl(tooltipData?.notificationUrl || '');
    if (!url) return;

    await sendTrackEvent('cta', buildSyntheticCtaData('MEDIA_CLICK'));
    await sendTrackEvent('openUrl', url);
    Linking.openURL(encodeURI(url)).catch((err) =>
      sdkLog.error('Failed to open URL:', err)
    );
  }, [tooltipData, sendTrackEvent]);

  // 🔹 Apply cached tooltip immediately, then listen for live updates
  useEffect(() => {
    const cached = getCachedTooltipPoll(placeholderId);
    if (cached) {
      sdkLog.log(`[SDK] Tooltip cache hit for ${placeholderId}, showing it`);
      setTooltipData(cached);
    }

    const handler = ({ placeholderId: id, tooltipData: data }: any) => {
      if (id !== placeholderId) return;

      if (data) {
        sdkLog.log(`[SDK] Tooltip matches ${placeholderId}, showing it`);
        setTooltipData(data);
      } else {
        sdkLog.log(`[SDK] No tooltip for ${placeholderId}, hiding tooltip`);
        setTooltipData(null);
      }
    };

    tooltipEmitter.on('showTooltip', handler);
    return () => {
      tooltipEmitter.off('showTooltip', handler);
    };
  }, [placeholderId]);

  return (
    <View pointerEvents="box-none">
      {children}
      {tooltipData && (
        <TooltipPoll
          {...tooltipData}
          onPress={
            tooltipData.notificationUrl ? handleTooltipPress : undefined
          }
        />
      )}
    </View>
  );
}
