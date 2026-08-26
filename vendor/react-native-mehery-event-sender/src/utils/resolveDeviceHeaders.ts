import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

let cachedDeviceHeaders: Record<string, string> | null = null;
let resolvePromise: Promise<Record<string, string>> | null = null;

async function collectDeviceHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'X-App-Version': DeviceInfo.getVersion() || 'unknown',
    'X-Bundle-ID': DeviceInfo.getBundleId() || 'unknown',
    'X-Device-Model': DeviceInfo.getModel() || 'unknown',
    'X-System-Name': DeviceInfo.getSystemName() || 'unknown',
    'X-OS-Version':
      DeviceInfo.getSystemVersion() || String(Platform.Version) || 'unknown',
    'X-Device-Name': 'unknown',
    'X-Manufacturer': 'unknown',
    'X-API-Level': 'unknown',
    'X-CPU-ABI': 'unknown',
    'X-Boot-Time': 'unknown',
  };

  try {
    // @ts-ignore getBootTime exists at runtime but missing from type defs
    const bootTime = await DeviceInfo.getBootTime();
    if (Number.isFinite(bootTime)) {
      headers['X-Boot-Time'] = String(bootTime);
    }
  } catch {
    // keep default
  }

  if (Platform.OS === 'android') {
    try {
      headers['X-Manufacturer'] =
        (await DeviceInfo.getManufacturer()) || 'unknown';
    } catch {
      // keep default
    }

    try {
      headers['X-API-Level'] =
        String(await DeviceInfo.getApiLevel()) || 'unknown';
    } catch {
      // keep default
    }

    try {
      const abis = await DeviceInfo.supportedAbis();
      headers['X-CPU-ABI'] = abis.join(', ') || 'unknown';
    } catch {
      // keep default
    }
  }

  if (Platform.OS === 'ios') {
    try {
      headers['X-Device-Name'] =
        (await DeviceInfo.getDeviceName()) || 'unknown';
    } catch {
      // keep default
    }
  }

  return headers;
}

export async function resolveDeviceHeaders(): Promise<Record<string, string>> {
  if (cachedDeviceHeaders) {
    return cachedDeviceHeaders;
  }

  if (!resolvePromise) {
    resolvePromise = collectDeviceHeaders().finally(() => {
      resolvePromise = null;
    });
  }

  cachedDeviceHeaders = await resolvePromise;
  return cachedDeviceHeaders;
}

export function resetResolveDeviceHeadersCacheForTests(): void {
  cachedDeviceHeaders = null;
  resolvePromise = null;
}
