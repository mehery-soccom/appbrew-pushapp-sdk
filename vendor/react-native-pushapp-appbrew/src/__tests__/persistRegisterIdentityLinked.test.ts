jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  multiSet: jest.fn(async (pairs: [string, string][]) => {
    pairs.forEach(([k, v]) => mockStore.set(k, v));
  }),
  multiGet: jest.fn(async (keys: string[]) =>
    keys.map((k) => [k, mockStore.get(k) ?? null])
  ),
}));
jest.mock('../events/custom/CustomEvents', () => ({
  OnAppOpen: jest.fn(),
  flushPendingCustomEvents: jest.fn(),
}));
jest.mock('../helpers/buildCommonHeaders', () => ({
  buildCommonHeaders: jest.fn(),
}));
jest.mock('../helpers/tenantContext', () => ({
  extractChannelSegment: jest.fn(),
  getApiBaseUrl: jest.fn(),
  MEHERY_PUSHAPP_HOST_ROOT_KEY: 'k',
}));
jest.mock('../utils/device', () => ({ getDeviceId: jest.fn() }));
jest.mock('../utils/ensureDeviceRegistered', () => ({
  ensureDeviceRegistered: jest.fn(),
  settleAfterRegister: jest.fn(),
}));
jest.mock('../utils/geoIpContext', () => ({ waitForGeoIp: jest.fn() }));
jest.mock('../utils/resolveDeviceHeaders', () => ({ attachDeviceInfo: jest.fn() }));
jest.mock('../utils/profileSnapshot', () => ({ clearStoredProfileSnapshot: jest.fn() }));
jest.mock('../utils/sdkReadiness', () => ({ waitForSdkReady: jest.fn() }));
jest.mock('../socket/WebSock', () => ({
  connectToServer: jest.fn(),
  reauthenticateWebSocket: jest.fn(),
}));

import { persistRegisterIdentity, getEffectiveContactId } from '../utils/user';
import { connectToServer } from '../socket/WebSock';

const guestRegister = {
  device: {
    user_id: 'guest_1',
    contact_id: 'guest_1_dev',
    session_id: 'guest-session',
    p_id: 'guest-p',
  },
};

describe('persistRegisterIdentity', () => {
  beforeEach(async () => {
    mockStore.clear();
    jest.clearAllMocks();
  });

  it('keeps customer contact/session/profile after /device/link', async () => {
    mockStore.set('UserLoggedIn', 'true');
    mockStore.set('contact_id', 'cust_dev');
    mockStore.set('sessionId', 'cust-session');
    mockStore.set('p_id', 'cust-p');
    await persistRegisterIdentity(guestRegister);
    expect(mockStore.get('contact_id')).toBe('cust_dev');
    expect(mockStore.get('sessionId')).toBe('cust-session');
    expect(mockStore.get('p_id')).toBe('cust-p');
  });

  it('stores guest identity before link and connects the socket', async () => {
    await persistRegisterIdentity(guestRegister);
    expect(mockStore.get('contact_id')).toBe('guest_1_dev');
    expect(connectToServer).toHaveBeenCalled();
  });
});

describe('getEffectiveContactId', () => {
  beforeEach(() => mockStore.clear());

  it('ignores a stale stored contact_id once the customer is linked', async () => {
    mockStore.set('contact_id', 'guest_old_dev1');
    mockStore.set('registered_user_id', 'guest_1');
    mockStore.set('user_id', 'cust_9');
    mockStore.set('UserLoggedIn', 'true');
    await expect(getEffectiveContactId('dev1')).resolves.toBe('cust_9_dev1');
  });

  it('uses the guest id when logged out', async () => {
    mockStore.set('contact_id', 'cust_9_dev1');
    mockStore.set('registered_user_id', 'guest_1');
    await expect(getEffectiveContactId('dev1')).resolves.toBe('guest_1_dev1');
  });

  it('falls back to the stored contact_id when no user id exists yet', async () => {
    mockStore.set('contact_id', 'stored_dev1');
    await expect(getEffectiveContactId('dev1')).resolves.toBe('stored_dev1');
  });
});
