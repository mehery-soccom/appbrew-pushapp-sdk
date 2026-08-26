jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('react-native-device-info', () => ({
  __esModule: true,
  default: {
    getVersion: jest.fn(),
  },
}));

jest.mock('../events/custom/CustomEvents', () => ({
  sendCustomEvent: jest.fn(),
  schedulePollCheck: jest.fn(),
}));

jest.mock('../utils/ensureDeviceRegistered', () => ({
  ensureDeviceRegistered: jest.fn(),
}));

jest.mock('../helpers/sdkLogger', () => ({
  sdkLog: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';
import { sendCustomEvent } from '../events/custom/CustomEvents';
import { trackAppInstallIfNeeded } from '../events/default/LifecycleEvents';
import { SDK_EVENT_NAMES } from '../events/default/eventNames';

const APP_INSTALL_SENT_KEY = 'mehery_app_install_sent';
const APP_INSTALL_VERSION_KEY = 'mehery_app_install_version';

describe('trackAppInstallIfNeeded', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (DeviceInfo.getVersion as jest.Mock).mockReturnValue('1.0.0');
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
    (sendCustomEvent as jest.Mock).mockResolvedValue(true);
  });

  function mockStorage(values: Record<string, string | null>) {
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
      return values[key] ?? null;
    });
  }

  it('sends app_install on first launch and stores version', async () => {
    mockStorage({});

    await trackAppInstallIfNeeded();

    expect(sendCustomEvent).toHaveBeenCalledWith(
      SDK_EVENT_NAMES.APP_INSTALL,
      { app_version: '1.0.0', update: false },
      { eventType: 'LOG' }
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      APP_INSTALL_VERSION_KEY,
      '1.0.0'
    );
  });

  it('does not send when stored version matches current', async () => {
    mockStorage({ [APP_INSTALL_VERSION_KEY]: '1.0.0' });

    await trackAppInstallIfNeeded();

    expect(sendCustomEvent).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('sends again on version change and updates stored version', async () => {
    mockStorage({ [APP_INSTALL_VERSION_KEY]: '1.0.0' });
    (DeviceInfo.getVersion as jest.Mock).mockReturnValue('2.0.0');

    await trackAppInstallIfNeeded();

    expect(sendCustomEvent).toHaveBeenCalledWith(
      SDK_EVENT_NAMES.APP_INSTALL,
      { app_version: '2.0.0', previous_version: '1.0.0', update: true },
      { eventType: 'LOG' }
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      APP_INSTALL_VERSION_KEY,
      '2.0.0'
    );
  });

  it('does not update storage when send fails', async () => {
    mockStorage({});
    (sendCustomEvent as jest.Mock).mockResolvedValue(false);

    await trackAppInstallIfNeeded();

    expect(sendCustomEvent).toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('migrates legacy boolean flag without sending', async () => {
    mockStorage({ [APP_INSTALL_SENT_KEY]: 'true' });

    await trackAppInstallIfNeeded();

    expect(sendCustomEvent).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      APP_INSTALL_VERSION_KEY,
      '1.0.0'
    );
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(APP_INSTALL_SENT_KEY);
  });
});
