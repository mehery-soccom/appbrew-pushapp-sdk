import Foundation
import React
import UserNotifications

@objc(PushTokenManager)
class PushTokenManager: RCTEventEmitter {

  @objc static var shared: PushTokenManager?

  private static let pendingNotificationKey = "mehery_pending_notification_event_json"

  /// Buffered when sendTokenEvent runs before the RN module is constructed.
  private static var pendingToken: (type: String, token: String)?
  private static let lastTokenDefaultsKey = "mehery_last_push_token"

  private var hasListeners = false
  private var lastToken: (type: String, token: String)?
  private var lastNotificationPayload: [String: Any]?

  override init() {
    super.init()
    PushTokenManager.shared = self
    if let pending = PushTokenManager.pendingToken {
      lastToken = pending
      PushTokenManager.pendingToken = nil
    } else if lastToken == nil {
      lastToken = PushTokenManager.storedLastToken()
    }
    DispatchQueue.main.async {
      PushTokenManager.flushPendingNotificationFromColdStartIfNeeded()
    }
  }

  override func supportedEvents() -> [String]! {
    return ["PushTokenEvent", "PushNotificationEvent"]
  }

  override static func requiresMainQueueSetup() -> Bool {
    return true
  }

  override func startObserving() {
    hasListeners = true

    if let saved = lastToken {
      sendEvent(withName: "PushTokenEvent", body: [
        "type": saved.type,
        "token": saved.token
      ])
    }

    if let payload = lastNotificationPayload {
      sendEvent(withName: "PushNotificationEvent", body: payload)
    }
  }

  override func stopObserving() {
    hasListeners = false
  }

  @objc static func sendTokenEvent(_ type: String, token: String) {
    persistLastToken(type: type, token: token)
    DispatchQueue.main.async {
      guard let instance = PushTokenManager.shared else {
        print("⚠️ PushTokenManager.shared is nil — buffering \(type) token for RN init")
        pendingToken = (type, token)
        return
      }

      instance.lastToken = (type, token)

      if instance.hasListeners {
        instance.sendEvent(withName: "PushTokenEvent", body: [
          "type": type,
          "token": token
        ])
      } else {
        print("⚠️ No JS listeners for PushTokenEvent yet — saved for later.")
      }
    }
  }

  /// JS bridge used by the SDK (`NativeModules.PushTokenManager.sendPushToken`).
  /// Declared in PushTokenManager.m — missing Swift impl logs "JS method signature NOT FOUND".
  @objc func sendPushToken(_ type: String, token: String) {
    PushTokenManager.sendTokenEvent(type, token: token)
  }

  private static func persistLastToken(type: String, token: String) {
    UserDefaults.standard.set(["type": type, "token": token], forKey: lastTokenDefaultsKey)
  }

  private static func storedLastToken() -> (type: String, token: String)? {
    guard let dict = UserDefaults.standard.dictionary(forKey: lastTokenDefaultsKey),
          let type = dict["type"] as? String,
          let token = dict["token"] as? String,
          !token.isEmpty else {
      return nil
    }
    return (type, token)
  }

  private static func persistPendingNotification(_ payload: [AnyHashable: Any]) {
    var clean: [String: Any] = [:]
    payload.forEach { clean[String(describing: $0.key)] = $0.value }
    guard JSONSerialization.isValidJSONObject(clean),
          let data = try? JSONSerialization.data(withJSONObject: clean, options: []) else {
      print("⚠️ Mehery: could not serialize pending notification for cold start")
      return
    }
    UserDefaults.standard.set(data, forKey: pendingNotificationKey)
    print("📦 Mehery: buffered push notification for JS (bridge not ready)")
  }

  /// When the app opens from a killed state, `shared` may still be nil — queue until RN inits the module.
  @objc static func sendNotificationEventOrQueue(_ payload: [AnyHashable: Any]) {
    DispatchQueue.main.async {
      guard PushTokenManager.shared != nil else {
        persistPendingNotification(payload)
        return
      }
      sendNotificationEvent(payload)
    }
  }

  static func flushPendingNotificationFromColdStartIfNeeded() {
    guard let data = UserDefaults.standard.data(forKey: pendingNotificationKey) else { return }
    UserDefaults.standard.removeObject(forKey: pendingNotificationKey)
    guard !data.isEmpty,
          let obj = try? JSONSerialization.jsonObject(with: data) as? [AnyHashable: Any] else {
      return
    }
    print("📦 Mehery: delivering buffered push notification to JS")
    sendNotificationEvent(obj)
  }

  @objc static func sendNotificationEvent(_ payload: [AnyHashable: Any]) {
    DispatchQueue.main.async {
      guard let instance = PushTokenManager.shared else {
        print("⚠️ PushTokenManager.shared is nil — RN module not initialized yet.")
        return
      }

      var cleanPayload: [String: Any] = [:]
      payload.forEach { key, value in
        cleanPayload[String(describing: key)] = value
      }

      instance.lastNotificationPayload = cleanPayload

      if instance.hasListeners {
        instance.sendEvent(
          withName: "PushNotificationEvent",
          body: cleanPayload
        )
      }
    }
  }

