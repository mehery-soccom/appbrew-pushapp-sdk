import Foundation
import UIKit

// MARK: - Payload helpers (required)
// Used by AppDelegate: merges FCM `data` into userInfo, detects silent pushes and
// data-only pushes. Needed whether or not you use Live Activity.

extension AppDelegate {
  func mergedNotificationFields(_ userInfo: [AnyHashable: Any]) -> [String: Any] {
    var merged: [String: Any] = [:]
    for (k, v) in userInfo {
      merged[String(describing: k)] = v
    }
    if let dataDict = userInfo["data"] as? [AnyHashable: Any] {
      for (k, v) in dataDict {
        merged[String(describing: k)] = v
      }
    } else if let dataStr = userInfo["data"] as? String,
              let data = dataStr.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      for (k, v) in obj {
        merged[k] = v
      }
    }
    return merged
  }

  func dictToAnyHashable(_ dict: [String: Any]) -> [AnyHashable: Any] {
    var out: [AnyHashable: Any] = [:]
    for (k, v) in dict { out[k] = v }
    return out
  }

  /// When FCM is data-only, APNs often has only `content-available` — no system banner.
  func apnsPayloadIncludesVisibleAlert(_ userInfo: [AnyHashable: Any]) -> Bool {
    guard let aps = userInfo["aps"] as? [String: Any] else { return false }
    if let alert = aps["alert"] as? String, !alert.isEmpty { return true }
    if let alert = aps["alert"] as? [String: Any] {
      let title = stringFromAny(alert["title"])?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      let body = stringFromAny(alert["body"])?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      if !title.isEmpty || !body.isEmpty { return true }
    }
    return false
  }

  func isSilentNoUiPush(merged: [String: Any], userInfo: [AnyHashable: Any]) -> Bool {
    let candidates = [
      stringFromAny(merged["type"]),
      stringFromAny(userInfo["type"]),
    ]
    if let dataDict = userInfo["data"] as? [AnyHashable: Any] {
      if let t = stringFromAny(dataDict["type"]), Self.silentNoUiTypes.contains(t) {
        return true
      }
    } else if let dataStr = userInfo["data"] as? String,
              let d = dataStr.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
              let t = stringFromAny(obj["type"]),
              Self.silentNoUiTypes.contains(t) {
      return true
    }
    return candidates.compactMap { $0 }.contains { Self.silentNoUiTypes.contains($0) }
  }

  private static let silentNoUiTypes: Set<String> = [
    "silent_keepalive",
    "silent_daily_ping",
  ]

  func stringFromAny(_ value: Any?) -> String? {
    if let s = value as? String { return s }
    if let s = value as? NSString { return s as String }
    if let n = value as? NSNumber { return n.stringValue }
    return nil
  }
}
