import {
  isSdkLoggingEnabled,
  sdkLog,
  setSdkLogging,
} from '../helpers/sdkLogger';

describe('sdkLogger', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    setSdkLogging(true);
  });

  afterEach(() => {
    setSdkLogging(true);
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('defaults to logging enabled', () => {
    expect(isSdkLoggingEnabled()).toBe(true);
  });

  it('forwards log, warn, and error when enabled', () => {
    sdkLog.log('hello');
    sdkLog.warn('careful');
    sdkLog.error('oops');

    expect(logSpy).toHaveBeenCalledWith('hello');
    expect(warnSpy).toHaveBeenCalledWith('careful');
    expect(errorSpy).toHaveBeenCalledWith('oops');
  });

  it('suppresses all levels when disabled', () => {
    setSdkLogging(false);

    expect(isSdkLoggingEnabled()).toBe(false);

    sdkLog.log('hello');
    sdkLog.warn('careful');
    sdkLog.error('oops');

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
