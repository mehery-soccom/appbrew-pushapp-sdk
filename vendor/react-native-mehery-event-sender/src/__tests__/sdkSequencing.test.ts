jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
  multiRemove: jest.fn(),
}));

jest.mock('../events/custom/CustomEvents', () => ({
  OnAppOpen: jest.fn(),
  flushPendingCustomEvents: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../helpers/buildCommonHeaders', () => ({
  buildCommonHeaders: jest.fn().mockResolvedValue({}),
}));

jest.mock('../helpers/tenantContext', () => ({
  extractChannelSegment: jest.fn((id: string) => id.split('_').pop() ?? id),
  getApiBaseUrl: jest.fn().mockResolvedValue('https://demo.pushapp.ai/pushapp/api'),
  MEHERY_PUSHAPP_HOST_ROOT_KEY: 'mehery_pushapp_host_root',
}));

jest.mock('../utils/device', () => ({
  getDeviceId: jest.fn().mockResolvedValue('device-1'),
  resetCachedDeviceId: jest.fn(),
}));

jest.mock('../utils/ensureDeviceRegistered', () => ({
  ensureDeviceRegistered: jest.fn(),
  settleAfterRegister: jest.fn(),
}));

jest.mock('../utils/geoIpContext', () => ({
  waitForGeoIp: jest.fn().mockResolvedValue({ ip: '' }),
}));

jest.mock('../utils/profileSnapshot', () => ({
  clearStoredProfileSnapshot: jest.fn(),
}));

jest.mock('../utils/sdkReadiness', () => ({
  waitForSdkReady: jest.fn(),
}));

jest.mock('../socket/WebSock', () => ({
  reauthenticateWebSocket: jest.fn().mockResolvedValue(undefined),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { flushPendingCustomEvents } from '../events/custom/CustomEvents';
import { ensureDeviceRegistered } from '../utils/ensureDeviceRegistered';
import { waitForSdkReady } from '../utils/sdkReadiness';
import {
  getEffectiveLinkChannelId,
  OnUserLogin,
  persistRegisteredChannelId,
  REGISTERED_CHANNEL_ID_KEY,
  shouldBlockInteractiveBeforeLink,
} from '../utils/user';

describe('registered channel id for /device/link', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getEffectiveLinkChannelId prefers mehery_registered_channel_id', async () => {
    (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
      [REGISTERED_CHANNEL_ID_KEY, '1780031354415'],
      ['mehery_channel_id', 'demo_1780031354415'],
    ]);

    await expect(getEffectiveLinkChannelId()).resolves.toBe('1780031354415');
  });

  it('getEffectiveLinkChannelId falls back to mehery_channel_id', async () => {
    (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
      [REGISTERED_CHANNEL_ID_KEY, ''],
      ['mehery_channel_id', 'demo_1780031354415'],
    ]);

    await expect(getEffectiveLinkChannelId()).resolves.toBe('demo_1780031354415');
  });

  it('persistRegisteredChannelId stores trimmed channel id', async () => {
    await persistRegisteredChannelId(' 1780031354415 ');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      REGISTERED_CHANNEL_ID_KEY,
      '1780031354415'
    );
  });
});

describe('interactive event pre-link guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks when login user_id is set but UserLoggedIn is false', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === 'user_id') return Promise.resolve('welop2');
      if (key === 'UserLoggedIn') return Promise.resolve('false');
      return Promise.resolve(null);
    });

    await expect(shouldBlockInteractiveBeforeLink()).resolves.toBe(true);
  });

  it('allows when UserLoggedIn is true', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === 'user_id') return Promise.resolve('welop2');
      if (key === 'UserLoggedIn') return Promise.resolve('true');
      return Promise.resolve(null);
    });

    await expect(shouldBlockInteractiveBeforeLink()).resolves.toBe(false);
  });

  it('allows guest lifecycle events when no login user_id is stored', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === 'user_id') return Promise.resolve('');
      if (key === 'UserLoggedIn') return Promise.resolve('false');
      return Promise.resolve(null);
    });

    await expect(shouldBlockInteractiveBeforeLink()).resolves.toBe(false);
  });
});

describe('OnUserLogin pending-event flush / rollback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === 'UserLoggedIn') return Promise.resolve('false');
      if (key === 'user_id') return Promise.resolve('welop2');
      if (key === 'device_id') return Promise.resolve('device-1');
      if (key === 'mehery_channel_id') return Promise.resolve('demo_ch');
      if (key === 'mehery_pushapp_host_root') return Promise.resolve('https://demo');
      return Promise.resolve(null);
    });
  });

  it('clears stuck user_id and flushes queue when login fails before link', async () => {
    (waitForSdkReady as jest.Mock).mockResolvedValue(false);

    const result = await OnUserLogin('welop2');

    expect(result.success).toBe(false);
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('user_id');
    expect(flushPendingCustomEvents).toHaveBeenCalled();
  });

  it('flushes queue when already logged in (no-op link)', async () => {
    (waitForSdkReady as jest.Mock).mockResolvedValue(true);
    (ensureDeviceRegistered as jest.Mock).mockResolvedValue(true);
    (AsyncStorage.multiGet as jest.Mock).mockImplementation(async (keys: string[]) => {
      const map: Record<string, string> = {
        [REGISTERED_CHANNEL_ID_KEY]: 'demo_ch',
        mehery_channel_id: 'demo_ch',
        contact_id: 'welop2_device-1',
        UserLoggedIn: 'true',
        sessionId: 'sess-1',
        mehery_last_linked_channel_id: 'demo_ch',
        mehery_last_linked_host_root: 'https://demo',
      };
      return keys.map((k) => [k, map[k] ?? '']);
    });
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === 'device_id') return Promise.resolve('device-1');
      if (key === 'user_id') return Promise.resolve('welop2');
      if (key === 'mehery_channel_id') return Promise.resolve('demo_ch');
      if (key === 'mehery_pushapp_host_root') return Promise.resolve('https://demo');
      return Promise.resolve(null);
    });

    const result = await OnUserLogin('welop2');

    expect(result.success).toBe(true);
    expect(flushPendingCustomEvents).toHaveBeenCalled();
    expect(AsyncStorage.removeItem).not.toHaveBeenCalledWith('user_id');
  });
});
