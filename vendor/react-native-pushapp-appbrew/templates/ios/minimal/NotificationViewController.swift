import UIKit
import UserNotifications
import UserNotificationsUI

/// PushApp content extension: title, body and a swipeable image carousel.
/// Programmatic: no storyboard. Set NSExtensionPrincipalClass to
/// $(PRODUCT_MODULE_NAME).NotificationViewController in this target's Info.plist.
class NotificationViewController: UIViewController, UNNotificationContentExtension, UIScrollViewDelegate {
    private let titleLabel = UILabel()
    private let bodyLabel = UILabel()
    private let scrollView = UIScrollView()
    private let pageControl = UIPageControl()
    private var imageViews: [UIImageView] = []
    private var timer: Timer?
    private let aspect: CGFloat = 9.0 / 16.0

    override func viewDidLoad() {
        super.viewDidLoad()
        titleLabel.font = .systemFont(ofSize: 17, weight: .semibold)
        titleLabel.numberOfLines = 0
        bodyLabel.font = .systemFont(ofSize: 14)
        bodyLabel.numberOfLines = 0
        bodyLabel.textColor = .secondaryLabel
        scrollView.isPagingEnabled = true
        scrollView.showsHorizontalScrollIndicator = false
        scrollView.delegate = self
        scrollView.layer.cornerRadius = 12
        scrollView.clipsToBounds = true
        pageControl.hidesForSinglePage = true
        [titleLabel, bodyLabel, scrollView, pageControl].forEach { view.addSubview($0) }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let pad: CGFloat = 16, w = view.bounds.width - pad * 2
        let t = titleLabel.sizeThatFits(CGSize(width: w, height: .greatestFiniteMagnitude))
        titleLabel.frame = CGRect(x: pad, y: 12, width: w, height: t.height)
        let b = bodyLabel.sizeThatFits(CGSize(width: w, height: .greatestFiniteMagnitude))
        bodyLabel.frame = CGRect(x: pad, y: titleLabel.frame.maxY + 4, width: w, height: b.height)
        var y = bodyLabel.frame.maxY + 8
        if !imageViews.isEmpty {
            let h = (w * aspect).rounded()
            scrollView.frame = CGRect(x: pad, y: y, width: w, height: h)
            scrollView.contentSize = CGSize(width: w * CGFloat(imageViews.count), height: h)
            for (i, iv) in imageViews.enumerated() {
                iv.frame = CGRect(x: w * CGFloat(i), y: 0, width: w, height: h)
            }
            pageControl.frame = CGRect(x: pad, y: scrollView.frame.maxY, width: w, height: 24)
            y = pageControl.frame.maxY
        }
        preferredContentSize = CGSize(width: view.bounds.width, height: y + 8)
    }

    func didReceive(_ notification: UNNotification) {
        let content = notification.request.content
        titleLabel.text = content.title
        bodyLabel.text = content.body

        // The service extension attaches every image; fall back to the URL list if it timed out.
        for attachment in content.attachments where attachment.identifier.hasPrefix("image_") {
            _ = attachment.url.startAccessingSecurityScopedResource()
            defer { attachment.url.stopAccessingSecurityScopedResource() }
            if let data = try? Data(contentsOf: attachment.url), let img = UIImage(data: data) { add(img) }
        }
        if imageViews.isEmpty, let urls = content.userInfo["images"] as? [String] {
            for s in urls { if let u = URL(string: s) { load(u) } }
        }
        pageControl.numberOfPages = imageViews.count
        startTimer()
        view.setNeedsLayout()
    }

    // MARK: - Carousel

    private func add(_ image: UIImage) {
        let iv = UIImageView(image: image)
        iv.contentMode = .scaleAspectFill
        iv.clipsToBounds = true
        scrollView.addSubview(iv)
        imageViews.append(iv)
        pageControl.numberOfPages = imageViews.count
        view.setNeedsLayout()
    }

    private func load(_ url: URL) {
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let data = data, let img = UIImage(data: data) else { return }
            DispatchQueue.main.async { self?.add(img); self?.startTimer() }
        }.resume()
    }

    private func startTimer() {
        timer?.invalidate()
        guard imageViews.count > 1 else { return }
        timer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in
            guard let self = self, self.scrollView.bounds.width > 0 else { return }
            let next = (self.pageControl.currentPage + 1) % self.imageViews.count
            self.scrollView.setContentOffset(CGPoint(x: self.scrollView.bounds.width * CGFloat(next), y: 0), animated: true)
        }
    }

    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        guard scrollView.bounds.width > 0 else { return }
        pageControl.currentPage = Int((scrollView.contentOffset.x / scrollView.bounds.width).rounded())
    }

    // Buttons: the system draws the actions registered for the category; let them through.
    func didReceive(_ response: UNNotificationResponse,
                    completionHandler completion: @escaping (UNNotificationContentExtensionResponseOption) -> Void) {
        completion(.dismissAndForwardAction)
    }

    deinit { timer?.invalidate() }
}
