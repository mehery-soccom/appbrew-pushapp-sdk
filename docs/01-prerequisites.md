# Prerequisites

## Required Tools

| Tool | Version | Check command |
|------|---------|---------------|
| Node.js | 20.19.4 | `node --version` |
| pnpm | 10.28.2+ | `pnpm --version` |
| Ruby | 3.4.8 | `ruby --version` |
| CocoaPods | 1.16.2 | `bundle exec pod --version` |
| Xcode | 26.4+ | `xcodebuild -version` |
| JDK | 17.0.14 (openjdk) | `java --version` |
| Android Studio | Latest | -- |

React Native 0.81.0 and React 19.1.0 are pinned in `package.json` -- you don't install these manually.

## Installing

**Node.js** -- use [nvm](https://github.com/nvm-sh/nvm):
```bash
nvm install 20.19.4
nvm use 20.19.4
```

**pnpm**:
```bash
npm install -g pnpm@10.28.2
```

**Ruby** -- use [rbenv](https://github.com/rbenv/rbenv):
```bash
rbenv install 3.4.8
rbenv local 3.4.8
```

**CocoaPods** -- installed via Bundler (the `Gemfile` in the repo handles this):
```bash
bundle install
```

**JDK 17** -- use your system package manager or [SDKMAN](https://sdkman.io/):
```bash
sdk install java 17.0.14-tem
```

**Xcode** -- install from the Mac App Store. After install, accept the license:
```bash
sudo xcodebuild -license accept
```

**Android Studio** -- install from [developer.android.com](https://developer.android.com/studio). Set `ANDROID_HOME` in your shell profile:
```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools
```
