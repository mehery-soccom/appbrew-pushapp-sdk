/**
 * AsyncStorage 3.x dropped the v2 `multiGet` / `multiSet` / `multiRemove` API
 * on the default (legacy) export. Mehery still calls those methods.
 *
 * Re.Pack aliases `@react-native-async-storage/async-storage` → this module.
 * The real package is loaded via the `async-storage-real` alias (see rspack.config).
 */
import RealDefault, {
  AsyncStorageError,
  createAsyncStorage,
} from 'async-storage-real'

type StorageLike = {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
  removeItem: (key: string) => Promise<void>
  getAllKeys: () => Promise<string[]>
  clear: () => Promise<void>
  getMany?: (keys: string[]) => Promise<Record<string, string | null>>
  setMany?: (entries: Record<string, string>) => Promise<void>
  removeMany?: (keys: string[]) => Promise<void>
  multiGet?: (
    keys: string[]
  ) => Promise<ReadonlyArray<readonly [string, string | null]>>
  multiSet?: (pairs: ReadonlyArray<readonly [string, string]>) => Promise<void>
  multiRemove?: (keys: string[]) => Promise<void>
  mergeItem?: (key: string, value: string) => Promise<void>
  [key: string]: unknown
}

const real = RealDefault as StorageLike

async function multiGet(
  keys: string[]
): Promise<Array<[string, string | null]>> {
  if (typeof real.multiGet === 'function') {
    const pairs = await real.multiGet(keys)
    return pairs.map(([k, v]) => [k, v])
  }
  if (typeof real.getMany === 'function') {
    const map = await real.getMany(keys)
    return keys.map((k) => [k, map[k] ?? null])
  }
  return Promise.all(keys.map(async (k) => [k, await real.getItem(k)]))
}

async function multiSet(
  pairs: ReadonlyArray<readonly [string, string]>
): Promise<void> {
  if (typeof real.multiSet === 'function') {
    await real.multiSet(pairs)
    return
  }
  if (typeof real.setMany === 'function') {
    const entries: Record<string, string> = {}
    for (const [k, v] of pairs) {
      entries[k] = v
    }
    await real.setMany(entries)
    return
  }
  await Promise.all(pairs.map(([k, v]) => real.setItem(k, v)))
}

async function multiRemove(keys: string[]): Promise<void> {
  if (typeof real.multiRemove === 'function') {
    await real.multiRemove(keys)
    return
  }
  if (typeof real.removeMany === 'function') {
    await real.removeMany(keys)
    return
  }
  await Promise.all(keys.map((k) => real.removeItem(k)))
}

const AsyncStorage = {
  ...real,
  getItem: real.getItem.bind(real),
  setItem: real.setItem.bind(real),
  removeItem: real.removeItem.bind(real),
  getAllKeys: real.getAllKeys.bind(real),
  clear: real.clear.bind(real),
  getMany: real.getMany?.bind(real),
  setMany: real.setMany?.bind(real),
  removeMany: real.removeMany?.bind(real),
  multiGet,
  multiSet,
  multiRemove,
}

export default AsyncStorage
export { createAsyncStorage, AsyncStorageError }
