module.exports = {
  watchman: false,
  testEnvironment: 'node',
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.(test|spec).(ts|tsx)',
    // PushApp App Brew glue lives in the vendored SDK package.
    '<rootDir>/vendor/react-native-pushapp-appbrew/src/appbrew/__tests__/**/*.(test|spec).(ts|tsx)',
  ],
  testPathIgnorePatterns: ['/node_modules/'],
};
