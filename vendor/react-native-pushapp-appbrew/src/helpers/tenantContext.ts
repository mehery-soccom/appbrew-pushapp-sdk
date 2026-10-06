import AsyncStorage from '@react-native-async-storage/async-storage';

export const MEHERY_TENANT_KEY = 'mehery_tenant';
export const MEHERY_PUSHAPP_HOST_ROOT_KEY = 'mehery_pushapp_host_root';
const DEFAULT_TENANT = 'demo';

/** Third argument to `initSdk`: production (`false`), sandbox (`true`), or dev (`'development'`). */
export type SdkInitEnvironmentParam = boolean | 'development';

const HOST_ROOTS = {
  production: 'pushapp.ai',
  sandbox: 'pushapp.net.in',
  development: 'pushapp.co.in',
} as const;

const DEFAULT_HOST_ROOT = HOST_ROOTS.sandbox;

function sanitizeTenant(tenant: string): string {
  return tenant.trim().toLowerCase();
}

function getDelimiterIndex(value: string): number {
  const underscoreIndex = value.indexOf('_');
  const hashIndex = value.indexOf('#');
  const delimiterIndexes = [underscoreIndex, hashIndex].filter(
    (index) => index > 0
  );
  return delimiterIndexes.length ? Math.min(...delimiterIndexes) : -1;
}

export function extractTenantFromIdentifier(identifier: string): string {
  const rawIdentifier = (identifier ?? '').trim();
  if (!rawIdentifier) return DEFAULT_TENANT;

  const splitIndex = getDelimiterIndex(rawIdentifier);

  const tenantPart =
    splitIndex > -1 ? rawIdentifier.slice(0, splitIndex) : rawIdentifier;
  const tenant = sanitizeTenant(tenantPart);

  return tenant || DEFAULT_TENANT;
}

export function extractChannelSegment(identifier: string): string {
  const rawIdentifier = (identifier ?? '').trim();
  if (!rawIdentifier) return rawIdentifier;

  const splitIndex = getDelimiterIndex(rawIdentifier);
  if (splitIndex === -1) return rawIdentifier;

  const channelSegment = rawIdentifier.slice(splitIndex + 1).trim();
  return channelSegment || rawIdentifier;
}

export async function storeTenantFromIdentifier(
  identifier: string
): Promise<string> {
  const tenant = extractTenantFromIdentifier(identifier);
  await AsyncStorage.setItem(MEHERY_TENANT_KEY, tenant);
  return tenant;
}

export async function getTenantFromStorage(): Promise<string> {
  const tenant = await AsyncStorage.getItem(MEHERY_TENANT_KEY);
  return sanitizeTenant(tenant ?? '') || DEFAULT_TENANT;
}

export function resolvePushAppHostRoot(param: SdkInitEnvironmentParam): string {
  if (param === 'development') return HOST_ROOTS.development;
  if (param === false) return HOST_ROOTS.production;
  return HOST_ROOTS.sandbox;
}

export async function storePushAppHostFromInitParam(
  param: SdkInitEnvironmentParam
): Promise<void> {
  const root = resolvePushAppHostRoot(param);
  await AsyncStorage.setItem(MEHERY_PUSHAPP_HOST_ROOT_KEY, root);
}

function isKnownHostRoot(v: string): boolean {
  return (
    v === HOST_ROOTS.production ||
    v === HOST_ROOTS.sandbox ||
    v === HOST_ROOTS.development
  );
}

async function getPushAppHostRootFromStorage(): Promise<string> {
  const root = (
    await AsyncStorage.getItem(MEHERY_PUSHAPP_HOST_ROOT_KEY)
  )?.trim();
  if (root && isKnownHostRoot(root)) return root;
  return DEFAULT_HOST_ROOT;
}

export async function getHttpHostBaseUrl(): Promise<string> {
  const tenant = await getTenantFromStorage();
  const hostRoot = await getPushAppHostRootFromStorage();
  return `https://${tenant}.${hostRoot}`;
}

export async function getWsHostUrl(): Promise<string> {
  const tenant = await getTenantFromStorage();
  const hostRoot = await getPushAppHostRootFromStorage();
  return `wss://${tenant}.${hostRoot}/pushapp`;
}

export async function getApiBaseUrl(): Promise<string> {
  const host = await getHttpHostBaseUrl();
  return `${host}/pushapp/api`;
}
