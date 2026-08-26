import {
  readCredentialsForEnvironment,
  sdkEnvironmentToNativeLabel,
} from '../helpers/readNativeAppCredentials';

jest.mock('react-native', () => ({
  NativeModules: {
    MeheryAppConfig: {
      getCredentialsForEnvironment: jest.fn(),
    },
  },
}));

const { MeheryAppConfig } = jest.requireMock('react-native').NativeModules;

describe('sdkEnvironmentToNativeLabel', () => {
  it('maps initSdk environments to native labels', () => {
    expect(sdkEnvironmentToNativeLabel(false)).toBe('production');
    expect(sdkEnvironmentToNativeLabel(true)).toBe('sandbox');
    expect(sdkEnvironmentToNativeLabel('development')).toBe('development');
  });
});

describe('readCredentialsForEnvironment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads production credentials', async () => {
    jest.mocked(MeheryAppConfig.getCredentialsForEnvironment).mockResolvedValue({
      xApiId: 'pa_prod',
      xApiKey: 'pas_prod',
    });

    const creds = await readCredentialsForEnvironment(false);

    expect(MeheryAppConfig.getCredentialsForEnvironment).toHaveBeenCalledWith(
      'production'
    );
    expect(creds).toEqual({ xApiId: 'pa_prod', xApiKey: 'pas_prod' });
  });

  it('reads sandbox credentials', async () => {
    jest.mocked(MeheryAppConfig.getCredentialsForEnvironment).mockResolvedValue({
      xApiId: 'pa_sandbox',
      xApiKey: 'pas_sandbox',
    });

    const creds = await readCredentialsForEnvironment(true);

    expect(MeheryAppConfig.getCredentialsForEnvironment).toHaveBeenCalledWith(
      'sandbox'
    );
    expect(creds).toEqual({ xApiId: 'pa_sandbox', xApiKey: 'pas_sandbox' });
  });

  it('reads development credentials', async () => {
    jest.mocked(MeheryAppConfig.getCredentialsForEnvironment).mockResolvedValue({
      xApiId: 'pa_dev',
      xApiKey: 'pas_dev',
    });

    const creds = await readCredentialsForEnvironment('development');

    expect(MeheryAppConfig.getCredentialsForEnvironment).toHaveBeenCalledWith(
      'development'
    );
    expect(creds).toEqual({ xApiId: 'pa_dev', xApiKey: 'pas_dev' });
  });

  it('accepts legacy appId/appSecretKey fields from native', async () => {
    jest.mocked(MeheryAppConfig.getCredentialsForEnvironment).mockResolvedValue({
      appId: 'pa_legacy',
      appSecretKey: 'pas_legacy',
    });

    const creds = await readCredentialsForEnvironment(false);

    expect(creds).toEqual({ xApiId: 'pa_legacy', xApiKey: 'pas_legacy' });
  });
});
