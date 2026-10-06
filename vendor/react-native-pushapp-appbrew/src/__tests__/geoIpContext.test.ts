import {
  buildGeoIpPayload,
  resetGeoIpContextForTests,
  setGeoIP,
  waitForGeoIp,
} from '../utils/geoIpContext';

describe('geoIpContext', () => {
  beforeEach(() => {
    resetGeoIpContextForTests();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('buildGeoIpPayload fills empty shape with defaults', () => {
    expect(buildGeoIpPayload()).toEqual({
      ip: '',
      location: { lat: 0, lng: 0 },
      country: { iso_code: '', name: '' },
      region: { iso_code: '', name: '' },
      city: { name: '' },
      area: { name: '' },
    });
  });

  it('buildGeoIpPayload merges partial input', () => {
    expect(
      buildGeoIpPayload({
        ip: '1.2.3.4',
        country: { iso_code: 'US', name: '' },
        location: { lat: 12.5 },
      })
    ).toEqual({
      ip: '1.2.3.4',
      location: { lat: 12.5, lng: 0 },
      country: { iso_code: 'US', name: '' },
      region: { iso_code: '', name: '' },
      city: { name: '' },
      area: { name: '' },
    });
  });

  it('waitForGeoIp resolves early when setGeoIP was already called', async () => {
    setGeoIP({ ip: '9.9.9.9' });
    const p = waitForGeoIp({ timeoutMs: 5000 });
    await Promise.resolve();
    const result = await p;
    expect(result.ip).toBe('9.9.9.9');
  });

  it('waitForGeoIp uses timeout then empty geo when host never calls setGeoIP', async () => {
    const p = waitForGeoIp({ timeoutMs: 100 });
    jest.advanceTimersByTime(100);
    const result = await p;
    expect(result).toEqual(buildGeoIpPayload());
  });

  it('after first wait, waitForGeoIp returns immediately with updated setGeoIP', async () => {
    const p1 = waitForGeoIp({ timeoutMs: 50 });
    jest.advanceTimersByTime(50);
    await p1;

    setGeoIP({ city: { name: 'Berlin' } });
    const p2 = waitForGeoIp();
    await expect(p2).resolves.toMatchObject({
      city: { name: 'Berlin' },
    });
  });
});
