import UIKit
import React

/// iOS 27+ requires UIScene lifecycle. Window + RN bootstrap live here;
/// process-level setup (Firebase, push) stays in AppDelegate.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else {
      assertionFailure("React Native factory missing before scene connect")
      return
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window

    factory.startReactNative(
      withModuleName: "YOUR_APP_NAME", // must equal app.json "name"
      in: window,
      launchOptions: Self.launchOptions(from: connectionOptions)
    )
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let url = URLContexts.first?.url else { return }
    RCTLinkingManager.application(UIApplication.shared, open: url, options: [:])
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = RCTLinkingManager.application(
      UIApplication.shared,
      continue: userActivity,
      restorationHandler: { _ in }
    )
  }

  /// Map scene connection options into the launchOptions shape RN 0.81 expects.
  private static func launchOptions(
    from connectionOptions: UIScene.ConnectionOptions
  ) -> [UIApplication.LaunchOptionsKey: Any]? {
    var options: [UIApplication.LaunchOptionsKey: Any] = [:]

    if let url = connectionOptions.urlContexts.first?.url {
      options[.url] = url
    }

    if let userActivity = connectionOptions.userActivities.first {
      options[.userActivityDictionary] = [
        UIApplication.LaunchOptionsKey.userActivityType: userActivity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": userActivity,
      ] as [AnyHashable: Any]
    }

    return options.isEmpty ? nil : options
  }
}
