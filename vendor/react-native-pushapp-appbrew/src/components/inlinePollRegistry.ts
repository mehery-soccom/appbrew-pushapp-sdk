import { sdkLog } from '../helpers/sdkLogger';
import inlinePollEmitter from './InlinePollEmitter';

export type InlinePollRecord = {
  htmlContent: string;
  style?: any;
  updatedAt: number;
  messageId?: string;
  filterId?: string;
  journiId?: string;
};

const inlinePollRegistry: Record<string, InlinePollRecord> = {};

export function getInlinePoll(placeholderId: string): InlinePollRecord | null {
  return inlinePollRegistry[placeholderId] ?? null;
}

/**
 * Save inline HTML for a placeholder.
 * Returns true when the WebView should update. Same HTML is a no-op even if
 * messageId/filterId change, so a repeat poll does not remount the WebView.
 */
export function renderInlinePoll(
  placeholderId: string,
  htmlContent: string | null,
  style?: any,
  {
    messageId,
    filterId,
    journiId,
  }: { messageId?: string; filterId?: string; journiId?: string } = {}
): boolean {
  if (!htmlContent) {
    if (!inlinePollRegistry[placeholderId]) {
      return false;
    }
    delete inlinePollRegistry[placeholderId];
    sdkLog.log(`🧹 Cleared inline poll for ${placeholderId}`);
    inlinePollEmitter.emit('inlinePollUpdated', { placeholderId, poll: null });
    return true;
  }

  const existing = inlinePollRegistry[placeholderId];
  if (existing?.htmlContent === htmlContent) {
    // Keep latest ids for a later mount without bumping updatedAt or re-emitting.
    existing.messageId = messageId;
    existing.filterId = filterId;
    existing.journiId = journiId;
    existing.style = style;
    sdkLog.log(`⏭️ Skip duplicate inline poll for ${placeholderId}`);
    return false;
  }

  const pollData: InlinePollRecord = {
    htmlContent,
    style,
    messageId,
    filterId,
    journiId,
    updatedAt: Date.now(),
  };

  inlinePollRegistry[placeholderId] = pollData;
  sdkLog.log(
    `💾 Saved inline poll in memory for ${placeholderId} @ ${pollData.updatedAt}`
  );
  inlinePollEmitter.emit('inlinePollUpdated', {
    placeholderId,
    poll: pollData,
  });
  return true;
}

/** Test helper */
export function __resetInlinePollRegistryForTests(): void {
  for (const key of Object.keys(inlinePollRegistry)) {
    delete inlinePollRegistry[key];
  }
}

/** Test helper */
export function __getInlinePollForTests(
  placeholderId: string
): InlinePollRecord | null {
  return getInlinePoll(placeholderId);
}
