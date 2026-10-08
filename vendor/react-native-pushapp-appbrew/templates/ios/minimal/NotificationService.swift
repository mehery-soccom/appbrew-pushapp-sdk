import UserNotifications
import UIKit

/// PushApp service extension: downloads the image(s) in the payload and attaches them.
/// Also writes the full list to userInfo["images"] so the content extension can build a carousel.
class NotificationService: UNNotificationServiceExtension {
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var bestAttempt: UNMutableNotificationContent?

    override func didReceive(_ request: UNNotificationRequest,
                             withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler
        guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
            contentHandler(request.content); return
        }
        bestAttempt = content

        let info = Self.flatten(request.content.userInfo)
        let urls = Self.imageUrls(from: info)
        guard !urls.isEmpty else { contentHandler(content); return }

        // Hand the whole list to the content extension (carousel).
        var updated = info
        updated["images"] = urls
        updated["media-url"] = urls
        content.userInfo = updated

        let group = DispatchGroup()
        var attachments = [UNNotificationAttachment?](repeating: nil, count: urls.count)
        for (i, s) in urls.enumerated() {
            guard let url = URL(string: s) else { continue }
            group.enter()
            Self.download(url) { file in
                if let file = file {
                    attachments[i] = try? UNNotificationAttachment(identifier: "image_\(i)", url: file)
                }
                group.leave()
            }
        }
        group.notify(queue: .main) {
            content.attachments = attachments.compactMap { $0 }
            contentHandler(content)
        }
    }

    override func serviceExtensionTimeWillExpire() {
        if let handler = contentHandler, let content = bestAttempt { handler(content) }
    }

    // MARK: - Payload

    /// FCM often nests custom keys under `data` (dictionary or JSON string).
    private static func flatten(_ userInfo: [AnyHashable: Any]) -> [AnyHashable: Any] {
        var merged = userInfo
        if let d = userInfo["data"] as? [AnyHashable: Any] {
            d.forEach { merged[$0.key] = $0.value }
        } else if let s = userInfo["data"] as? String,
                  let data = s.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            obj.forEach { merged[$0.key] = $0.value }
        }
        return merged
    }

    private static func imageUrls(from info: [AnyHashable: Any]) -> [String] {
        func str(_ v: Any?) -> String? {
            let s = (v as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            return (s?.isEmpty == false) ? s : nil
        }
        func list(_ v: Any?) -> [String] {
            if let a = v as? [Any] { return a.compactMap { str($0) } }
            if let s = str(v) {
                if let d = s.data(using: .utf8), let a = try? JSONSerialization.jsonObject(with: d) as? [Any] {
                    return a.compactMap { str($0) }
                }
                return s.split(separator: ",").map { String($0).trimmingCharacters(in: .whitespaces) }
                    .filter { !$0.isEmpty }
            }
            return []
        }
        if let fcm = info["fcm_options"] as? [AnyHashable: Any], let s = str(fcm["image"]) { return [s] }
        for key in ["image_urls", "imageUrls", "carousel_images", "images", "media-url"] {
            let l = list(info[key]); if !l.isEmpty { return l }
        }
        for key in ["image_url", "imageUrl", "image"] {
            if let s = str(info[key]) { return [s] }
        }
        var out: [String] = []   // image1, image2, ...
        var i = 1
        while let s = str(info["image\(i)"]) { out.append(s); i += 1 }
        return out
    }

    // MARK: - Download

    private static func download(_ url: URL, completion: @escaping (URL?) -> Void) {
        let cfg = URLSessionConfiguration.ephemeral
        cfg.timeoutIntervalForRequest = 12
        cfg.timeoutIntervalForResource = 12
        URLSession(configuration: cfg).downloadTask(with: url) { tmp, _, error in
            guard error == nil, let tmp = tmp, let data = try? Data(contentsOf: tmp),
                  // Re-encode as baseline JPEG: iOS shows progressive JPEGs as a white card when expanded.
                  let jpeg = UIImage(data: data)?.jpegData(compressionQuality: 0.9) else {
                completion(nil); return
            }
            let out = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("img_\(UUID().uuidString).jpg")
            completion((try? jpeg.write(to: out, options: .atomic)) != nil ? out : nil)
        }.resume()
    }
}
