import Foundation
import UIKit
import ActivityKit

// MARK: - Live Activity (PushApp / Mehery)
// Ported from Mehery example AppDelegate Live Activity helpers.
// Requires DeliveryActivityLiveActivity.swift (Attributes) on the natori target
// and the DeliveryActivity widget extension with matching App Group.

extension AppDelegate {
  static let meheryLiveActivityAppGroup = MeheryAppGroup.liveActivity

  /// Ephemeral session with explicit timeouts so background pushes finish before suspend.
  private static let liveActivityImageURLSession: URLSession = {
    let c = URLSessionConfiguration.ephemeral
    c.timeoutIntervalForRequest = 22
    c.timeoutIntervalForResource = 30
    c.waitsForConnectivity = true
    c.httpCookieStorage = nil
    c.urlCache = nil
    c.requestCachePolicy = .reloadIgnoringLocalCacheData
    return URLSession(configuration: c)
  }()

  /// Avoid blank Live Activity on simple pushes that only carry `activity_id`.
  func shouldStartLiveActivity(merged: [String: Any]) -> Bool {
    let activityId =
      stringFromAny(merged["activity_id"])?.trimmingCharacters(in: .whitespacesAndNewlines)
      ?? ""
    guard !activityId.isEmpty else { return false }

    for key in ["live_activity", "enable_live_activity"] {
      let flag =
        stringFromAny(merged[key])?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        ?? ""
      if flag == "true" || flag == "1" || flag == "yes" { return true }
    }

    for key in ["message1", "message2", "message3"] {
      let text =
        stringFromAny(merged[key])?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      if !text.isEmpty { return true }
    }

    if let progress = parseDouble(merged["progressPercent"]), progress > 0 { return true }
    if let progress = parseDouble(merged["progress_percent"]), progress > 0 { return true }
    if firstPushImageUrlString(fromMerged: merged) != nil { return true }

    return false
  }

