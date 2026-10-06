function resolvePackageVersion(): string {
  try {
    // Published layout: lib/module/helpers/sdkInfo.js → package root
    return require('../../../package.json').version as string;
  } catch {
    // Source layout: src/helpers/sdkInfo.ts → package root (example app Metro)
    return require('../../package.json').version as string;
  }
}

export const SDK_VERSION = resolvePackageVersion();

/** Mehery RN SDK framework identifier (Flutter SDK sends `flutter`). */
export const SDK_FRAMEWORK = 'react-native';
