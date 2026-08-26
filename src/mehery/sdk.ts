/**
 * Mehery SDK loader for Re.Pack.
 *
 * The Mehery barrel (and some deps) often stall in webpack circular evaluation:
 * `module.loaded === false` and `__webpack_require__(id)` returns undefined.
 * After App mount we force-complete stalled factories without re-running
 * already-loaded modules (native view registration is not idempotent).
 */

export type MeherySdk = {
  initSdk: (...args: any[]) => Promise<unknown> | unknown
  pushappAuth: (...args: any[]) => Promise<unknown> | unknown
  readCredentialsForEnvironment: (
    env: unknown
  ) => Promise<{ xApiId: string; xApiKey: string }>
  waitForSdkReady: (timeoutMs?: number) => Promise<boolean> | boolean
  OnAppLaunch: () => Promise<unknown> | unknown
  OnAppOpen: () => unknown
  OnUserLogin: (...args: any[]) => Promise<unknown> | unknown
  OnUserLogOut: (...args: any[]) => Promise<unknown> | unknown
  OnPageOpen: (...args: any[]) => unknown
  OnPageClose: (...args: any[]) => unknown
  sendCustomEvent: (...args: any[]) => Promise<unknown> | unknown
  flushPendingCustomEvents?: () => Promise<unknown> | unknown
  updateUserProfile: (...args: any[]) => Promise<unknown> | unknown
  ensureAndroidNotificationPermission: () => Promise<unknown> | unknown
  configureNotificationLinkRewrites: (...args: any[]) => unknown
  setNotificationUrlHandler: (...args: any[]) => unknown
  registerFcmBackgroundHandler: () => void
  setGeoIP: (...args: any[]) => unknown
  resetCachedDeviceId?: () => void
  PollOverlayProvider: any
  [key: string]: unknown
}

type WebpackModule = {
  id?: string
  exports: Record<string, unknown>
  loaded?: boolean
}

type WebpackRequire = {
  (id: string): unknown
  m: Record<
    string,
    (
      module: WebpackModule,
      exports: Record<string, unknown>,
      req: WebpackRequire
    ) => void
  >
  c: Record<string, WebpackModule>
}

declare const __webpack_require__: WebpackRequire

let sdkPromise: Promise<MeherySdk> | null = null
const completing = new Set<string>()

function findMeheryModuleId(): string | null {
  const ids = Object.keys(__webpack_require__.m || {}).filter(
    (k) =>
      k.includes('react-native-mehery-event-sender') &&
      k.endsWith('lib/module/index.js')
  )
  return ids[0] ?? null
}

function findMeheryDeviceModuleId(): string | null {
  const ids = Object.keys(__webpack_require__.m || {}).filter(
    (k) =>
      k.includes('react-native-mehery-event-sender') &&
      /utils\/device\.(js|ts)$/.test(k)
  )
  return ids[0] ?? null
}

function attachResetCachedDeviceId(
  sdk: MeherySdk,
  req: WebpackRequire
): MeherySdk {
  if (typeof sdk.resetCachedDeviceId === 'function') {
    return sdk
  }
  const id = findMeheryDeviceModuleId()
  if (!id) {
    return sdk
  }
  try {
    const exports = forceCompleteModule(id, req)
    if (typeof exports.resetCachedDeviceId === 'function') {
      sdk.resetCachedDeviceId = exports.resetCachedDeviceId as () => void
    }
  } catch (e) {
    console.warn('[Mehery] Could not attach resetCachedDeviceId', e)
  }
  return sdk
}

function forceCompleteModule(
  id: string,
  req: WebpackRequire
): Record<string, unknown> {
  const existing = req.c[id]
  if (existing?.loaded) {
    return existing.exports
  }

  if (completing.has(id)) {
    if (!req.c[id]) {
      req.c[id] = { id, exports: {}, loaded: false }
    }
    return req.c[id].exports
  }

  const factory = req.m[id]
  if (typeof factory !== 'function') {
    throw new Error(`[Mehery] webpack factory missing for ${id}`)
  }

  completing.add(id)
  try {
    // Fresh exports bag: partial circular runs leave non-configurable getters.
    const fresh: WebpackModule = { id, exports: {}, loaded: false }
    req.c[id] = fresh
    factory(fresh, fresh.exports, req)
    fresh.loaded = true
    return fresh.exports
  } finally {
    completing.delete(id)
  }
}

function createSafeRequire(): WebpackRequire {
  const safe = function safeRequire(id: string): unknown {
    const cached = __webpack_require__.c[id]
    if (cached?.loaded) {
      return cached.exports
    }

    try {
      const result = __webpack_require__(id)
      if (result !== undefined) {
        return result
      }
    } catch {
      // fall through
    }

    if (__webpack_require__.m[id]) {
      return forceCompleteModule(id, safe)
    }

    return __webpack_require__(id)
  } as WebpackRequire

  safe.m = __webpack_require__.m
  safe.c = __webpack_require__.c
  return safe
}

function touchMeheryModule(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@react-native-async-storage/async-storage')
  } catch {
    // ignore
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react-native-mehery-event-sender')
  } catch {
    // expected under cycles
  }
}

function readMeheryExports(): MeherySdk | null {
  const id = findMeheryModuleId()
  if (!id) {
    return null
  }

  const safeReq = createSafeRequire()
  const exports = forceCompleteModule(id, safeReq)

  if (typeof exports.initSdk !== 'function') {
    throw new Error(
      `[Mehery] initSdk missing after factory; keys=${Object.keys(exports).join(',')}`
    )
  }

  return attachResetCachedDeviceId(exports as MeherySdk, safeReq)
}

export function loadMeherySdk(): Promise<MeherySdk> {
  if (!sdkPromise) {
    sdkPromise = Promise.resolve().then(() => {
      touchMeheryModule()
      const sdk = readMeheryExports()
      if (!sdk) {
        throw new Error(
          '[Mehery] module id not in webpack map — is react-native-mehery-event-sender installed?'
        )
      }
      return sdk
    })
  }
  return sdkPromise
}

/**
 * Await host bootstrap + SDK readiness gate.
 * `waitForSdkReady` returns false on timeout / failed init — callers must not
 * treat that as success (OnUserLogin will skip with "initSdk has not completed").
 */
export async function ensureSdkReady(timeoutMs = 60_000): Promise<MeherySdk> {
  // Lazy import avoids a circular load with bootstrap → sdk.
  const { bootstrapMeherySdk } = await import('./bootstrap')
  await bootstrapMeherySdk()
  const sdk = await loadMeherySdk()
  const ready = await sdk.waitForSdkReady(timeoutMs)
  if (!ready) {
    throw new Error(
      '[Mehery] SDK not ready (waitForSdkReady timed out or init failed)'
    )
  }
  return sdk
}

export function pickMeheryExport<T>(
  mod: unknown,
  name: string
): T | undefined {
  if (mod && typeof mod === 'object' && name in (mod as object)) {
    return (mod as Record<string, T>)[name]
  }
  return undefined
}
