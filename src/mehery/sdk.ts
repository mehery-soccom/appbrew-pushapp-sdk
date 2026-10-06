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
  handleBackgroundFcmMessage?: (remoteMessage: unknown) => Promise<void>
  setGeoIP: (...args: any[]) => unknown
  resetCachedDeviceId?: () => void
  PollOverlayProvider: any
  InlinePollContainer: any
  TooltipPollContainer: any
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

function isMeheryBarrelPath(id: string): boolean {
  return (
    id.includes('react-native-pushapp-appbrew') &&
    (/[/\\](?:lib[/\\]module[/\\]index|src[/\\]index)\.(?:js|ts|tsx)$/.test(
      id
    ) ||
      /pushapp-appbrew[^/\\]*$/.test(id))
  )
}

function factoryLooksLikeMeheryBarrel(src: string): boolean {
  // Barrel defines initSdk + login. Avoid helpers/pushappAuth which only
  // mentions pushappAuth and was incorrectly returned as the first hit.
  return (
    src.includes('initSdk') &&
    (src.includes('OnUserLogin') ||
      src.includes('updateUserProfile') ||
      src.includes('PollOverlayProvider'))
  )
}

function findMeheryModuleId(): string | null {
  const factories = __webpack_require__.m || {}
  const pathHits = Object.keys(factories).filter(isMeheryBarrelPath)
  if (pathHits[0]) {
    return pathHits[0]
  }

  // Production rspack may use numeric module ids — scan factory source.
  let weakInitOnly: string | null = null
  for (const [id, factory] of Object.entries(factories)) {
    const src = typeof factory === 'function' ? String(factory) : ''
    if (!src) continue
    const mentionsPackage =
      id.includes('react-native-pushapp-appbrew') ||
      src.includes('react-native-pushapp-appbrew')
    if (!mentionsPackage && !src.includes('initSdk')) {
      continue
    }
    if (factoryLooksLikeMeheryBarrel(src)) {
      return id
    }
    if (src.includes('function initSdk') || src.includes('initSdk=')) {
      if (!weakInitOnly) weakInitOnly = id
    }
  }
  return weakInitOnly
}

/** Collect candidate barrel module ids (path + factory heuristics). */
function findMeheryModuleCandidates(): string[] {
  const factories = __webpack_require__.m || {}
  const out: string[] = []
  const seen = new Set<string>()
  const push = (id: string | null) => {
    if (id && !seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }

  for (const id of Object.keys(factories)) {
    if (isMeheryBarrelPath(id)) push(id)
  }
  for (const [id, factory] of Object.entries(factories)) {
    const src = typeof factory === 'function' ? String(factory) : ''
    if (factoryLooksLikeMeheryBarrel(src)) push(id)
  }
  push(findMeheryModuleId())
  return out
}

function findMeheryDeviceModuleId(): string | null {
  const ids = Object.keys(__webpack_require__.m || {}).filter(
    (k) =>
      k.includes('react-native-pushapp-appbrew') &&
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
    require('react-native-pushapp-appbrew')
  } catch {
    // expected under cycles
  }
}

function readMeheryExports(): MeherySdk | null {
  const candidates = findMeheryModuleCandidates()
  if (candidates.length === 0) {
    return null
  }

  const safeReq = createSafeRequire()
  const tried: string[] = []

  for (const id of candidates) {
    try {
      const exports = forceCompleteModule(id, safeReq)
      tried.push(
        `${id}→keys=${Object.keys(exports).slice(0, 8).join('|')}`
      )
      if (typeof exports.initSdk === 'function') {
        return attachResetCachedDeviceId(exports as MeherySdk, safeReq)
      }
    } catch (e) {
      tried.push(
        `${id}→err=${e instanceof Error ? e.message : String(e)}`
      )
    }
  }

  throw new Error(
    `[Mehery] initSdk missing after factory; tried=${tried.join(' ;; ')}`
  )
}

export function loadMeherySdk(): Promise<MeherySdk> {
  if (!sdkPromise) {
    sdkPromise = (async () => {
      touchMeheryModule()
      let sdk = readMeheryExports()
      if (!sdk) {
        // Fallback when webpack module ids are opaque in release bundles.
        try {
          const mod = await import('react-native-pushapp-appbrew')
          const candidate = (mod as { default?: MeherySdk }).default ??
            (mod as MeherySdk)
          if (typeof candidate?.initSdk === 'function') {
            sdk = candidate
          }
        } catch (e) {
          console.warn('[Mehery] dynamic import fallback failed', e)
        }
      }
      // Re-scan after import() — factory map may now include the package.
      if (!sdk) {
        touchMeheryModule()
        sdk = readMeheryExports()
      }
      if (!sdk) {
        throw new Error(
          '[Mehery] module id not in webpack map — is react-native-pushapp-appbrew installed?'
        )
      }
      return sdk
    })().catch((error) => {
      // Allow a later call to retry after a transient wrong-module hit.
      sdkPromise = null
      throw error
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
