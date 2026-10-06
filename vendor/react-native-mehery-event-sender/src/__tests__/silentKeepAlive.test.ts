import { isSilentKeepAlive } from '../utils/silentKeepAliveType';

describe('isSilentKeepAlive', () => {
  it('matches flattened FCM/iOS data type', () => {
    expect(isSilentKeepAlive({ type: 'silent_keepalive' })).toBe(true);
  });

  it('matches nested remoteMessage.data', () => {
    expect(
      isSilentKeepAlive({ data: { type: 'silent_keepalive', timestamp: '1' } })
    ).toBe(true);
  });

  it('ignores other notification types', () => {
    expect(isSilentKeepAlive({ type: 'silent_daily_ping' })).toBe(false);
    expect(isSilentKeepAlive({ type: 'daily_silent_notification' })).toBe(
      false
    );
    expect(isSilentKeepAlive({})).toBe(false);
  });
});
