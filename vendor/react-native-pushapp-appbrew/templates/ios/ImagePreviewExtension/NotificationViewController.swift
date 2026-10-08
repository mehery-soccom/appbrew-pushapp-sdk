import UIKit
import UserNotifications
import UserNotificationsUI

private enum CarouselLayout {
    static let aspectRatio: CGFloat = 9.0 / 16.0
    static let headerToCarouselGap: CGFloat = 8
    static let pageScrimHeight: CGFloat = 32
    static let pageControlBottomPadding: CGFloat = 8
    static let autoScrollInterval: TimeInterval = 3.0
    static let autoScrollResumeDelay: TimeInterval = 5.0
}

class NotificationViewController: UIViewController, UNNotificationContentExtension, UIScrollViewDelegate, UIGestureRecognizerDelegate {

    // MARK: - Outlets
    @IBOutlet weak var containerView: UIView!
    @IBOutlet weak var titleLabel: UILabel!
    @IBOutlet weak var textLabel: UILabel!
    @IBOutlet weak var logoImageView: UIImageView!

    // MARK: - Properties
    private var images: [UIImage] = []
    private var currentIndex: Int = 0
    private var autoScrollTimer: Timer?
    private var autoScrollResumeWorkItem: DispatchWorkItem?
    private var notification: UNNotification?
    private var carouselNeedsBuild = false
    private var fallbackImageLoadInProgress = false

    private let carouselView = UIView()
    private let carouselScrollView = UIScrollView()
    private var carouselImageViews: [UIImageView] = []
    private let pageScrimView = UIView()
    private let pageControl = UIPageControl()
    private let pageScrimGradient = CAGradientLayer()

    private var carouselLeadingConstraint: NSLayoutConstraint?
    private var carouselTrailingConstraint: NSLayoutConstraint?
    private var carouselTopConstraint: NSLayoutConstraint?
    private var carouselHeightConstraint: NSLayoutConstraint?

    private let styledTitleKeys = ["name", "template_name", "styled_name", "styled_title", "title"]
    private let styledBodyKeys = ["message", "styled_message", "styled_body", "body", "description"]
    private let styledLogoKeys = ["styled_image", "styledImage", "logo_url", "logoUrl", "logo", "icon", "icon_url", "iconUrl"]

    // ---------------------------------------------------------
    // MARK: - viewDidLoad
    // ---------------------------------------------------------
    override func viewDidLoad() {
        super.viewDidLoad()

        view.backgroundColor = .clear
        containerView.backgroundColor = UIColor(red: 0.11, green: 0.11, blue: 0.13, alpha: 0.98)
        containerView.layer.cornerRadius = 16
        containerView.clipsToBounds = true
        containerView.layer.cornerCurve = .continuous

        titleLabel.textColor = .white
        textLabel.textColor = UIColor(white: 0.88, alpha: 1)
        titleLabel.numberOfLines = 0
        textLabel.numberOfLines = 0
        titleLabel.lineBreakMode = .byWordWrapping
        textLabel.lineBreakMode = .byWordWrapping
        titleLabel.setContentCompressionResistancePriority(.required, for: .vertical)
        textLabel.setContentCompressionResistancePriority(.required, for: .vertical)
        textLabel.backgroundColor = .clear
        titleLabel.backgroundColor = .clear
        titleLabel.font = UIFont.systemFont(ofSize: 17, weight: .semibold)
        textLabel.font = UIFont.systemFont(ofSize: 14, weight: .regular)

        logoImageView.contentMode = .scaleAspectFit
        logoImageView.clipsToBounds = true
        logoImageView.layer.cornerRadius = 6
        logoImageView.layer.masksToBounds = true

        setupCarouselViews()
        setupCarouselGestures()
    }

    // ---------------------------------------------------------
    // MARK: - Layout Size
    // ---------------------------------------------------------
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()

        if carouselNeedsBuild, !images.isEmpty, carouselScrollView.bounds.width > 0 {
            carouselNeedsBuild = false
            buildCarouselScrollContent()
        }

        pageScrimGradient.frame = pageScrimView.bounds

        view.layoutIfNeeded()

        let width = max(view.bounds.width, 1)

        let textMaxWidth = max(textLabel.bounds.width, containerView.bounds.width - 64)
        titleLabel.preferredMaxLayoutWidth = textMaxWidth
        textLabel.preferredMaxLayoutWidth = textMaxWidth
        titleLabel.layoutIfNeeded()
        textLabel.layoutIfNeeded()

