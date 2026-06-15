const repackCommands = require('@callstack/repack/commands/rspack');

module.exports = {
  assets: ['./assets/fonts'],
  dependencies: {
    'react-native-config': { platforms: { android: null } },
  },
  commands: repackCommands,
};