  /// Schedules a local notification (foreground FCM / background data-only without `aps.alert`).
  /// Images are downloaded and attached here (iOS 26+ removed UNMutableNotificationContent.mutableContent).
  @objc static func scheduleDisplayNotification(
    title: String,
    body: String,
    category: String,
    data: [String: Any],
    identifierPrefix: String = "mehery",
    deliverToJs: Bool = true
  ) {
    if isSilentNoUiType(data["type"]) {
      print("⏭️ Mehery: skip scheduleDisplayNotification for silent keep-alive")
      return
    }

    let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
    let trimmedBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
    let imageUrls = extractImageUrlStrings(from: data)
    if trimmedTitle.isEmpty && trimmedBody.isEmpty && imageUrls.isEmpty {
      return
    }

    let content = UNMutableNotificationContent()
    content.title = trimmedTitle
    content.body = trimmedBody
    content.sound = .default
    content.categoryIdentifier = category

    var userInfo: [AnyHashable: Any] = [:]
    for (key, value) in data {
      userInfo[AnyHashable(key)] = value
    }

    if !imageUrls.isEmpty {
      userInfo[AnyHashable("image_urls")] = imageUrls
      userInfo[AnyHashable("imageUrls")] = imageUrls
      userInfo[AnyHashable("images")] = imageUrls
      userInfo[AnyHashable("media-url")] = imageUrls
    }

    var aps = (userInfo[AnyHashable("aps")] as? [String: Any]) ?? [:]
    aps["mutable-content"] = 1
    userInfo[AnyHashable("aps")] = aps
    userInfo[AnyHashable("mutable-content")] = 1
    content.userInfo = userInfo

    let requestId = (data["id"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    let identifier = "\(identifierPrefix)-\(requestId?.isEmpty == false ? requestId! : UUID().uuidString)"

    let deliver: (UNMutableNotificationContent) -> Void = { finalContent in
      let request = UNNotificationRequest(
        identifier: identifier,
        content: finalContent,
        trigger: nil
      )

      UNUserNotificationCenter.current().add(request) { error in
        if let error = error {
          print("❌ Local notification failed: \(error.localizedDescription)")
        } else {
          print(
            "✅ Local notification scheduled (\(finalContent.attachments.count) attachment(s), " +
            "\(imageUrls.count) image URL(s), category=\(category))"
          )
        }
      }

      if deliverToJs {
        sendNotificationEventOrQueue(userInfo)
      }
    }

    if imageUrls.isEmpty {
      deliver(content)
      return
    }

    attachDownloadedImages(urlStrings: imageUrls, to: content) { updatedContent in
      DispatchQueue.main.async {
        deliver(updatedContent)
      }
    }
  }

  private static func attachDownloadedImages(
    urlStrings: [String],
    to content: UNMutableNotificationContent,
    completion: @escaping (UNMutableNotificationContent) -> Void
  ) {
    var attachments = Array<UNNotificationAttachment?>(repeating: nil, count: urlStrings.count)
    let group = DispatchGroup()

    for (index, urlString) in urlStrings.enumerated() {
      guard let url = URL(string: urlString) else { continue }

      group.enter()
      downloadTempFile(url: url) { tempUrl in
        defer { group.leave() }

        guard let tempUrl = tempUrl,
              let attachment = try? UNNotificationAttachment(
                identifier: "image_\(index)",
                url: tempUrl
              ) else {
          return
        }

        attachments[index] = attachment
      }
    }

    group.notify(queue: .global(qos: .userInitiated)) {
      let validAttachments = attachments.compactMap { $0 }
      if !validAttachments.isEmpty {
        content.attachments = validAttachments
      }
      completion(content)
    }
  }

  private static func downloadTempFile(
    url: URL,
    completion: @escaping (URL?) -> Void
  ) {
    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = 12
    config.timeoutIntervalForResource = 12

    URLSession(configuration: config).downloadTask(with: url) { location, response, error in
      guard error == nil, let location = location else {
        completion(nil)
        return
      }

      let tempDir = NSTemporaryDirectory()
      let ext = fileExtension(for: response, fallbackURL: url)
      let fileUrl = URL(fileURLWithPath: tempDir)
        .appendingPathComponent("mehery_img_\(UUID().uuidString)\(ext)")

      do {
        try FileManager.default.moveItem(at: location, to: fileUrl)
        completion(fileUrl)
      } catch {
        completion(nil)
      }
    }.resume()
  }

  private static func fileExtension(for response: URLResponse?, fallbackURL: URL) -> String {
    if let mime = (response as? HTTPURLResponse)?.mimeType?.lowercased() {
      if mime.contains("jpeg") || mime.contains("jpg") { return ".jpg" }
      if mime.contains("png") { return ".png" }
      if mime.contains("gif") { return ".gif" }
      if mime.contains("webp") { return ".webp" }
    }
    let pathExt = fallbackURL.pathExtension.lowercased()
    switch pathExt {
    case "jpg", "jpeg": return ".jpg"
    case "png", "gif", "webp": return ".\(pathExt)"
    default: return ".jpg"
    }
  }

  @objc func showForegroundNotification(_ payload: NSDictionary) {
    DispatchQueue.main.async {
      if Self.isSilentNoUiType(payload["type"]) {
        return
      }
      let title = (payload["title"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      let body = (payload["body"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      let category = (payload["category"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        ?? "CAROUSEL_CATEGORY"
      let data = payload["data"] as? [String: Any] ?? [:]
      if Self.isSilentNoUiType(data["type"]) {
        return
      }

      PushTokenManager.scheduleDisplayNotification(
        title: title,
        body: body,
        category: category,
        data: data,
        identifierPrefix: "mehery-fg"
      )
    }
  }

  private static func isSilentNoUiType(_ value: Any?) -> Bool {
    guard let s = value as? String else { return false }
    return s == "silent_keepalive" || s == "silent_daily_ping"
  }

    private static func extractImageUrlStrings(from data: [String: Any]) -> [String] {
    let listKeys = ["image_urls", "imageUrls", "carousel_images", "images", "media-url"]
    var listCandidates: [[String]] = []

    for dict in dictsToScanForImages(data) {
      for key in listKeys {
        if let values = parseStringList(dict[key])?.filter({ isHttpUrl($0) }), values.count >= 2 {
          listCandidates.append(values)
        }
      }
      var indexed: [String] = []
      for index in 1...32 {
        if let value = parseSingleString(dict["image\(index)"]), isHttpUrl(value) {
          indexed.append(value)
        } else if index == 1 {
          continue
        } else {
          break
        }
      }
      if indexed.count >= 2 {
        listCandidates.append(indexed)
      }
    }

    if let longest = listCandidates.max(by: { $0.count < $1.count }) {
      return uniquedStrings(longest)
    }

    if let fcmOptions = jsonObject(from: data["fcm_options"]),
       let nested = parseSingleString(fcmOptions["image"]),
       isHttpUrl(nested) {
      return [nested]
    }

    for dict in dictsToScanForImages(data) {
      for key in ["image_url", "imageUrl", "image", "media-url"] {
        if let value = parseSingleString(dict[key]), isHttpUrl(value) {
          return [value]
        }
      }
      for key in listKeys {
        if let values = parseStringList(dict[key])?.filter({ isHttpUrl($0) }), values.count == 1 {
          return values
        }
      }
    }
    return []
  }

  private static func isHttpUrl(_ value: String) -> Bool {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://")
  }

  private static func dictsToScanForImages(_ data: [String: Any]) -> [[String: Any]] {
    var dicts: [[String: Any]] = [data]
    if let obj = jsonObject(from: data["templateData"]) {
      dicts.append(obj)
      if let style = jsonObject(from: obj["style"]) { dicts.append(style) }
    }
    if let style = jsonObject(from: data["style"]) { dicts.append(style) }
    if let tmpl = jsonObject(from: data["template"]) {
      if let nested = jsonObject(from: tmpl["data"]) { dicts.append(nested) }
      if let style = jsonObject(from: tmpl["style"]) { dicts.append(style) }
    }
    return dicts
  }

  private static func jsonObject(from raw: Any?) -> [String: Any]? {
    if let dict = raw as? [String: Any] { return dict }
    if let dict = raw as? [AnyHashable: Any] {
      var out: [String: Any] = [:]
      for (k, v) in dict { out[String(describing: k)] = v }
      return out
    }
    if let str = raw as? String,
       let data = str.data(using: .utf8),
       let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      return obj
    }
    return nil
  }

  private static func uniquedStrings(_ values: [String]) -> [String] {
    var out: [String] = []
    for value in values where !out.contains(value) {
      out.append(value)
    }
    return out
  }

  private static func parseSingleString(_ value: Any?) -> String? {
    if let str = value as? String {
      return str.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    if let str = value as? NSString {
      return str.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    return nil
  }

  private static func parseStringList(_ value: Any?) -> [String]? {
    if let arr = value as? [String] {
      return arr.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    }
    if let arr = value as? [Any] {
      let mapped = arr.compactMap { parseSingleString($0) }.filter { !$0.isEmpty }
      return mapped.isEmpty ? nil : mapped
    }
    if let str = parseSingleString(value), !str.isEmpty {
      if let data = str.data(using: .utf8),
         let parsed = try? JSONSerialization.jsonObject(with: data) as? [Any] {
        let mapped = parsed.compactMap { parseSingleString($0) }.filter { !$0.isEmpty }
        if !mapped.isEmpty { return mapped }
      }
      let split = str
        .split(separator: ",")
        .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "\"'")) }
        .filter { !$0.isEmpty }
      return split.isEmpty ? nil : split
    }
    return nil
  }

  @objc func getLastToken(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    if let saved = lastToken ?? PushTokenManager.storedLastToken() {
      resolve([
        "type": saved.type,
        "token": saved.token
      ])
    } else {
      resolve(nil)
    }
  }
}