        let headerBottom = max(
            logoImageView.frame.maxY,
            textLabel.isHidden ? titleLabel.frame.maxY : textLabel.frame.maxY
        )
        let headerBottomInView = containerView.convert(
            CGPoint(x: 0, y: headerBottom),
            to: view
        ).y

        var height = max(headerBottomInView + CarouselLayout.headerToCarouselGap, 1)
        if !images.isEmpty, carouselView.superview != nil, carouselView.bounds.width > 0 {
            let carouselBottomInView = containerView.convert(
                CGPoint(x: 0, y: carouselView.frame.maxY),
                to: view
            ).y
            let mediaBottom = floor(carouselBottomInView * UIScreen.main.scale) / UIScreen.main.scale
            height = max(height, mediaBottom)
        }

        preferredContentSize = CGSize(width: width, height: height)
    }

    private var isCarouselEnabled: Bool {
        return images.count > 1
    }

    // ---------------------------------------------------------
    // MARK: - Receive Notification
    // ---------------------------------------------------------
    func didReceive(_ notification: UNNotification) {
        self.notification = notification
        let userInfo = notification.request.content.userInfo

        titleLabel.text = preferredText(
            keys: styledTitleKeys,
            userInfo: userInfo,
            fallback: notification.request.content.title
        )
        textLabel.text = preferredText(
            keys: styledBodyKeys,
            userInfo: userInfo,
            fallback: notification.request.content.body
        )

        if let logoAttachment = notification.request.content.attachments.first(where: { $0.identifier == "logo" }) {
            _ = logoAttachment.url.startAccessingSecurityScopedResource()
            if let data = try? Data(contentsOf: logoAttachment.url) {
                logoImageView.image = UIImage(data: data)
            }
            logoAttachment.url.stopAccessingSecurityScopedResource()
        }

        if logoImageView.image == nil {
            if let styledLogoUrl = preferredUrl(keys: styledLogoKeys, userInfo: userInfo) {
                URLSession.shared.dataTask(with: styledLogoUrl) { [weak self] data, _, _ in
                    guard let self = self,
                          let data = data,
                          let image = UIImage(data: data) else { return }
                    DispatchQueue.main.async {
                        self.logoImageView.image = image
                        self.logoImageView.contentMode = .scaleAspectFit
                        self.logoImageView.backgroundColor = .clear
                    }
                }.resume()
            } else {
                logoImageView.image = UIImage(named: "logo")
            }

            if logoImageView.image == nil {
                logoImageView.image = UIImage(systemName: "app.badge") ?? UIImage(systemName: "bell.fill")
                logoImageView.tintColor = .white
                logoImageView.contentMode = .center
                logoImageView.backgroundColor = UIColor(white: 0.2, alpha: 1)
            }
        }

        let isBodyEmpty = (textLabel.text ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty
        textLabel.isHidden = isBodyEmpty

        view.setNeedsLayout()
        view.layoutIfNeeded()

        images.removeAll()

        let attachments = notification.request.content.attachments

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            var loadedImages: [UIImage] = []

            for attachment in attachments {
                if attachment.identifier == "logo" { continue }

                _ = attachment.url.startAccessingSecurityScopedResource()
                if let data = try? Data(contentsOf: attachment.url),
                   let img = UIImage(data: data) {
                    loadedImages.append(img)
                }
                attachment.url.stopAccessingSecurityScopedResource()
            }

            DispatchQueue.main.async {
                guard let self = self else { return }
                self.images = loadedImages

                if !self.images.isEmpty {
                    self.currentIndex = 0
                    self.carouselNeedsBuild = true
                    self.pageControl.numberOfPages = self.images.count
                    self.pageControl.currentPage = 0
                    self.pageControl.isHidden = !self.isCarouselEnabled
                    self.pageScrimView.isHidden = !self.isCarouselEnabled

                    self.applyCarouselEdgeConstraints()
                    self.updateCarouselHeightConstraintForLoadedImages()

                    self.carouselScrollView.isScrollEnabled = self.isCarouselEnabled
                    self.carouselScrollView.bounces = self.isCarouselEnabled

                    if self.isCarouselEnabled {
                        self.startAutoScroll()
                        self.carouselView.isUserInteractionEnabled = true
                    } else {
                        self.stopAutoScroll()
                        self.carouselView.isUserInteractionEnabled = true
                    }

                    self.view.setNeedsLayout()
                    self.view.layoutIfNeeded()
                } else {
                    self.loadCarouselImagesFromUserInfoIfNeeded(userInfo: userInfo)
                    if self.allMediaUrls(from: userInfo) != nil {
                        self.carouselView.isHidden = true
                        self.pageControl.isHidden = true
                        self.pageScrimView.isHidden = true
                    } else {
                        self.carouselHeightConstraint = nil
                        self.carouselView.removeFromSuperview()
                        self.pageScrimView.removeFromSuperview()
                        self.pageControl.removeFromSuperview()
                    }

                    self.view.setNeedsLayout()
                    self.view.layoutIfNeeded()
                }
            }
        }
    }

    private func applyCarouselEdgeConstraints() {
        carouselLeadingConstraint?.constant = 0
        carouselTrailingConstraint?.constant = 0
        carouselTopConstraint?.constant = CarouselLayout.headerToCarouselGap
    }

    private func loadCarouselImagesFromUserInfoIfNeeded(userInfo: [AnyHashable: Any]) {
        guard images.isEmpty, !fallbackImageLoadInProgress else { return }
        guard let urls = allMediaUrls(from: userInfo), !urls.isEmpty else { return }
        fallbackImageLoadInProgress = true

        let group = DispatchGroup()
        var loadedImages = Array<UIImage?>(repeating: nil, count: urls.count)

        for (index, url) in urls.enumerated() {
            group.enter()
            URLSession.shared.dataTask(with: url) { data, _, _ in
                defer { group.leave() }
                guard let data = data, let image = UIImage(data: data) else { return }
                loadedImages[index] = image
            }.resume()
        }

        group.notify(queue: .main) { [weak self] in
            guard let self = self else { return }
            defer { self.fallbackImageLoadInProgress = false }

            let resolved = loadedImages.compactMap { $0 }
            guard !resolved.isEmpty else { return }

            self.images = resolved
            self.currentIndex = 0
            self.carouselView.isHidden = false
            self.pageControl.numberOfPages = resolved.count
            self.pageControl.currentPage = 0
            self.pageControl.isHidden = !self.isCarouselEnabled
            self.pageScrimView.isHidden = !self.isCarouselEnabled

            self.applyCarouselEdgeConstraints()
            self.carouselNeedsBuild = true
            self.updateCarouselHeightConstraintForLoadedImages()
            self.carouselScrollView.isScrollEnabled = self.isCarouselEnabled
            self.carouselScrollView.bounces = self.isCarouselEnabled

            if self.isCarouselEnabled {
                self.startAutoScroll()
            } else {
                self.stopAutoScroll()
            }

            self.view.setNeedsLayout()
            self.view.layoutIfNeeded()
        }
    }

    private func allMediaUrls(from userInfo: [AnyHashable: Any]) -> [URL]? {
        let keys = ["media-url", "images", "image_urls", "imageUrls", "image_url", "imageUrl", "image"]
        for key in keys {
            if let values = stringListValue(for: key, userInfo: userInfo) {
                let urls = values.compactMap { URL(string: $0) }
                if !urls.isEmpty { return urls }
            }
        }
        return nil
    }

    private func stringListValue(for key: String, userInfo: [AnyHashable: Any]) -> [String]? {
        if let values = userInfo[key] as? [String] {
            return values.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        }
        if let values = userInfo[key] as? [Any] {
            let mapped = values.compactMap { value -> String? in
                if let s = value as? String { return s.trimmingCharacters(in: .whitespacesAndNewlines) }
                if let s = value as? NSString { return s.trimmingCharacters(in: .whitespacesAndNewlines) }
                return nil
            }.filter { !$0.isEmpty }
            return mapped.isEmpty ? nil : mapped
        }
        if let raw = stringValue(for: key, userInfo: userInfo), !raw.isEmpty {
            if let data = raw.data(using: .utf8),
               let parsed = try? JSONSerialization.jsonObject(with: data) as? [Any] {
                let mapped = parsed.compactMap { value -> String? in
                    if let s = value as? String { return s.trimmingCharacters(in: .whitespacesAndNewlines) }
                    if let s = value as? NSString { return s.trimmingCharacters(in: .whitespacesAndNewlines) }
                    return nil
                }.filter { !$0.isEmpty }
                if !mapped.isEmpty { return mapped }
            }
            let split = raw
                .split(separator: ",")
                .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "\"'")) }
                .filter { !$0.isEmpty }
            return split.isEmpty ? nil : split
        }
        return nil
    }

    private func updateCarouselHeightConstraintForLoadedImages() {
        guard !images.isEmpty, carouselView.superview != nil else { return }

        carouselHeightConstraint?.isActive = false
        let next = carouselView.heightAnchor.constraint(
            equalTo: carouselView.widthAnchor,
            multiplier: CarouselLayout.aspectRatio
        )
        next.priority = .required
        next.isActive = true
        carouselHeightConstraint = next
    }

    // ---------------------------------------------------------
    // MARK: - Build Carousel Scroll (full-bleed paging)
    // ---------------------------------------------------------
    private func buildCarouselScrollContent() {
        carouselImageViews.forEach { $0.removeFromSuperview() }
        carouselImageViews.removeAll()

        guard !images.isEmpty else { return }

        let pageWidth = max(carouselScrollView.bounds.width, 1)
        let pageHeight = max(carouselScrollView.bounds.height, pageWidth * CarouselLayout.aspectRatio)

        for (index, img) in images.enumerated() {
            let iv = UIImageView(image: img)
            iv.contentMode = .scaleAspectFill
            iv.clipsToBounds = true
            iv.backgroundColor = .clear
            iv.translatesAutoresizingMaskIntoConstraints = false
            carouselScrollView.addSubview(iv)
            carouselImageViews.append(iv)

            NSLayoutConstraint.activate([
                iv.topAnchor.constraint(equalTo: carouselScrollView.topAnchor),
                iv.bottomAnchor.constraint(equalTo: carouselScrollView.bottomAnchor),
                iv.widthAnchor.constraint(equalToConstant: pageWidth),
                iv.heightAnchor.constraint(equalToConstant: pageHeight),
                iv.leadingAnchor.constraint(
                    equalTo: index == 0 ? carouselScrollView.leadingAnchor : carouselImageViews[index - 1].trailingAnchor,
                    constant: 0
                )
            ])
        }

        carouselScrollView.contentInset = .zero
        carouselScrollView.contentSize = CGSize(
            width: pageWidth * CGFloat(images.count),
            height: pageHeight
        )
        scrollToPage(currentIndex, animated: false)
    }

    private func preferredText(
        keys: [String],
        userInfo: [AnyHashable: Any],
        fallback: String
    ) -> String {
        for key in keys {
            if let value = stringValue(for: key, userInfo: userInfo), !value.isEmpty {
                return value
            }
        }
        return fallback
    }

    private func preferredUrl(keys: [String], userInfo: [AnyHashable: Any]) -> URL? {
        for key in keys {
            guard let value = stringValue(for: key, userInfo: userInfo), !value.isEmpty else { continue }
            if let url = URL(string: value) {
                return url
            }
        }
        return nil
    }

    private func stringValue(for key: String, userInfo: [AnyHashable: Any]) -> String? {
        if let value = userInfo[key] as? String {
            return value.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if let value = userInfo[key] as? NSString {
            return value.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return nil
    }

    private func pageWidth() -> CGFloat {
        max(carouselScrollView.bounds.width, 1)
    }

    private func scrollToPage(_ index: Int, animated: Bool) {
        guard index >= 0, index < images.count else { return }
        let width = pageWidth()
        guard width > 0 else { return }
        carouselScrollView.setContentOffset(
            CGPoint(x: CGFloat(index) * width, y: 0),
            animated: animated
        )
        currentIndex = index
        pageControl.currentPage = index
    }

    // ---------------------------------------------------------
    // MARK: - Setup Carousel Views
    // ---------------------------------------------------------
    private func setupCarouselViews() {
        carouselView.translatesAutoresizingMaskIntoConstraints = false
        carouselView.clipsToBounds = true
        carouselView.backgroundColor = .clear
        containerView.addSubview(carouselView)

        carouselScrollView.translatesAutoresizingMaskIntoConstraints = false
        carouselScrollView.showsHorizontalScrollIndicator = false
        carouselScrollView.isPagingEnabled = true
        carouselScrollView.decelerationRate = .fast
        carouselScrollView.delegate = self
        carouselScrollView.clipsToBounds = true
        carouselView.addSubview(carouselScrollView)

        pageScrimView.translatesAutoresizingMaskIntoConstraints = false
        pageScrimView.isUserInteractionEnabled = false
        pageScrimView.backgroundColor = .clear
        carouselView.addSubview(pageScrimView)

        pageScrimGradient.colors = [
            UIColor.black.withAlphaComponent(0).cgColor,
            UIColor.black.withAlphaComponent(0.45).cgColor
        ]
        pageScrimGradient.startPoint = CGPoint(x: 0.5, y: 0)
        pageScrimGradient.endPoint = CGPoint(x: 0.5, y: 1)
        pageScrimView.layer.addSublayer(pageScrimGradient)

        pageControl.translatesAutoresizingMaskIntoConstraints = false
        pageControl.currentPageIndicatorTintColor = .white
        pageControl.pageIndicatorTintColor = UIColor.white.withAlphaComponent(0.4)
        pageControl.hidesForSinglePage = true
        pageControl.isUserInteractionEnabled = false
        pageControl.transform = CGAffineTransform(scaleX: 0.85, y: 0.85)
        carouselView.addSubview(pageControl)

        let leading = carouselView.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 0)
        let trailing = carouselView.trailingAnchor.constraint(equalTo: containerView.trailingAnchor, constant: 0)
        let top = carouselView.topAnchor.constraint(
            equalTo: textLabel.bottomAnchor,
            constant: CarouselLayout.headerToCarouselGap
        )

        carouselLeadingConstraint = leading
        carouselTrailingConstraint = trailing
        carouselTopConstraint = top

        let heightC = carouselView.heightAnchor.constraint(
            equalTo: carouselView.widthAnchor,
            multiplier: CarouselLayout.aspectRatio
        )
        carouselHeightConstraint = heightC

        NSLayoutConstraint.activate([
            leading, trailing, top,
            heightC,

            carouselScrollView.leadingAnchor.constraint(equalTo: carouselView.leadingAnchor),
            carouselScrollView.trailingAnchor.constraint(equalTo: carouselView.trailingAnchor),
            carouselScrollView.topAnchor.constraint(equalTo: carouselView.topAnchor),
            carouselScrollView.bottomAnchor.constraint(equalTo: carouselView.bottomAnchor),

            pageScrimView.leadingAnchor.constraint(equalTo: carouselView.leadingAnchor),
            pageScrimView.trailingAnchor.constraint(equalTo: carouselView.trailingAnchor),
            pageScrimView.bottomAnchor.constraint(equalTo: carouselView.bottomAnchor),
            pageScrimView.heightAnchor.constraint(equalToConstant: CarouselLayout.pageScrimHeight),

            pageControl.bottomAnchor.constraint(
                equalTo: carouselView.bottomAnchor,
                constant: -CarouselLayout.pageControlBottomPadding
            ),
            pageControl.centerXAnchor.constraint(equalTo: carouselView.centerXAnchor)
        ])
    }

    // Notification Center often steals horizontal pans from UIScrollView; swipes work reliably.
    private func setupCarouselGestures() {
        let left = UISwipeGestureRecognizer(target: self, action: #selector(handleCarouselSwipe(_:)))
        left.direction = .left
        left.delegate = self
        carouselView.addGestureRecognizer(left)

        let right = UISwipeGestureRecognizer(target: self, action: #selector(handleCarouselSwipe(_:)))
        right.direction = .right
        right.delegate = self
        carouselView.addGestureRecognizer(right)

        carouselView.isUserInteractionEnabled = false
    }

    @objc private func handleCarouselSwipe(_ gesture: UISwipeGestureRecognizer) {
        guard isCarouselEnabled else { return }
        pauseAutoScrollForUserInteraction()
        if gesture.direction == .left {
            animateForward()
        } else if gesture.direction == .right {
            animateBackward()
        }
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        true
    }

    // ---------------------------------------------------------
    // MARK: - Auto Scroll
    // ---------------------------------------------------------
    private func startAutoScroll() {
        guard isCarouselEnabled else { return }
        autoScrollTimer?.invalidate()
        autoScrollTimer = Timer.scheduledTimer(
            withTimeInterval: CarouselLayout.autoScrollInterval,
            repeats: true
        ) { [weak self] _ in
            self?.animateForward()
        }
    }

    private func stopAutoScroll() {
        autoScrollTimer?.invalidate()
        autoScrollTimer = nil
        autoScrollResumeWorkItem?.cancel()
        autoScrollResumeWorkItem = nil
    }

    private func scheduleAutoScrollResume() {
        autoScrollResumeWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self] in
            self?.startAutoScroll()
        }
        autoScrollResumeWorkItem = work
        DispatchQueue.main.asyncAfter(
            deadline: .now() + CarouselLayout.autoScrollResumeDelay,
            execute: work
        )
    }

    private func pauseAutoScrollForUserInteraction() {
        stopAutoScroll()
        scheduleAutoScrollResume()
    }

    private func animateForward() {
        guard isCarouselEnabled, !images.isEmpty else { return }
        let nextIndex = (currentIndex + 1) % images.count
        scrollToPage(nextIndex, animated: true)
    }

    private func animateBackward() {
        guard isCarouselEnabled, !images.isEmpty else { return }
        let prevIndex = (currentIndex - 1 + images.count) % images.count
        scrollToPage(prevIndex, animated: true)
    }

    // MARK: - UIScrollViewDelegate

    func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
        guard scrollView === carouselScrollView else { return }
        pauseAutoScrollForUserInteraction()
    }

    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        guard scrollView === carouselScrollView, isCarouselEnabled else { return }
        let width = pageWidth()
        guard width > 0 else { return }
        let page = Int(round(scrollView.contentOffset.x / width))
        let clamped = max(0, min(page, images.count - 1))
        if clamped != pageControl.currentPage {
            pageControl.currentPage = clamped
        }
    }

    func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {
        guard scrollView === carouselScrollView else { return }
        syncCurrentPageFromScrollView(scrollView)
        pauseAutoScrollForUserInteraction()
    }

    func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) {
        guard scrollView === carouselScrollView else { return }
        syncCurrentPageFromScrollView(scrollView)
    }

    private func syncCurrentPageFromScrollView(_ scrollView: UIScrollView) {
        let width = pageWidth()
        guard width > 0 else { return }
        let page = Int(round(scrollView.contentOffset.x / width))
        currentIndex = max(0, min(page, images.count - 1))
        pageControl.currentPage = currentIndex
    }

    // ---------------------------------------------------------
    // MARK: - Notification Action Buttons
    // ---------------------------------------------------------
    func didReceive(
        _ response: UNNotificationResponse,
        completionHandler completion: @escaping (UNNotificationContentExtensionResponseOption) -> Void
    ) {
        let actionId = response.actionIdentifier
        let userInfo = response.notification.request.content.userInfo

        switch actionId {
        case "PUSHAPP_NEXT":
            pauseAutoScrollForUserInteraction()
            animateForward()
            completion(.doNotDismiss)

        case "PUSHAPP_PREVIOUS":
            pauseAutoScrollForUserInteraction()
            animateBackward()
            completion(.doNotDismiss)

        default:
            _ = urlForAction(actionId, userInfo: userInfo)
            completion(.dismissAndForwardAction)
        }
    }

    private func mergedNotificationFields(_ userInfo: [AnyHashable: Any]) -> [String: Any] {
        var merged: [String: Any] = [:]
        for (k, v) in userInfo {
            merged[String(describing: k)] = v
        }
        if let dataDict = userInfo["data"] as? [AnyHashable: Any] {
            for (k, v) in dataDict {
                merged[String(describing: k)] = v
            }
        } else if let dataStr = userInfo["data"] as? String,
                  let d = dataStr.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any] {
            for (k, v) in obj { merged[k] = v }
        }
        return merged
    }

    private func stringFromAny(_ value: Any?) -> String? {
        guard let value else { return nil }
        if let s = value as? String { return s }
        if let s = value as? NSString { return s as String }
        if let n = value as? NSNumber { return n.stringValue }
        return nil
    }

    private func urlStringFromButtonDict(_ button: [String: Any]) -> String? {
        let urlKeys = [
            "url", "link", "href", "deepLink", "deeplink",
            "targetUrl", "target_url", "action_url", "cta_url"
        ]
        for key in urlKeys {
            if let s = stringFromAny(button[key])?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty {
                return s
            }
        }
        return nil
    }

    private func parseCtaButtonsArray(_ raw: Any?) -> [[String: Any]]? {
        guard let raw else { return nil }
        if let arr = raw as? [[String: Any]] { return arr }
        if let arr = raw as? [Any] {
            return arr.compactMap { item -> [String: Any]? in
                if let d = item as? [String: Any] { return d }
                if let d = item as? [AnyHashable: Any] {
                    var out: [String: Any] = [:]
                    for (k, v) in d {
                        out[String(describing: k)] = v
                    }
                    return out
                }
                return nil
            }
        }
        if let s = raw as? String, let data = s.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) {
            return parseCtaButtonsArray(json)
        }
        return nil
    }

    private func parseActionUrlsMap(_ raw: Any?) -> [String: String]? {
        guard let raw else { return nil }
        if let dict = raw as? [String: String] { return dict }
        if let dict = raw as? [String: Any] {
            var out: [String: String] = [:]
            for (k, v) in dict {
                if let s = stringFromAny(v) { out[k] = s }
            }
            return out
        }
        if let s = raw as? String, let data = s.data(using: .utf8),
           let obj = try? JSONSerialization.jsonObject(with: data) {
            return parseActionUrlsMap(obj)
        }
        return nil
    }

    private func urlForAction(_ actionId: String, userInfo: [AnyHashable: Any]) -> URL? {
        if actionId == UNNotificationDefaultActionIdentifier || actionId == UNNotificationDismissActionIdentifier { return nil }

        let merged = mergedNotificationFields(userInfo)

        func str(_ key: String) -> String? { stringFromAny(merged[key]) }

        func validUrl(_ raw: String?) -> URL? {
            guard let raw else { return nil }
            let cleaned = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleaned.isEmpty else { return nil }
            guard let url = URL(string: cleaned),
                  let scheme = url.scheme?.lowercased(),
                  ["http", "https"].contains(scheme) || cleaned.contains("://") else {
                return nil
            }
            return url
        }
        func actionIndex(_ id: String) -> Int? {
            if id == "PUSHAPP_ACTION_1" || id == "PUSHAPP_OPT_IN" || id == "PUSHAPP_YES" { return 0 }
            if id == "PUSHAPP_ACTION_2" || id.hasSuffix("_MID") { return 1 }
            if id == "PUSHAPP_ACTION_3" || id == "PUSHAPP_NOT_INTERESTED" || id == "PUSHAPP_NO" { return 2 }
            if let number = Int(id.split(separator: "_").last ?? "") {
                return max(0, number - 1)
            }
            return nil
        }

        if let mapStr = stringFromAny(merged["__actionMap"]),
           let data = mapStr.data(using: .utf8),
           let map = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let url = validUrl(stringFromAny(map[actionId])) {
            return url
        }

        if let urls = parseActionUrlsMap(merged["action_urls"]),
           let url = validUrl(urls[actionId]) {
            return url
        }
        if actionId == "PUSHAPP_OPT_IN", let url = validUrl(str("url_opt_in")) { return url }
        if actionId == "PUSHAPP_NOT_INTERESTED", let url = validUrl(str("url_not_interested")) { return url }
        if actionId == "PUSHAPP_YES", let url = validUrl(str("url_yes") ?? str("url_opt_in")) { return url }
        if actionId == "PUSHAPP_NO", let url = validUrl(str("url_no") ?? str("url_not_interested")) { return url }
        if actionId.hasSuffix("_MID"),
           let url = validUrl(str("url_mid") ?? str("url_maybe") ?? str("url_action_2")) { return url }
        let rawButtons = merged["cta_buttons"] ?? merged["buttons"]
        if let buttons = parseCtaButtonsArray(rawButtons) {
            if let index = actionIndex(actionId), buttons.indices.contains(index) {
                if let s = urlStringFromButtonDict(buttons[index]), let url = validUrl(s) { return url }
            }
            for btn in buttons {
                let bid = stringFromAny(btn["id"])
                if bid == actionId, let s = urlStringFromButtonDict(btn), let url = validUrl(s) { return url }
            }
        }
        if let index = actionIndex(actionId) {
            let keysByIndex = [
                ["url1", "cta1_url", "button1_url"],
                ["url2", "cta2_url", "button2_url"],
                ["url3", "cta3_url", "button3_url"]
            ]
            if keysByIndex.indices.contains(index) {
                for key in keysByIndex[index] {
                    if let url = validUrl(str(key)) { return url }
                }
            }
        }
        let actionSpecificKeys = [
            "url_\(actionId.lowercased())",
            "cta_url_\(actionId.lowercased())",
            "url_action_1", "url_action_2", "url_action_3"
        ]
        for key in actionSpecificKeys {
            if let url = validUrl(str(key)) { return url }
        }
        for key in ["cta_url", "url", "link", "click_action"] {
            if let url = validUrl(str(key)) { return url }
        }
        return nil
    }

}
