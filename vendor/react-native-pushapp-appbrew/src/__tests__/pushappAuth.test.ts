import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  MEHERY_X_API_ID_STORAGE_KEY,
  MEHERY_X_API_KEY_STORAGE_KEY,
  pushappAuth,
  redactPushappAuthHeadersForLog,
  resetPushappAuthCacheForTests,
} from '../helpers/pushappAuth';
import { readNativeAppCredentials } from '../helpers/readNativeAppCredentials';

jest.mock('@react-native-async-storage/async-storage', () => ({
  multiGet: jest.fn(),
  multiSet: jest.fn(),
}));

jest.mock('../helpers/readNativeAppCredentials', () => ({
  readNativeAppCredentials: jest.fn(),
}));

describe('redactPushappAuthHeadersForLog', () => {
  it('masks x-api-id and x-api-key in log output', () => {
    expect(
      redactPushappAuthHeadersForLog({
        'x-api-id': 'pa_secret_id',
        'x-api-key': 'pas_secret_key',
        'X-Device-ID': 'device-1',
      })
    ).toEqual({
      'x-api-id': '***hidden***',
      'x-api-key': '***hidden***',
      'X-Device-ID': 'device-1',
    });
  });
});

describe('pushappAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPushappAuthCacheForTests();
    jest.mocked(AsyncStorage.multiGet).mockResolvedValue([
      [MEHERY_X_API_ID_STORAGE_KEY, null],
      [MEHERY_X_API_KEY_STORAGE_KEY, null],
    ]);
  });

  it('reads native credentials when no override params are provided', async () => {
    jest.mocked(readNativeAppCredentials).mockResolvedValue({
      xApiId: 'pa_native_id',
      xApiKey: 'pas_native_secret',
    });

    await pushappAuth();

    expect(readNativeAppCredentials).toHaveBeenCalled();
    expect(AsyncStorage.multiSet).toHaveBeenCalledWith([
      [MEHERY_X_API_ID_STORAGE_KEY, 'pa_native_id'],
      [MEHERY_X_API_KEY_STORAGE_KEY, 'pas_native_secret'],
    ]);
  });

  it('uses manual override params without reading native config', async () => {
    await pushappAuth('pa_override', 'pas_override');

    expect(readNativeAppCredentials).not.toHaveBeenCalled();
    expect(AsyncStorage.multiSet).toHaveBeenCalledWith([
      [MEHERY_X_API_ID_STORAGE_KEY, 'pa_override'],
      [MEHERY_X_API_KEY_STORAGE_KEY, 'pas_override'],
    ]);
  });

  it('does not write to storage when credentials are unchanged', async () => {
    jest.mocked(AsyncStorage.multiGet).mockResolvedValue([
      [MEHERY_X_API_ID_STORAGE_KEY, 'pa_same'],
      [MEHERY_X_API_KEY_STORAGE_KEY, 'pas_same'],
    ]);

    await pushappAuth('pa_same', 'pas_same');

    expect(AsyncStorage.multiSet).not.toHaveBeenCalled();
  });

  it('updates storage when credentials change', async () => {
    jest.mocked(AsyncStorage.multiGet).mockResolvedValue([
      [MEHERY_X_API_ID_STORAGE_KEY, 'pa_old'],
      [MEHERY_X_API_KEY_STORAGE_KEY, 'pas_old'],
    ]);

    await pushappAuth('pa_new', 'pas_new');

    expect(AsyncStorage.multiSet).toHaveBeenCalledWith([
      [MEHERY_X_API_ID_STORAGE_KEY, 'pa_new'],
      [MEHERY_X_API_KEY_STORAGE_KEY, 'pas_new'],
    ]);
  });
});
