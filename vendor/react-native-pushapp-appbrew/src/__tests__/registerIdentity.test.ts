import {
  extractContactIdFromRegisterResponse,
  extractSessionIdFromRegisterResponse,
  extractUserIdFromRegisterResponse,
  guestUserIdFromRegisterResponse,
  isAcceptableEventUserId,
  tryParseRegisterResponse,
} from '../utils/registerResponse';

const sampleRegisterResponse = {
  success: true,
  device: {
    device_id: '-mehery-13bacd12-481d-478e-943e-962d7a3476a8__1782222635394',
    contact_id:
      'guest_1_-mehery-13bacd12-481d-478e-943e-962d7a3476a8__1782222635394',
    user_id: 'guest_1',
    session_id: '6a3a8f2eeb16f028bb4ea7a1',
  },
};

describe('register identity extraction', () => {
  it('extracts guest user id from device.user_id', () => {
    expect(extractUserIdFromRegisterResponse(sampleRegisterResponse)).toBe(
      'guest_1'
    );
  });

  it('extracts contact_id from device.contact_id', () => {
    expect(extractContactIdFromRegisterResponse(sampleRegisterResponse)).toBe(
      'guest_1_-mehery-13bacd12-481d-478e-943e-962d7a3476a8__1782222635394'
    );
  });

  it('extracts session id from device.session_id', () => {
    expect(extractSessionIdFromRegisterResponse(sampleRegisterResponse)).toBe(
      '6a3a8f2eeb16f028bb4ea7a1'
    );
  });

  it('falls back to top-level session_id', () => {
    expect(
      extractSessionIdFromRegisterResponse({
        session_id: 'top-level-session',
      })
    ).toBe('top-level-session');
  });

  it('returns empty strings for invalid payloads', () => {
    expect(extractUserIdFromRegisterResponse(null)).toBe('');
    expect(extractContactIdFromRegisterResponse(undefined)).toBe('');
    expect(extractSessionIdFromRegisterResponse({})).toBe('');
  });

  it('tryParseRegisterResponse parses JSON bodies', () => {
    const parsed = tryParseRegisterResponse(
      JSON.stringify(sampleRegisterResponse)
    );
    expect(extractUserIdFromRegisterResponse(parsed)).toBe('guest_1');
  });

  it('isAcceptableEventUserId rejects hardcoded guest', () => {
    expect(isAcceptableEventUserId('guest_1')).toBe(true);
    expect(isAcceptableEventUserId('guest')).toBe(false);
    expect(isAcceptableEventUserId('')).toBe(false);
  });

  it('guestUserIdFromRegisterResponse returns empty for error-only already-exists body', () => {
    const parsed = tryParseRegisterResponse(
      JSON.stringify({ error: 'Device already exists' })
    );
    expect(guestUserIdFromRegisterResponse(parsed)).toBe('');
  });
});
