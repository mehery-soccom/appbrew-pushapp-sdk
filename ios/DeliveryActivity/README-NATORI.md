# DeliveryActivity (Live Activity) — Natori

Widget extension target: **DeliveryActivityExtension**  
Bundle ID: `com.app.appbrew.DeliveryActivity`  
App Group (main app + extension): `group.com.app.appbrew.NotificationLiveActivity`

## Wired in this branch

- Xcode target created and embedded into `natori`
- `DeliveryActivityAttributes` compiled into the main app (via `DeliveryActivityLiveActivity.swift`)
- `ios/natori/MeheryLiveActivity.swift` starts/updates Live Activities from background pushes
- App Groups on `natori.entitlements` + `DeliveryActivityExtension.entitlements`

## Client Apple Developer steps (required once)

1. Create App Group `group.com.app.appbrew.NotificationLiveActivity`
2. Enable App Groups on App ID `com.app.appbrew` and `com.app.appbrew.DeliveryActivity`
3. Create / refresh provisioning profiles for both
4. In Xcode, assign signing for **DeliveryActivityExtension**

## Trigger payload

Background / content-available push with:

- `activity_id` (required)
- and at least one of: `live_activity`/`enable_live_activity`, `message1`–`message3`, `progressPercent`, or an image URL

## Files

| Path | Role |
|------|------|
| `DeliveryActivityBundle.swift` | `@main` WidgetBundle |
| `DeliveryActivityLiveActivity.swift` | Lock Screen / Island UI + Attributes |
| `MeheryAppGroup.swift` | Shared group id constant |
| `../natori/MeheryLiveActivity.swift` | Start/update from AppDelegate |