  @available(iOS 16.1, *)
  func startLiveActivity(userInfo: [AnyHashable: Any], completion: (() -> Void)? = nil) {
    let merged = mergedNotificationFields(userInfo)
    let progressPercent = parseDouble(merged["progressPercent"]) ?? 0

    DispatchQueue.global(qos: .userInitiated).async { [self] in
      let imageFileName = saveLiveActivityImage(merged: merged)
      let state = buildLiveActivityState(
        userInfo: userInfo,
        progressPercent: progressPercent,
        imageFileName: imageFileName
      )

      Task { @MainActor in
        defer { completion?() }

        if #available(iOS 16.2, *) {
          if let activity = Activity<DeliveryActivityAttributes>.activities.first {
            await activity.update(ActivityContent(state: state, staleDate: nil))
            print("🟢 Updated Live Activity: \(activity.id)")
            return
          }
        }

        do {
          let activity = try Activity<DeliveryActivityAttributes>.request(
            attributes: DeliveryActivityAttributes(),
            contentState: state,
            pushType: .token
          )
          print("🟢 Started Live Activity: \(activity.id)")

          Task {
            for await tokenData in activity.pushTokenUpdates {
              let pushToken = tokenData.map { String(format: "%02x", $0) }.joined()
              print("📡 Live Activity Push Token: \(pushToken)")
            }
          }
        } catch {
          print("❌ Live Activity start error: \(error)")
        }
      }
    }
  }

  @available(iOS 16.1, *)
  private func buildLiveActivityState(
    userInfo: [AnyHashable: Any],
    progressPercent: Double,
    imageFileName: String?
  ) -> DeliveryActivityAttributes.ContentState {
    let merged = mergedNotificationFields(userInfo)
    let imageUrlString = firstPushImageUrlString(fromMerged: merged)
    return DeliveryActivityAttributes.ContentState(
      message1: stringFromAny(merged["message1"]) ?? "",
      message2: stringFromAny(merged["message2"]) ?? "",
      message3: stringFromAny(merged["message3"]) ?? "",
      message1FontSize: parseDouble(merged["message1FontSize"]) ?? 14,
      message1FontColorHex: stringFromAny(merged["message1FontColorHex"]) ?? "#000000",
      line1_font_text_styles: parseStringArray(merged["line1_text_styles"])
        ?? parseStringArray(merged["line1_font_text_styles"]) ?? [],
      message2FontSize: parseDouble(merged["message2FontSize"]) ?? 14,
      message2FontColorHex: stringFromAny(merged["message2FontColorHex"]) ?? "#000000",
      line2_font_text_styles: parseStringArray(merged["line2_text_styles"])
        ?? parseStringArray(merged["line2_font_text_styles"]) ?? [],
      message3FontSize: parseDouble(merged["message3FontSize"]) ?? 14,
      message3FontColorHex: stringFromAny(merged["message3FontColorHex"]) ?? "#000000",
      line3_font_text_styles: parseStringArray(merged["line3_text_styles"])
        ?? parseStringArray(merged["line3_font_text_styles"]) ?? [],
      backgroundColorHex: stringFromAny(merged["backgroundColorHex"]) ?? "#FFFFFF",
      fontColorHex: stringFromAny(merged["fontColorHex"]) ?? "#000000",
      progressColorHex: stringFromAny(merged["progressColorHex"]) ?? "#0000FF",
      fontSize: parseDouble(merged["fontSize"]) ?? 14,
      progressPercent: progressPercent,
      align: stringFromAny(merged["align"]) ?? "left",
      bg_color_gradient: stringFromAny(merged["bg_color_gradient"]) ?? "",
      bg_color_gradient_dir: stringFromAny(merged["bg_color_gradient_dir"]) ?? "",
      imageFileName: imageFileName,
      imageUrl: imageUrlString
    )
  }

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

  private func firstPushImageUrlString(fromMerged merged: [String: Any]) -> String? {
    if let u = imageUrlFromLiveTemplatePayloads(merged) { return u }
    return extractPushImageUrlStrings(fromMerged: merged).first
  }

  private func imageUrlFromLiveTemplatePayloads(_ merged: [String: Any]) -> String? {
    func trimmed(_ value: Any?) -> String? {
      guard let s = stringFromAny(value)?.trimmingCharacters(in: .whitespacesAndNewlines),
            !s.isEmpty
      else { return nil }
      return s
    }
    func firstKey(in dict: [String: Any], keys: [String]) -> String? {
      for k in keys {
        if let v = trimmed(dict[k]) { return v }
      }
      return nil
    }

    let heroKeys = ["imageUrl", "image_url", "image", "styled_image", "styledImage", "media-url"]
    let logoKeys = ["logoUrl", "logo_url", "logo", "iconUrl", "icon_url", "icon"]

    if let u = firstKey(in: merged, keys: heroKeys) { return u }
    if let u = firstKey(in: merged, keys: logoKeys) { return u }

    if let td = merged["templateData"] as? String,
       let data = td.data(using: .utf8),
       let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      if let u = firstKey(in: obj, keys: heroKeys) { return u }
      if let u = firstKey(in: obj, keys: logoKeys) { return u }
      if let style = obj["style"] as? [String: Any] {
        if let u = firstKey(in: style, keys: heroKeys) { return u }
        if let u = firstKey(in: style, keys: logoKeys) { return u }
      }
    }

    if let tmpl = merged["template"] as? [String: Any],
       let data = tmpl["data"] as? [String: Any] {
      if let u = firstKey(in: data, keys: heroKeys) { return u }
      if let u = firstKey(in: data, keys: logoKeys) { return u }
    }

    return nil
  }

  private func extractPushImageUrlStrings(fromMerged merged: [String: Any]) -> [String] {
    func parseSingleString(_ value: Any?) -> String? {
      stringFromAny(value)?.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    func parseStringList(_ value: Any?) -> [String]? {
      if let arr = value as? [String] { return arr }
      if let arr = value as? [Any] { return arr.compactMap { parseSingleString($0) } }
      if let s = parseSingleString(value), !s.isEmpty {
        if let data = s.data(using: .utf8),
           let parsed = try? JSONSerialization.jsonObject(with: data) as? [Any] {
          let mapped = parsed.compactMap { parseSingleString($0) }.filter { !$0.isEmpty }
          if !mapped.isEmpty { return mapped }
        }
        let split = s
          .split(separator: ",")
          .map {
            String($0)
              .trimmingCharacters(in: .whitespacesAndNewlines)
              .trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
          }
          .filter { !$0.isEmpty }
        return split.isEmpty ? nil : split
      }
      return nil
    }

    var imageUrls: [String] = []
    let heroKeys = ["imageUrl", "image_url", "image", "styled_image", "styledImage", "media-url"]
    let logoKeys = ["logoUrl", "logo_url", "logo", "iconUrl", "icon_url", "icon"]

    for key in heroKeys {
      if let value = parseSingleString(merged[key]), !value.isEmpty {
        imageUrls = [value]
        break
      }
    }
    if imageUrls.isEmpty {
      for key in logoKeys {
        if let value = parseSingleString(merged[key]), !value.isEmpty {
          imageUrls = [value]
          break
        }
      }
    }
    if imageUrls.isEmpty,
       let fcmOptions = merged["fcm_options"] as? [String: Any],
       let nested = parseSingleString(fcmOptions["image"]), !nested.isEmpty {
      imageUrls = [nested]
    }
    if imageUrls.isEmpty {
      for key in ["image_urls", "imageUrls", "carousel_images", "images", "media-url"] {
        if let values = parseStringList(merged[key]), !values.isEmpty {
          imageUrls = values
          break
        }
      }
    }
    if imageUrls.isEmpty {
      for index in 1...32 {
        if let value = parseSingleString(merged["image\(index)"]), !value.isEmpty {
          imageUrls.append(value)
        }
      }
    }

    return imageUrls
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
  }

  private func parseDouble(_ value: Any?) -> Double? {
    if let d = value as? Double { return d }
    if let i = value as? Int { return Double(i) }
    if let s = value as? String, let d = Double(s) { return d }
    return nil
  }

  private func parseStringArray(_ value: Any?) -> [String]? {
    if let arr = value as? [String] { return arr }
    if let arr = value as? [Any] { return arr.compactMap { $0 as? String } }
    if let s = value as? String, !s.isEmpty {
      if let data = s.data(using: .utf8),
         let parsed = try? JSONSerialization.jsonObject(with: data) as? [String] {
        return parsed
      }
      return s.split(separator: ",").map { String($0.trimmingCharacters(in: .whitespaces)) }
    }
    return nil
  }

  private static func isRenderableImageData(_ data: Data) -> Bool {
    !data.isEmpty && UIImage(data: data) != nil
  }

  private func saveLiveActivityImage(merged: [String: Any]) -> String? {
    guard let imageUrl = firstPushImageUrlString(fromMerged: merged), !imageUrl.isEmpty,
          let url = URL(string: imageUrl)
    else {
      print("📷 Live Activity: no image URL in merged payload")
      return nil
    }

    if url.scheme?.lowercased() != "https" {
      print(
        "📷 Live Activity: image URL must use https (scheme was \(url.scheme ?? "nil"))"
      )
      return nil
    }

    guard
      let containerURL = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: MeheryAppGroup.liveActivity
      )
    else {
      print(
        "📷 Live Activity: app group container missing — enable App Groups on main app + DeliveryActivityExtension (\(MeheryAppGroup.liveActivity))"
      )
      return nil
    }

    let ext: String = {
      let p = url.pathExtension.lowercased()
      if !p.isEmpty, p.count <= 5 { return p }
      return "jpg"
    }()
    let fileName = "live_activity_\(UUID().uuidString).\(ext)"
    let fileURL = containerURL.appendingPathComponent(fileName)

    var result: String?
    let semaphore = DispatchSemaphore(value: 0)
    Self.liveActivityImageURLSession.dataTask(with: url) { data, _, error in
      defer { semaphore.signal() }
      if let error = error {
        print("📷 Live Activity image download failed: \(error.localizedDescription)")
        return
      }
      guard let data = data, !data.isEmpty else {
        print("📷 Live Activity image download: empty data")
        return
      }
      guard Self.isRenderableImageData(data) else {
        print(
          "📷 Live Activity image: response is not a decodable image (wrong URL or HTML error page)"
        )
        return
      }
      do {
        try data.write(to: fileURL, options: [.atomic])
        result = fileName
        print("📷 Live Activity image saved: \(fileName) (\(data.count) bytes)")
      } catch {
        print("📷 Live Activity image write failed: \(error.localizedDescription)")
      }
    }.resume()
    _ = semaphore.wait(timeout: .now() + 35)
    if result == nil {
      print("📷 Live Activity image: timed out or failed for URL \(imageUrl)")
    }
    return result
  }
}
