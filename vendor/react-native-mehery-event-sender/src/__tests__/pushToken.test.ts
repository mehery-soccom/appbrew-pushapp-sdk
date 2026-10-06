import { isFcmLikePushToken, pickApnsToken, buildDevApnsToken } from '../utils/pushToken';

describe('pushToken helpers', () => {
  it('detects FCM registration tokens', () => {
    expect(isFcmLikePushToken('APA91b:abc')).toBe(true);
    expect(isFcmLikePushToken('cde123f4567890abcdef1234567890ab')).toBe(false);
    expect(isFcmLikePushToken('')).toBe(false);
  });

  it('picks the first APNs-like token and skips FCM', () => {
    expect(
      pickApnsToken(
        'APA91b:fcm',
        'aabbccddeeff00112233445566778899',
        'other'
      )
    ).toBe('aabbccddeeff00112233445566778899');
  });

  it('returns empty when only FCM tokens are present', () => {
    expect(pickApnsToken('APA91b:fcm', '')).toBe('');
  });

  it('builds a stable hex APNs stand-in for simulator register', () => {
    const a = buildDevApnsToken('-mehery-abc__123');
    const b = buildDevApnsToken('-mehery-abc__123');
    expect(a).toHaveLength(64);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
    expect(a.includes(':')).toBe(false);
    expect(buildDevApnsToken('other')).not.toBe(a);
  });
});
