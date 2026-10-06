/** Ignore redundant WebSocket POLL signals after an unchanged inline/tooltip fetch. */
export const UNCHANGED_POLL_COOLDOWN_MS = 5000;

const ackedMessageIds = new Set<string>();
let ignoreWebSocketPollUntil = 0;

/** First ack for this message id wins. Later polls must not ack again. */
export function claimInAppAck(messageId: string): boolean {
  if (!messageId || ackedMessageIds.has(messageId)) {
    return false;
  }
  ackedMessageIds.add(messageId);
  return true;
}

export function releaseInAppAck(messageId: string): void {
  ackedMessageIds.delete(messageId);
}

export function noteUnchangedInAppPoll(now = Date.now()): void {
  ignoreWebSocketPollUntil = now + UNCHANGED_POLL_COOLDOWN_MS;
}

export function shouldIgnoreWebSocketPoll(now = Date.now()): boolean {
  return now < ignoreWebSocketPollUntil;
}

/** Test helper */
export function __resetPollFetchGuardForTests(): void {
  ackedMessageIds.clear();
  ignoreWebSocketPollUntil = 0;
}
