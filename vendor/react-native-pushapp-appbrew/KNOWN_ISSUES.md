# Known issues

For `react-native-pushapp-appbrew` (App Brew build). Back to the [README](./README.md).

1. **Android `<queries>`:** the SDK doesn't declare it. Without the `<queries>` snippet from the README's Android section, external CTA URLs can open the app instead of the browser.
2. **Android small icon:** the SDK hardcodes `mipmap/ic_launcher` and ignores `default_notification_icon`.
3. **Android channels:** the native code uses `default_channel_id`, `rich_media_channel`, `carousel_channel` and `live_activity_channel`; JS uses `default-channel-id`; App Brew uses `default`. Users may see several channels in Settings.
4. **Android Gradle:** the SDK's `build.gradle` forces `androidx.core:1.13.1` and `appcompat:1.6.1` for the whole build. Check with `./gradlew :app:dependencies`.
5. **Nested JS dependencies:** the SDK's RNFB, device-info and localize ranges differ from the host's native versions. Pin them with pnpm overrides.
6. **iOS Live Activity:** the activity push token is only logged and never sent to the backend, so there are no remote APNs updates. `triggerLiveActivity` / `triggerCarouselNotification` have no iOS native module.
7. **iOS content extension:** its per-button URL code is never used. URLs are opened by `AppDelegate` and by JS, so one tap can open the URL twice.
8. **`aps-environment`:** it is `production` for every configuration.
9. **Secrets:** never commit real `pa_` / `pas_` keys. Use placeholders and inject them at build time.
