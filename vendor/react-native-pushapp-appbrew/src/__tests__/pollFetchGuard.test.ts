import {
  __resetPollFetchGuardForTests,
  claimInAppAck,
  noteUnchangedInAppPoll,
  releaseInAppAck,
  shouldIgnoreWebSocketPoll,
  UNCHANGED_POLL_COOLDOWN_MS,
} from '../events/custom/pollFetchGuard';

describe('poll fetch guard', () => {
  beforeEach(() => {
    __resetPollFetchGuardForTests();
  });

  it('acks each message id once', () => {
    expect(claimInAppAck('msg-1')).toBe(true);
    expect(claimInAppAck('msg-1')).toBe(false);
    expect(claimInAppAck('msg-2')).toBe(true);
  });

  it('allows a retry after a failed ack', () => {
    expect(claimInAppAck('msg-1')).toBe(true);
    releaseInAppAck('msg-1');
    expect(claimInAppAck('msg-1')).toBe(true);
  });

  it('ignores websocket polls during the unchanged-inline cooldown', () => {
    const now = 1_000_000;
    expect(shouldIgnoreWebSocketPoll(now)).toBe(false);

    noteUnchangedInAppPoll(now);

    expect(shouldIgnoreWebSocketPoll(now + 1000)).toBe(true);
    expect(
      shouldIgnoreWebSocketPoll(now + UNCHANGED_POLL_COOLDOWN_MS)
    ).toBe(false);
  });
});
