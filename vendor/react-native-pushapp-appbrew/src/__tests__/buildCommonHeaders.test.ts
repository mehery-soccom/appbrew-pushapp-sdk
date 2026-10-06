import { Dimensions, Platform } from 'react-native';
import { buildCommonHeaders } from '../helpers/buildCommonHeaders';
import { SDK_FRAMEWORK, SDK_VERSION } from '../helpers/sdkInfo';
import { getDeviceId } from '../utils/device';
import { getDeviceMetadata } from '../utils/deviceMetadata';
import {
  resetResolveDeviceHeadersCacheForTests,
  resolveDeviceHeaders,
} from '../utils/resolveDeviceHeaders';
import { getPushappAuthHeaders } from '../helpers/pushappAuth';

jest.mock('react-native', () => ({
  Dimensions: {
    get: jest.fn(() => ({ width: 390, height: 844 })),
  },
  Platform: {
    OS: 'ios',
    Version: '17.0',
  },
}));

jest.mock('../utils/device', () => ({
  getDeviceId: jest.fn(async () => 'test-device-id'),
}));

jest.mock('../utils/deviceMetadata', () => ({
  getDeviceMetadata: jest.fn(() => ({})),
}));

jest.mock('../utils/resolveDeviceHeaders', () => ({
  resolveDeviceHeaders: jest.fn(async () => ({
    'X-App-Version': '2.5.0',
    'X-Bundle-ID': 'com.example.app',
    'X-Device-Model': 'iPhone 15',
    'X-System-Name': 'iOS',
    'X-OS-Version': '17.0',
    'X-Device-Name': 'Neil iPhone',
    'X-Manufacturer': 'unknown',
    'X-API-Level': 'unknown',
    'X-CPU-ABI': 'unknown',
    'X-Boot-Time': '1700000000',
  })),
  resetResolveDeviceHeadersCacheForTests: jest.fn(),
}));

jest.mock('../helpers/pushappAuth', () => ({
  getPushappAuthHeaders: jest.fn(async () => ({})),
  redactPushappAuthHeadersForLog: (headers: Record<string, string>) => {
    const out = { ...headers };
    if (out['x-api-id']) out['x-api-id'] = '***hidden***';
    if (out['x-api-key']) out['x-api-key'] = '***hidden***';
    return out;
  },
}));

describe('buildCommonHeaders', () => {
  beforeEach(() => {
    jest.mocked(getDeviceMetadata).mockReturnValue({});
    jest.mocked(getPushappAuthHeaders).mockResolvedValue({});
  });

  it('includes dynamic SDK framework and version headers in both formats', async () => {
    const headers = await buildCommonHeaders();

    expect(headers['X-SDK-Framework']).toBe(SDK_FRAMEWORK);
    expect(headers['X-SDK-Version']).toBe(SDK_VERSION);
    expect(headers.sdk_framework).toBe(SDK_FRAMEWORK);
    expect(headers.sdk_version).toBe(SDK_VERSION);
  });

  it('includes dynamic app and device headers from resolveDeviceHeaders', async () => {
    const headers = await buildCommonHeaders();

    expect(headers['X-App-Version']).toBe('2.5.0');
    expect(headers['X-Bundle-ID']).toBe('com.example.app');
    expect(headers['X-Device-Model']).toBe('iPhone 15');
    expect(headers['X-Boot-Time']).toBe('1700000000');
    expect(jest.mocked(resolveDeviceHeaders)).toHaveBeenCalled();
  });

  it('merges app-provided device metadata over resolved headers', async () => {
    jest.mocked(getDeviceMetadata).mockReturnValue({
      'X-Device-Model': 'Custom Model',
      'X-App-Version': '9.9.9',
    });

    const headers = await buildCommonHeaders();

    expect(headers['X-Device-Model']).toBe('Custom Model');
    expect(headers['X-App-Version']).toBe('9.9.9');
    expect(headers.sdk_version).toBe(SDK_VERSION);
  });

  it('includes device id and platform headers', async () => {
    const headers = await buildCommonHeaders();

    expect(headers['X-Device-ID']).toBe('test-device-id');
    expect(headers['X-OS-Name']).toBe('IOS');
    expect(headers['X-OS-Version']).toBe('17.0');
    expect(jest.mocked(getDeviceId)).toHaveBeenCalled();
    expect(jest.mocked(Dimensions.get)).toHaveBeenCalledWith('window');
    expect(Platform.OS).toBe('ios');
  });

  it('includes pushapp auth headers when configured', async () => {
    jest.mocked(getPushappAuthHeaders).mockResolvedValue({
      'x-api-id': 'pa_test_app_id',
      'x-api-key': 'pas_test_secret',
    });

    const headers = await buildCommonHeaders();

    expect(headers['x-api-id']).toBe('pa_test_app_id');
    expect(headers['x-api-key']).toBe('pas_test_secret');
    expect(jest.mocked(getPushappAuthHeaders)).toHaveBeenCalled();
  });
});

describe('resolveDeviceHeaders cache reset export', () => {
  it('exports reset helper for tests', () => {
    expect(resetResolveDeviceHeadersCacheForTests).toBeDefined();
  });
});
