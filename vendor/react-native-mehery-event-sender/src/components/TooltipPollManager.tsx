import tooltipEmitter from './TooltipEmitter';
import { sdkLog } from '../helpers/sdkLogger';
import { normalizePlaceholderId } from '../helpers/resolvePollPlaceholderId';

/** In-memory store so tooltips that arrive before a container mounts still show. */
const tooltipPollRegistry: Record<string, any> = {};

/** Mounted TooltipPollContainer ids — used when poll has no placeholder. */
const registeredTooltipPlaceholders = new Set<string>();

function isSameTooltipContent(a: any, b: any): boolean {
  if (!a || !b) {
    return false;
  }
  // Ignore tooltipKey and message ids (both change on every poll).
  // Same visible campaign must not re-emit.
  return (
    a.line1 === b.line1 &&
    a.line2 === b.line2 &&
    a.html === b.html &&
    a.notificationUrl === b.notificationUrl
  );
}

export function registerTooltipPlaceholder(placeholderId: string) {
  const id = normalizePlaceholderId(placeholderId);
  if (id) {
    registeredTooltipPlaceholders.add(id);
  }
}

export function unregisterTooltipPlaceholder(placeholderId: string) {
  const id = normalizePlaceholderId(placeholderId);
  if (id) {
    registeredTooltipPlaceholders.delete(id);
  }
}

export function getCachedTooltipPoll(placeholderId: string) {
  // Empty string is a valid orphan-cache key (poll arrived before any container).
  if (placeholderId === '') {
    return tooltipPollRegistry[''] ?? null;
  }
  const id = normalizePlaceholderId(placeholderId);
  if (!id) {
    return null;
  }
  return tooltipPollRegistry[id] ?? null;
}

function applyTooltipPoll(placeholderId: string, tooltipData: any): boolean {
  if (tooltipData) {
    const existing = tooltipPollRegistry[placeholderId];
    if (isSameTooltipContent(existing, tooltipData)) {
      sdkLog.log(`⏭️ Skip duplicate tooltip for ${placeholderId}`);
      return false;
    }
    tooltipPollRegistry[placeholderId] = tooltipData;
  } else if (!tooltipPollRegistry[placeholderId]) {
    return false;
  } else {
    delete tooltipPollRegistry[placeholderId];
  }
  tooltipEmitter.emit('showTooltip', { placeholderId, tooltipData });
  return true;
}

/**
 * Deliver a tooltip to matching containers.
 * Empty / `[]` placeholder ids fan out to every registered container so
 * campaigns that omit compare + placeholder_id still render on Account.
 */
export function renderTooltipPoll(
  placeholderId: unknown,
  tooltipData: any
): boolean {
  const id = normalizePlaceholderId(placeholderId);
  sdkLog.log('🎯 renderTooltipPoll called with:', placeholderId, tooltipData);

  const targets =
    id.length > 0 ? [id] : Array.from(registeredTooltipPlaceholders);

  if (targets.length === 0) {
    // Keep a cache under "" so a later-mounted container can still pick it up.
    const changed = applyTooltipPoll('', tooltipData);
    sdkLog.warn(
      '[SDK] renderTooltipPoll: no placeholder id and no registered containers; cached as orphan'
    );
    return changed;
  }

  sdkLog.log('[SDK] renderTooltipPoll delivering to:', targets);
  let changed = false;
  for (const target of targets) {
    if (applyTooltipPoll(target, tooltipData)) {
      changed = true;
    }
  }
  return changed;
}

/** Test helper */
export function __resetTooltipPollRegistryForTests() {
  for (const key of Object.keys(tooltipPollRegistry)) {
    delete tooltipPollRegistry[key];
  }
  registeredTooltipPlaceholders.clear();
}
