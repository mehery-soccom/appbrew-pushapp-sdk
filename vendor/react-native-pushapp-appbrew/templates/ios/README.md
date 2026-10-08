# iOS templates

Reference native files for the PushApp SDK. Copy them into your Xcode project and follow
the iOS section of `../../README.md`. Values you must change are marked `CHANGE THIS`,
`YOUR_APP_NAME` or `your-app-scheme`.

| Folder | Goes in | Notes |
|---|---|---|
| `App/` | main app target | `PushTokenManager.*` and `MeheryPushHelpers.swift` are required. Add **one** of `MeheryLiveActivityStub.swift` (no Live Activity) or `MeheryLiveActivity.swift` (needs the `DeliveryActivity/` files). `AppDelegate.swift` and `SceneDelegate.swift` are references to merge into your own, not to overwrite them. |
| `minimal/` | extension targets | Short, self-contained service and content extensions (the same code the README shows). |
| `ImageNotification/`, `ImagePreviewExtension/` | extension targets | Full versions: multi-image download, branded header and logo, auto-scroll and page scrim. |
| `DeliveryActivity/` | Live Activity widget target | Also add `DeliveryActivityLiveActivity.swift` and `MeheryAppGroup.swift` to the main app target. |

Values to change: bundle ids, the App Group in `MeheryAppGroup.swift` and
`DeliveryActivityExtension.entitlements`, `allowedUrlSchemes` in `AppDelegate.swift`,
and `YOUR_APP_NAME` in `SceneDelegate.swift`.
