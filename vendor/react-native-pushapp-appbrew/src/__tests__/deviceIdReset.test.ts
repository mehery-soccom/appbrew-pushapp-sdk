import { readFileSync } from 'fs';
import { join } from 'path';

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockStore.set(k, v);
  }),
}));
jest.mock('react-native-uuid', () => ({ v4: () => 'uuid' }));
jest.mock('../helpers/sdkLogger', () => ({
  sdkLog: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { getDeviceId, resetCachedDeviceId } from '../utils/device';

describe('device id recovery', () => {
  it('applies a rotated device_id only after resetCachedDeviceId', async () => {
    mockStore.set('device_id', 'old');
    await expect(getDeviceId()).resolves.toBe('old');
    mockStore.set('device_id', 'rotated');
    await expect(getDeviceId()).resolves.toBe('old');
    resetCachedDeviceId();
    await expect(getDeviceId()).resolves.toBe('rotated');
  });

  it('is exported from the SDK entry so release builds can reach it', () => {
    const src = readFileSync(join(__dirname, '../index.tsx'), 'utf8');
    expect(src).toMatch(/export \{[^}]*resetCachedDeviceId[^}]*\} from '\.\/utils\/device'/);
  });
});
