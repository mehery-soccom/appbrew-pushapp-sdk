import tooltipEmitter from './TooltipEmitter';
import { sdkLog } from '../helpers/sdkLogger';

/** In-memory store so tooltips that arrive before a container mounts still show. */
const tooltipPollRegistry: Record<string, any> = {};

export function getCachedTooltipPoll(placeholderId: string) {
  return tooltipPollRegistry[placeholderId] ?? null;
}

export function renderTooltipPoll(placeholderId: string, tooltipData: any) {
  sdkLog.log('🎯 renderTooltipPoll called with:', placeholderId, tooltipData);
  if (tooltipData) {
    tooltipPollRegistry[placeholderId] = tooltipData;
  } else {
    delete tooltipPollRegistry[placeholderId];
  }
  tooltipEmitter.emit('showTooltip', { placeholderId, tooltipData });
}
