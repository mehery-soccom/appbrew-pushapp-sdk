import {
  attachDeviceInfo,
  deviceInfoFromHeaders,
  formatBootTime,
} from '../utils/resolveDeviceHeaders';

jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 34 },
}));

jest.mock('react-native-device-info', () => ({
  __esModule: true,
  default: {
    getVersion: jest.fn(() => '1.0.0'),
    getBundleId: jest.fn(() => 'com.app.appbrew'),
    getModel: jest.fn(() => 'Pixel 8'),
    getSystemName: jest.fn(() => 'Android'),
    getSystemVersion: jest.fn(() => '14'),
    getBootTime: jest.fn(async () => 1_720_000_000_000),
    getManufacturer: jest.fn(async () => 'Google'),
    getApiLevel: jest.fn(async () => 34),
    supportedAbis: jest.fn(async () => ['arm64-v8a']),
    getDeviceName: jest.fn(async () => 'unknown'),
  },
}));

describe('formatBootTime', () => {
  const epochMs = Date.UTC(2024, 6, 3, 1, 46, 40);

  it('converts epoch milliseconds to ISO-8601', () => {
    expect(formatBootTime(epochMs)).toBe('2024-07-03T01:46:40.000Z');
  });

  it('converts epoch seconds to ISO-8601', () => {
    expect(formatBootTime(epochMs / 1000)).toBe('2024-07-03T01:46:40.000Z');
  });

  it('accepts Date instances', () => {
    expect(formatBootTime(new Date('2026-08-31T12:00:00.000Z'))).toBe(
      '2026-08-31T12:00:00.000Z'
    );
  });

  it('returns unknown for invalid values', () => {
    expect(formatBootTime('not-a-date')).toBe('unknown');
    expect(formatBootTime(undefined)).toBe('unknown');
  });
});

describe('deviceInfoFromHeaders', () => {
  it('maps X-* device headers into the device_info body shape', () => {
    expect(
      deviceInfoFromHeaders({
        'X-App-Version': '1.3.0',
        'X-Bundle-ID': 'com.app.appbrew',
        'X-Device-Model': 'Pixel 8',
        'X-System-Name': 'Android',
        'X-OS-Name': 'ANDROID',
        'X-OS-Version': '14',
        'X-Device-Name': 'unknown',
        'X-Manufacturer': 'Google',
        'X-API-Level': '34',
        'X-CPU-ABI': 'arm64-v8a',
        'X-Boot-Time': '2026-08-31T00:00:00.000Z',
        'X-Screen-Resolution': '1080x2400',
        'X-Device-Orientation': 'Portrait',
        'X-Timezone': 'Asia/Kolkata',
        'X-Locale': 'en-IN',
        'X-SDK-Framework': 'react-native',
        'X-SDK-Version': '0.0.50',
      })
    ).toEqual({
      app_version: '1.3.0',
      bundle_id: 'com.app.appbrew',
      device_model: 'Pixel 8',
      system_name: 'Android',
      os_name: 'ANDROID',
      os_version: '14',
      device_name: 'unknown',
      manufacturer: 'Google',
      api_level: '34',
      cpu_abi: 'arm64-v8a',
      boot_time: '2026-08-31T00:00:00.000Z',
      screen_resolution: '1080x2400',
      orientation: 'Portrait',
      timezone: 'Asia/Kolkata',
      locale: 'en-IN',
      sdk_framework: 'react-native',
      sdk_version: '0.0.50',
    });
  });
});

describe('attachDeviceInfo', () => {
  it('adds device_info to a register payload without dropping other fields', () => {
    const payload = attachDeviceInfo(
      {
        device_id: 'android-1',
        platform: 'android',
        token: 'fcm-token',
      },
      {
        'X-OS-Name': 'ANDROID',
        'X-Device-Model': 'Pixel 8',
      }
    );

    expect(payload.device_id).toBe('android-1');
    expect(payload.platform).toBe('android');
    expect(payload.token).toBe('fcm-token');
    expect(payload.device_info.os_name).toBe('ANDROID');
    expect(payload.device_info.device_model).toBe('Pixel 8');
  });
});
