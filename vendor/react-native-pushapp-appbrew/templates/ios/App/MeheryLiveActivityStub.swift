import Foundation

// MARK: - Live Activity stub
// Use INSTEAD of MeheryLiveActivity.swift when you are not adding Live Activity.
// AppDelegate calls these two functions; this keeps it compiling without the
// widget extension, DeliveryActivityAttributes or an App Group.

extension AppDelegate {
  func shouldStartLiveActivity(merged: [String: Any]) -> Bool { false }

  @available(iOS 16.1, *)
  func startLiveActivity(userInfo: [AnyHashable: Any], completion: (() -> Void)? = nil) {
    completion?()
  }
}
