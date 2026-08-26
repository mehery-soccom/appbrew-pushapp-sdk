import { NativeModules } from 'react-native';
import type { SdkInitEnvironmentParam } from './tenantContext';

export type MeheryAppCredentials = {
  xApiId: string;
  xApiKey: string;
};

type NativeCredentialPayload = {
  xApiId?: string;
  xApiKey?: string;
  appId?: string;
  appSecretKey?: string;
};

type MeheryAppConfigModule = {
  getCredentials: () => Promise<NativeCredentialPayload>;
  getCredentialsForEnvironment: (
    environment: string
  ) => Promise<NativeCredentialPayload>;
};

const { MeheryAppConfig } = NativeModules as {
  MeheryAppConfig?: MeheryAppConfigModule;
};

function normalizeNativeCredentials(
  payload: NativeCredentialPayload
): MeheryAppCredentials {
  const xApiId = (payload.xApiId ?? payload.appId ?? '').trim();
  const xApiKey = (payload.xApiKey ?? payload.appSecretKey ?? '').trim();

  if (!xApiId || !xApiKey) {
    throw new Error('Native credentials response is missing xApiId or xApiKey');
  }

  return { xApiId, xApiKey };
}

export function sdkEnvironmentToNativeLabel(
  environment: SdkInitEnvironmentParam
): 'production' | 'sandbox' | 'development' {
  if (environment === 'development') return 'development';
  if (environment === false) return 'production';
  return 'sandbox';
}

export async function readNativeAppCredentials(): Promise<MeheryAppCredentials> {
  if (!MeheryAppConfig?.getCredentials) {
    throw new Error(
      'MeheryAppConfig native module is unavailable. Add MeheryProdAppId / MeheryProdAppKey (or legacy MeheryAppId / MeheryAppSecretKey) to Info.plist (iOS) or mehery_prod_app_id / mehery_prod_app_key to strings.xml (Android), then rebuild the native app.'
    );
  }

  return normalizeNativeCredentials(await MeheryAppConfig.getCredentials());
}

export async function readCredentialsForEnvironment(
  environment: SdkInitEnvironmentParam
): Promise<MeheryAppCredentials> {
  if (!MeheryAppConfig?.getCredentialsForEnvironment) {
    throw new Error(
      'MeheryAppConfig.getCredentialsForEnvironment is unavailable. Rebuild the native app after upgrading react-native-mehery-event-sender.'
    );
  }

  const envLabel = sdkEnvironmentToNativeLabel(environment);
  return normalizeNativeCredentials(
    await MeheryAppConfig.getCredentialsForEnvironment(envLabel)
  );
}
