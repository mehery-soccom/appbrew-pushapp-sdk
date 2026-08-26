import {
  markSdkReady,
  resetSdkReadinessForTests,
  waitForSdkReady,
} from '../utils/sdkReadiness';

describe('sdkReadiness', () => {
  beforeEach(() => {
    resetSdkReadinessForTests();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('waitForSdkReady resolves true after markSdkReady', async () => {
    const pending = waitForSdkReady();
    markSdkReady(true);
    await expect(pending).resolves.toBe(true);
  });

  it('waitForSdkReady returns false on timeout when init never completes', async () => {
    const pending = waitForSdkReady(100);
    jest.advanceTimersByTime(100);
    await expect(pending).resolves.toBe(false);
  });

  it('waitForSdkReady returns true immediately when already ready', async () => {
    markSdkReady(true);
    await expect(waitForSdkReady()).resolves.toBe(true);
  });
});
