let sdkLoggingEnabled = true;

export function setSdkLogging(enabled: boolean): void {
  sdkLoggingEnabled = enabled;
}

export function isSdkLoggingEnabled(): boolean {
  return sdkLoggingEnabled;
}

function write(level: 'log' | 'warn' | 'error', ...args: unknown[]) {
  if (sdkLoggingEnabled) console[level](...args);
}

export const sdkLog = {
  log: (...args: unknown[]) => write('log', ...args),
  warn: (...args: unknown[]) => write('warn', ...args),
  error: (...args: unknown[]) => write('error', ...args),
};
