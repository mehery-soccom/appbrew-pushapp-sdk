import UserNotifications
import Firebase

class NotificationService: UNNotificationServiceExtension {

    var contentHandler: ((UNNotificationContent) -> Void)?
    var bestAttemptContent: UNMutableNotificationContent?

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler

        guard let bestAttemptContent = (request.content.mutableCopy() as? UNMutableNotificationContent) else {
            contentHandler(request.content)
            return
        }
        self.bestAttemptContent = bestAttemptContent


        // Use Firebase Messaging to process the notification, e.g., for image attachments.
        // This will call the contentHandler for you after it's done.
        Messaging.serviceExtension().populateNotificationContent(bestAttemptContent, withContentHandler: contentHandler)
    }

    override func serviceExtensionTimeWillExpire() {
        // Called just before the extension is terminated by the system.
        // Use this as a last chance to deliver the modified content, otherwise the original push payload will be used.
        if let contentHandler = contentHandler, let bestAttemptContent = bestAttemptContent {
            contentHandler(bestAttemptContent)
        }
    }

}
