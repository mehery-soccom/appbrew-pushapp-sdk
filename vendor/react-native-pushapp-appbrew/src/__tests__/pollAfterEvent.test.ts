jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  StyleSheet: { create: (s: object) => s },
  View: 'View',
  Text: 'Text',
  Modal: 'Modal',
  Pressable: 'Pressable',
  Dimensions: { get: () => ({ width: 375, height: 812 }) },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
  multiRemove: jest.fn(),
}));

jest.mock('../components/PollOverlay', () => ({
  showPollOverlay: jest.fn(),
}));
jest.mock('../components/BannerPoll', () => () => null);
jest.mock('../components/PipPoll', () => () => null);
jest.mock('../components/BottomSheetPoll', () => () => null);
jest.mock('../components/RoadblockPoll', () => () => null);
jest.mock('../components/RenderInlinePoll', () => ({
  renderInlinePoll: jest.fn(),
}));
jest.mock('../components/TooltipPollManager', () => ({
  renderTooltipPoll: jest.fn(),
}));
jest.mock('../components/FloaterPoll', () => () => null);

jest.mock('../helpers/buildCommonHeaders', () => ({
  buildCommonHeaders: jest.fn().mockResolvedValue({}),
}));

jest.mock('../helpers/tenantContext', () => ({
  getApiBaseUrl: jest
    .fn()
    .mockResolvedValue('https://demo.pushapp.ai/pushapp/api'),
}));

jest.mock('../helpers/sdkLogger', () => ({
  sdkLog: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../helpers/resolvePollBackgroundColor', () => ({
  resolvePollBackgroundColor: jest.fn(),
}));

jest.mock('../utils/device', () => ({
  getDeviceId: jest.fn().mockResolvedValue('device-1'),
}));

jest.mock('../utils/geoIpContext', () => ({
  waitForGeoIp: jest.fn().mockResolvedValue({ ip: '' }),
}));

const mockWaitForEffectiveUserId = jest.fn();
const mockShouldBlockInteractiveBeforeLink = jest.fn();

jest.mock('../utils/user', () => ({
  getEffectiveContactId: jest.fn().mockResolvedValue('contact-1'),
  waitForEffectiveUserId: (...args: unknown[]) =>
    mockWaitForEffectiveUserId(...args),
  shouldBlockInteractiveBeforeLink: (...args: unknown[]) =>
    mockShouldBlockInteractiveBeforeLink(...args),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendCustomEvent } from '../events/custom/CustomEvents';

describe('poll check after custom event', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockWaitForEffectiveUserId.mockResolvedValue('user-1');
    mockShouldBlockInteractiveBeforeLink.mockResolvedValue(false);
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (k: string) =>
      k === 'device_id' ? 'device-1' : null
    );
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    (global as any).fetch = fetchMock;
  });

  afterEach(() => jest.useRealTimers());

  const urls = () => fetchMock.mock.calls.map((c) => String(c[0]));

  it('INTERACTIVE add_to_cart fetches /in-app/poll', async () => {
    await sendCustomEvent('add_to_cart', {}, { eventType: 'INTERACTIVE' });
    await jest.advanceTimersByTimeAsync(1000);
    expect(urls().some((u) => u.endsWith('/v1/event'))).toBe(true);
    expect(urls().some((u) => u.endsWith('/v1/notification/in-app/poll'))).toBe(
      true
    );
  });

  it('LOG add_to_cart never fetches /in-app/poll', async () => {
    await sendCustomEvent('add_to_cart', {}, { eventType: 'LOG' });
    await jest.advanceTimersByTimeAsync(1000);
    expect(urls().some((u) => u.endsWith('/v1/notification/in-app/poll'))).toBe(
      false
    );
  });
});
