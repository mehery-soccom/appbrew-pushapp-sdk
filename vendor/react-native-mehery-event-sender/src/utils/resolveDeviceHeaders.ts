import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

let cachedDeviceHeaders: Record<string, string> | null = null;
let resolvePromise: Promise<Record<string, string>> | null = null;

function readString(value: unknown, fallback = 'unknown'): string {
  if (value == null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeDeviceString(read: () => unknown, fallback = 'unknown'): string {
  try {
    return readString(read(), fallback);
  } catch {
    return fallback;
  }
}

/** PushApp Device Statistics expects ISO-8601 boot_time, not a raw epoch. */
export function formatBootTime(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 0 && value < 1e12 ? value * 1000 : value;
    const parsed = new Date(ms);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return formatBootTime(numeric);
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return 'unknown';
}

function headerValue(
  headers: Record<string, string>,
  ...keys: string[]
): string {
  for (const key of keys) {
    const value = headers[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

/**
 * Body shape PushApp stores on the device record (`device.device_info`).
 * Sent on `/device/register` so Device Statistics does not depend on HTTP
 * header case (Android HTTP/2 lowercases names; iOS HTTP/1.1 often does not).
 */
export function deviceInfoFromHeaders(
  headers: Record<string, string>
): Record<string, string> {
  return {
    app_version: headerValue(headers, 'X-App-Version'),
    bundle_id: headerValue(headers, 'X-Bundle-ID'),
    device_model: headerValue(headers, 'X-Device-Model'),
    system_name: headerValue(headers, 'X-System-Name'),
    os_name: headerValue(headers, 'X-OS-Name'),
    os_version: headerValue(headers, 'X-OS-Version'),
    device_name: headerValue(headers, 'X-Device-Name'),
    manufacturer: headerValue(headers, 'X-Manufacturer'),
    api_level: headerValue(headers, 'X-API-Level'),
    cpu_abi: headerValue(headers, 'X-CPU-ABI'),
    boot_time: headerValue(headers, 'X-Boot-Time'),
    screen_resolution: headerValue(headers, 'X-Screen-Resolution'),
    orientation: headerValue(headers, 'X-Device-Orientation'),
    timezone: headerValue(headers, 'X-Timezone'),
    locale: headerValue(headers, 'X-Locale'),
    sdk_framework: headerValue(headers, 'X-SDK-Framework', 'sdk_framework'),
    sdk_version: headerValue(headers, 'X-SDK-Version', 'sdk_version'),
  };
}

export function attachDeviceInfo<T extends Record<string, unknown>>(
  payload: T,
  headers: Record<string, string>
): T & { device_info: Record<string, string> } {
  return {
    ...payload,
    device_info: deviceInfoFromHeaders(headers),
  };
}

async function collectDeviceHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'X-App-Version': safeDeviceString(() => DeviceInfo.getVersion()),
    'X-Bundle-ID': safeDeviceString(() => DeviceInfo.getBundleId()),
    'X-Device-Model': safeDeviceString(() => DeviceInfo.getModel()),
    'X-System-Name': safeDeviceString(() => DeviceInfo.getSystemName()),
    'X-OS-Version': safeDeviceString(
      () => DeviceInfo.getSystemVersion() || String(Platform.Version)
    ),
    'X-Device-Name': 'unknown',
    'X-Manufacturer': 'unknown',
    'X-API-Level': 'unknown',
    'X-CPU-ABI': 'unknown',
    'X-Boot-Time': 'unknown',
  };

  try {
    // @ts-ignore getBootTime exists at runtime but missing from type defs
    const bootTime = await DeviceInfo.getBootTime();
    headers['X-Boot-Time'] = formatBootTime(bootTime);
  } catch {
    // keep default
  }

  if (Platform.OS === 'android') {
    try {
      headers['X-Manufacturer'] = readString(
        await DeviceInfo.getManufacturer()
      );
    } catch {
      // keep default
    }

    try {
      headers['X-API-Level'] = readString(await DeviceInfo.getApiLevel());
    } catch {
      // keep default
    }

    try {
      const abis = await DeviceInfo.supportedAbis();
      headers['X-CPU-ABI'] = Array.isArray(abis)
        ? readString(abis.join(', '))
        : 'unknown';
    } catch {
      // keep default
    }
  }

  if (Platform.OS === 'ios') {
    try {
      headers['X-Device-Name'] = readString(await DeviceInfo.getDeviceName());
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
