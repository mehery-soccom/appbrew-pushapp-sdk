import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import RNBootSplash
import Firebase
import UserNotifications

@main
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate, MessagingDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Firebase must be configured before React Native native modules initialize
    // (RNFB Messaging / Analytics crash if the default app is missing).
    if FirebaseApp.app() == nil {
      FirebaseApp.configure()
    }
    Messaging.messaging().delegate = self
    UNUserNotificationCenter.current().delegate = self
    registerNotificationCategories()

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    // Window + startReactNative move to SceneDelegate (required on iOS 27+ /
    // Xcode 27 SDK). Creating UIWindow(frame:) here triggers
    // UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption.

    // APNs token is independent of alert permission. Waiting on granted=true
    // delayed / skipped registration on TestFlight when the prompt was already
    // answered or the callback raced RN init.
    application.registerForRemoteNotifications()
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
      print("🔐 Notification permission granted: \(granted)")
      if let error = error {
        print("⚠️ Authorization error: \(error.localizedDescription)")
      }
      DispatchQueue.main.async {
        application.registerForRemoteNotifications()
      }
    }

    return true
  }

  // MARK: - UIScene configuration

  func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(
      name: "Default Configuration",
      sessionRole: connectingSceneSession.role
    )
    configuration.delegateClass = SceneDelegate.self
    return configuration
  }

  // MARK: - APNs registration (RNCPushNotificationIOS + Mehery PushTokenManager)

  func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    let apnsToken = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
    print("📲 APNs token: \(apnsToken)")
    Messaging.messaging().apnsToken = deviceToken
    PushTokenManager.sendTokenEvent("apns", token: apnsToken)
    RNCPushNotificationIOS.didRegisterForRemoteNotifications(withDeviceToken: deviceToken)
  }

  func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    print("❌ Failed to register for remote notifications: \(error)")
    RNCPushNotificationIOS.didFailToRegisterForRemoteNotificationsWithError(error)
  }

  // MARK: - Firebase FCM token
  // Match the Mehery example: do NOT forward FCM through PushTokenEvent.
  // That listener treats every token as the APNs `token` field. Registering
  // with FCM then updating to APNs via `/update/token` makes PushApp replace
  // the device session ObjectId with a 32-char hex, and `/device/link` 500s
  // (CastError on SESSION_PUSHAPP). JS still fetches FCM as `fcm_token`.

  // func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
  //   let token = fcmToken ?? ""
  //   print("🔥 FCM token: \(token)")
  //   PushTokenManager.sendTokenEvent("fcm", token: token)
  // }

  // MARK: - Silent / data push (Live Activity)

  func application(
    _ application: UIApplication,
    didReceiveRemoteNotification userInfo: [AnyHashable: Any],
    fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
  ) {
    print("📦 Background push received: \(userInfo)")

    let merged = mergedNotificationFields(userInfo)

    if isSilentNoUiPush(merged: merged, userInfo: userInfo) {
      PushTokenManager.sendNotificationEventOrQueue(dictToAnyHashable(merged))
      RNCPushNotificationIOS.didReceiveRemoteNotification(userInfo)
      completionHandler(.newData)
      return
    }

    PushTokenManager.sendNotificationEventOrQueue(dictToAnyHashable(merged))

    // Data-only FCM (no `aps.alert`) reaches the app but iOS never draws a banner.
    if UIApplication.shared.applicationState != .active,
       !apnsPayloadIncludesVisibleAlert(userInfo) {
      let title = stringFromAny(merged["title"])?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      let body = stringFromAny(merged["body"])?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      let category = stringFromAny(merged["category"])?.trimmingCharacters(in: .whitespacesAndNewlines)
        ?? "CAROUSEL_CATEGORY"
      PushTokenManager.scheduleDisplayNotification(
        title: title,
        body: body,
        category: category,
        data: merged,
        identifierPrefix: "mehery-bg",
        deliverToJs: false
      )
    }

    if #available(iOS 16.1, *) {
      if shouldStartLiveActivity(merged: merged) {
        RNCPushNotificationIOS.didReceiveRemoteNotification(userInfo)
        startLiveActivity(userInfo: userInfo) {
          completionHandler(.newData)
        }
        return
      }
    }

    RNCPushNotificationIOS.didReceiveRemoteNotification(
      userInfo,
      fetchCompletionHandler: completionHandler
    )
  }

  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    if RCTLinkingManager.application(app, open: url, options: options) {
      return true
    }
    return false
  }

  func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    return RCTLinkingManager.application(
      application,
      continue: userActivity,
      restorationHandler: restorationHandler
    )
  }

  // MARK: - Foreground presentation (Mehery / PushApp)

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    let userInfo = notification.request.content.userInfo
    let merged = mergedNotificationFields(userInfo)
    PushTokenManager.sendNotificationEventOrQueue(dictToAnyHashable(merged))
    if isSilentNoUiPush(merged: merged, userInfo: userInfo) {
      completionHandler([])
      return
    }
    if #available(iOS 14.0, *) {
      completionHandler([.banner, .list, .sound, .badge])
    } else {
      completionHandler([.alert, .sound, .badge])
    }
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    RNCPushNotificationIOS.didReceive(response)
    let userInfo = response.notification.request.content.userInfo
    var merged = mergedNotificationFields(userInfo)
    merged["actionIdentifier"] = response.actionIdentifier
    merged["categoryIdentifier"] = response.notification.request.content.categoryIdentifier
    PushTokenManager.sendNotificationEventOrQueue(dictToAnyHashable(merged))
    if let url = urlForNotificationBody(userInfo: userInfo) {
      DispatchQueue.main.async {
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
      }
    }
    completionHandler()
  }

  /// CHANGE THIS: your app's URL scheme(s). http(s) links are always allowed.
  private static let allowedUrlSchemes: [String] = ["your-app-scheme"]

  /// Prefer `notification_url` / `notificationUrl` from PushApp payloads (also nested under `data`).
  private func urlForNotificationBody(userInfo: [AnyHashable: Any]) -> URL? {
    var merged: [AnyHashable: Any] = userInfo
    if let dataDict = userInfo["data"] as? [AnyHashable: Any] {
      for (k, v) in dataDict { merged[k] = v }
    } else if let dataStr = userInfo["data"] as? String,
              let data = dataStr.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [AnyHashable: Any] {
      for (k, v) in obj { merged[k] = v }
    }
    let keys = ["notification_url", "notificationUrl", "url", "deeplink", "deep_link"]
    for key in keys {
      if let raw = merged[key] as? String,
         let url = URL(string: raw),
         let scheme = url.scheme?.lowercased(),
         scheme == "http" || scheme == "https" || Self.allowedUrlSchemes.contains(scheme) {
        return url
      }
    }
    return nil
  }

  // MARK: - PushApp notification categories (carousel + all 2/3-button sets)

  func registerNotificationCategories() {
    let categoryMap: [(String, [(title: String, id: String)])] = [
      ("THREE_BUTTON_CATEGORY", [("Action 1", "PUSHAPP_ACTION_1"), ("Action 2", "PUSHAPP_ACTION_2"), ("Action 3", "PUSHAPP_ACTION_3")]),
      ("THREE_CAROUSEL_CATEGORY", [("Opt In", "PUSHAPP_OPT_IN"), ("Opt MID", "PUSHAPP_OPT_MID"), ("Not Interested", "PUSHAPP_NOT_INTERESTED")]),
      ("THREE_CONFIRMATION_CATEGORY", [("Yes", "PUSHAPP_YES"), ("Maybe", "PUSHAPP_CONFIRM_MID"), ("No", "PUSHAPP_NO")]),
      ("THREE_RESPONSE_CATEGORY", [("Accept", "PUSHAPP_ACCEPT"), ("Later", "PUSHAPP_RESPONSE_MID"), ("Reject", "PUSHAPP_REJECT")]),
      ("THREE_SUBSCRIPTION_CATEGORY", [("Subscribe", "PUSHAPP_SUB"), ("Remind Me", "PUSHAPP_SUB_MID"), ("Unsubscribe", "PUSHAPP_UNSUB")]),
      ("THREE_TRANSACTION_CATEGORY", [("Buy", "PUSHAPP_BUY"), ("Details", "PUSHAPP_TRANSACTION_MID"), ("Sell", "PUSHAPP_SELL")]),
      ("THREE_CONTENT_CATEGORY", [("View", "PUSHAPP_VIEW"), ("Share", "PUSHAPP_CONTENT_MID"), ("Add", "PUSHAPP_ADD")]),
      ("THREE_CHECKOUT_CATEGORY", [("Cart", "PUSHAPP_CART"), ("Save For Later", "PUSHAPP_CHECKOUT_MID"), ("Pay", "PUSHAPP_PAY")]),
      ("THREE_FORM_ACTION_CATEGORY", [("Save", "PUSHAPP_SAVE"), ("Preview", "PUSHAPP_FORM_MID"), ("Submit", "PUSHAPP_SUBMIT")]),
      ("THREE_DESTRUCTIVE_ACTION_CATEGORY", [("Cancel", "PUSHAPP_CANCEL"), ("Archive", "PUSHAPP_DESTRUCTIVE_MID"), ("Delete", "PUSHAPP_DELETE")]),
      ("THREE_CONTACT_CATEGORY", [("Call", "PUSHAPP_CALL"), ("Chat", "PUSHAPP_CONTACT_MID"), ("Email", "PUSHAPP_EMAIL")]),
      ("CAROUSEL_CATEGORY", [("Opt In", "PUSHAPP_OPT_IN"), ("Not Interested", "PUSHAPP_NOT_INTERESTED")]),
      ("CONFIRMATION_CATEGORY", [("Yes", "PUSHAPP_YES"), ("No", "PUSHAPP_NO")]),
      ("RESPONSE_CATEGORY", [("Accept", "PUSHAPP_ACCEPT"), ("Reject", "PUSHAPP_REJECT")]),
      ("SUBSCRIPTION_CATEGORY", [("Subscribe", "PUSHAPP_SUB"), ("Unsubscribe", "PUSHAPP_UNSUB")]),
      ("TRANSACTION_CATEGORY", [("Buy", "PUSHAPP_BUY"), ("Sell", "PUSHAPP_SELL")]),
      ("CONTENT_CATEGORY", [("View", "PUSHAPP_VIEW"), ("Add", "PUSHAPP_ADD")]),
      ("CHECKOUT_CATEGORY", [("Cart", "PUSHAPP_CART"), ("Pay", "PUSHAPP_PAY")]),
      ("FORM_ACTION_CATEGORY", [("Save", "PUSHAPP_SAVE"), ("Submit", "PUSHAPP_SUBMIT")]),
      ("DESTRUCTIVE_ACTION_CATEGORY", [("Cancel", "PUSHAPP_CANCEL"), ("Delete", "PUSHAPP_DELETE")]),
      ("CONTACT_CATEGORY", [("Call", "PUSHAPP_CALL"), ("Email", "PUSHAPP_EMAIL")]),
    ]

    var categories: Set<UNNotificationCategory> = []
    for (categoryId, actionsInfo) in categoryMap {
      let actions = actionsInfo.map {
        UNNotificationAction(identifier: $0.id, title: $0.title, options: [.foreground])
      }
      categories.insert(
        UNNotificationCategory(identifier: categoryId, actions: actions, intentIdentifiers: [], options: [])
      )
    }
    UNUserNotificationCenter.current().setNotificationCategories(categories)
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }

  override func customize(_ rootView: RCTRootView) {
    super.customize(rootView)
    RNBootSplash.initWithStoryboard("BootSplash", rootView: rootView)
  }
}
