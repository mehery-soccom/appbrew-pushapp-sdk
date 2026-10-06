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
import {
  __getPendingCustomEventCountForTests,
  __resetPendingCustomEventsForTests,
  flushPendingCustomEvents,
  OnPageClose,
  OnPageOpen,
  sendCustomEvent,
} from '../events/custom/CustomEvents';

describe('pending custom event queue', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    __resetPendingCustomEventsForTests();
    global.fetch = fetchMock as unknown as typeof fetch;
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('');
    mockWaitForEffectiveUserId.mockResolvedValue('guest_1');
    mockShouldBlockInteractiveBeforeLink.mockResolvedValue(false);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
  });

  it('queues interactive event when blocked before /device/link', async () => {
    mockShouldBlockInteractiveBeforeLink.mockResolvedValue(true);

    const sent = await sendCustomEvent('page_open', { page: 'home' });

    expect(sent).toBe(false);
    expect(__getPendingCustomEventCountForTests()).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('flushes queued events after link is no longer blocked', async () => {
    mockShouldBlockInteractiveBeforeLink.mockResolvedValue(true);
    await sendCustomEvent('page_open', { page: 'home' });
    expect(__getPendingCustomEventCountForTests()).toBe(1);

    mockShouldBlockInteractiveBeforeLink.mockResolvedValue(false);
    await flushPendingCustomEvents();

    expect(__getPendingCustomEventCountForTests()).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.event_name).toBe('page_open');
    expect(body.event_data).toEqual({ page: 'home' });
  });

  it('queues when effective user_id is unavailable', async () => {
    mockWaitForEffectiveUserId.mockResolvedValue('');

    const sent = await sendCustomEvent('page_open', { page: 'explore' });

    expect(sent).toBe(false);
    expect(__getPendingCustomEventCountForTests()).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('drops oldest when queue exceeds cap of 50', async () => {
    mockShouldBlockInteractiveBeforeLink.mockResolvedValue(true);

    for (let i = 0; i < 52; i += 1) {
      await sendCustomEvent(`evt_${i}`, { i });
    }

    expect(__getPendingCustomEventCountForTests()).toBe(50);

    mockShouldBlockInteractiveBeforeLink.mockResolvedValue(false);
    await flushPendingCustomEvents();

    const names = fetchMock.mock.calls.map(
      (call) => JSON.parse(call[1].body).event_name
    );
    expect(names[0]).toBe('evt_2');
    expect(names[names.length - 1]).toBe('evt_51');
    expect(names).not.toContain('evt_0');
    expect(names).not.toContain('evt_1');
  });

  it('OnPageOpen returns a cancel function that prevents delayed sends', () => {
    jest.useFakeTimers();
    const cancel = OnPageOpen('dashboard');
    cancel();
    jest.advanceTimersByTime(2500);
    expect(fetchMock).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('OnPageClose uses provided page name', async () => {
    await OnPageClose('account');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.event_name).toBe('page_closed');
    expect(body.event_data).toEqual({ page: 'account' });
  });
});
