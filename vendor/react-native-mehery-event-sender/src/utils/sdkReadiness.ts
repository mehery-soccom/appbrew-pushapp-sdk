let sdkReady = false;
let sdkReadyResolve: ((value: boolean) => void) | null = null;
let sdkReadyPromise: Promise<boolean>;

function createSdkReadyPromise(): void {
  sdkReady = false;
  sdkReadyPromise = new Promise<boolean>((resolve) => {
    sdkReadyResolve = resolve;
  });
}

createSdkReadyPromise();

/** Reset readiness at the start of each `initSdk` call. */
export function resetSdkReady(): void {
  createSdkReadyPromise();
}

/** Mark SDK init complete (register + lifecycle + WebSocket connect attempted). */
export function markSdkReady(success = true): void {
  if (sdkReady) return;
  sdkReady = success;
  sdkReadyResolve?.(success);
}

/**
 * Wait until `initSdk` finishes register, lifecycle events, and WebSocket connect.
 * Host apps should await this before calling `OnUserLogin`.
 */
export async function waitForSdkReady(timeoutMs = 30_000): Promise<boolean> {
  if (sdkReady) return true;

  const timedOut = await Promise.race([
    sdkReadyPromise,
    new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(false), timeoutMs)
    ),
  ]);

  return timedOut;
}

/** Test-only reset. */
export function resetSdkReadinessForTests(): void {
  createSdkReadyPromise();
}
