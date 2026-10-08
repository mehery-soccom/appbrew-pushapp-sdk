import ActivityKit
import WidgetKit
import SwiftUI

// MARK: - Attributes

struct DeliveryActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var message1: String
        var message2: String
        var message3: String
        
        var message1FontSize: Double
        var message1FontColorHex: String
        var line1_font_text_styles: [String]
        
        var message2FontSize: Double
        var message2FontColorHex: String
        var line2_font_text_styles: [String]
        
        var message3FontSize: Double
        var message3FontColorHex: String
        var line3_font_text_styles: [String]

        var backgroundColorHex: String
        var fontColorHex: String
        var progressColorHex: String
        var fontSize: Double
        
        var progressPercent: Double
        var align : String
        var bg_color_gradient : String
        var bg_color_gradient_dir : String
        var imageFileName: String?
        var imageUrl: String?
    }
}

// MARK: - Live Activity Widget
@available(iOS 16.2, *)
struct DeliveryActivityLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: DeliveryActivityAttributes.self) { context in
            // Lock Screen / Banner
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 6) {
                    // Debug: Print styles being applied
                    
                    if context.state.line1_font_text_styles.contains("italic"){
                        Text(context.state.message1)
                            .font(.system(size: context.state.message1FontSize, weight: context.state.line1_font_text_styles.contains("bold") ? .bold : .regular))
                            .foregroundColor(colorFromHex(context.state.message1FontColorHex))
                            .modifier(TextStyleModifier(styles: context.state.line1_font_text_styles)).italic()
                    }else{
                        
                        Text(context.state.message1)
                            .font(.system(size: context.state.message1FontSize, weight: context.state.line1_font_text_styles.contains("bold") ? .bold : .regular))
                            .foregroundColor(colorFromHex(context.state.message1FontColorHex))
                            .modifier(TextStyleModifier(styles: context.state.line1_font_text_styles))
                    }

                    if context.state.line2_font_text_styles.contains("italic"){
                        Text(context.state.message2)
                            .font(.system(size: context.state.message2FontSize, weight: context.state.line2_font_text_styles.contains("bold") ? .bold : .regular))
                            .foregroundColor(colorFromHex(context.state.message2FontColorHex))
                            .modifier(TextStyleModifier(styles: context.state.line2_font_text_styles)).italic()
                    }else{
                        
                        Text(context.state.message2)
                            .font(.system(size: context.state.message2FontSize, weight: context.state.line2_font_text_styles.contains("bold") ? .bold : .regular))
                            .foregroundColor(colorFromHex(context.state.message2FontColorHex))
                            .modifier(TextStyleModifier(styles: context.state.line2_font_text_styles))
                    }

                    if context.state.line3_font_text_styles.contains("italic"){
                        Text(context.state.message3)
                            .font(.system(size: context.state.message3FontSize, weight: context.state.line3_font_text_styles.contains("bold") ? .bold : .regular))
                            .foregroundColor(colorFromHex(context.state.message3FontColorHex))
                            .modifier(TextStyleModifier(styles: context.state.line3_font_text_styles)).italic()
                    }else{
                        
                        Text(context.state.message3)
                            .font(.system(size: context.state.message3FontSize, weight: context.state.line3_font_text_styles.contains("bold") ? .bold : .regular))
                            .foregroundColor(colorFromHex(context.state.message3FontColorHex))
                            .modifier(TextStyleModifier(styles: context.state.line3_font_text_styles))
                    }

                    GeometryReader { geometry in
                            ZStack(alignment: .leading) {
                                Capsule()
                                    .fill(Color.gray.opacity(0.2))
                                    .frame(height: 6)
                                Capsule()
                                    .fill(colorFromHex(context.state.progressColorHex))
                                    .frame(width: geometry.size.width * CGFloat(context.state.progressPercent), height: 6)
                            }
                        }
                        .frame(height: 6)
                }

                if appGroupImageExists(context.state.imageFileName) {
                    Spacer(minLength: 8)
                    // Shown on the right like a standard rich notification; file is written in AppDelegate from the push image URL.
                    liveActivityArtwork(
                        imageFileName: context.state.imageFileName,
                        width: 88,
                        height: 56,
                        cornerRadius: 10
                    )
                }

            }
            .padding()
            .background(
                backgroundView(for: context.state)
            )
            .activityBackgroundTint(colorFromHex(context.state.backgroundColorHex))
            .activitySystemActionForegroundColor(colorFromHex(context.state.fontColorHex))
            .environment(\.layoutDirection, context.state.align == "right" ? .rightToLeft : .leftToRight)

        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "shippingbox")
                        .foregroundColor(colorFromHex(context.state.fontColorHex))
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 6) {
                        if appGroupImageExists(context.state.imageFileName) {
                            liveActivityArtwork(
                                imageFileName: context.state.imageFileName,
                                width: 80,
                                height: 80,
                                cornerRadius: 12
                            )
                        }
                        Text("\(Int(context.state.progressPercent * 100))%")
                            .font(.system(size: context.state.fontSize))
                            .bold()
                            .foregroundColor(colorFromHex(context.state.fontColorHex))
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(context.state.message1)
                            .font(.caption)
                            .foregroundColor(.gray)

                        Text("Progress: \(Int(context.state.progressPercent * 100))%")
                            .bold()
                            .foregroundColor(colorFromHex(context.state.fontColorHex))
                    }
                }
            } compactLeading: {
                Text("\(Int(context.state.progressPercent * 100))%")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundColor(colorFromHex(context.state.fontColorHex))
            } compactTrailing: {
                if appGroupImageExists(context.state.imageFileName) {
                    liveActivityArtwork(
                        imageFileName: context.state.imageFileName,
                        width: 36,
                        height: 36,
                        cornerRadius: 8
                    )
                } else {
                    Text("\(Int(context.state.progressPercent * 100))%")
                        .font(.caption)
                        .foregroundColor(colorFromHex(context.state.fontColorHex))
                }
            } minimal: {
                Image(systemName: "clock")
                    .foregroundColor(colorFromHex(context.state.fontColorHex))
            }
            .keylineTint(colorFromHex(context.state.progressColorHex))
        }
    }
}

private func appGroupImageExists(_ fileName: String?) -> Bool {
    guard let name = fileName, !name.isEmpty,
          let containerURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: MeheryAppGroup.liveActivity
          ) else {
        return false
    }
    let path = containerURL.appendingPathComponent(name).path
    return FileManager.default.fileExists(atPath: path)
}

func loadImageFromAppGroup(named name: String) -> Image? {
    guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: MeheryAppGroup.liveActivity) else {
        print("❌ App Group container not found")
        return nil
    }

    let fileURL = containerURL.appendingPathComponent(name)
    print("📂 Looking for image at path: \(fileURL.path)")

    guard FileManager.default.fileExists(atPath: fileURL.path) else {
        print("❌ File does not exist at path: \(fileURL.path)")
        return nil
    }

    guard let uiImage = UIImage(contentsOfFile: fileURL.path) else {
        print("❌ Failed to load UIImage from file: \(fileURL.path)")
        return nil
    }

    print("✅ Successfully loaded image: \(name)")
    return Image(uiImage: uiImage)
}

@ViewBuilder
private func liveActivityArtwork(
    imageFileName: String?,
    width: CGFloat,
    height: CGFloat,
    cornerRadius: CGFloat
) -> some View {
    if let img = loadImageFromAppGroup(named: imageFileName ?? "") {
        img
            .resizable()
            .scaledToFill()
            .frame(width: width, height: height)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    } else {
        Color.clear
            .frame(width: width, height: height)
    }
}



private func backgroundView(for state: DeliveryActivityAttributes.ContentState) -> some View {
    if !state.bg_color_gradient.isEmpty, !state.bg_color_gradient_dir.isEmpty {
        let startColor = colorFromHex(state.backgroundColorHex)
        let endColor = colorFromHex(state.bg_color_gradient)
        let (startPoint, endPoint) = gradientDirection(from: state.bg_color_gradient_dir)

        return AnyView(
            LinearGradient(
                gradient: Gradient(colors: [startColor, endColor]),
                startPoint: startPoint,
                endPoint: endPoint
            )
        )
    } else {
        return AnyView(colorFromHex(state.backgroundColorHex))
    }
}

private func gradientDirection(from dir: String) -> (UnitPoint, UnitPoint) {
    switch dir.lowercased() {
    case "toleft", "left":
        return (.trailing, .leading)      // Gradient moves from right to left
    case "toright", "right":
        return (.leading, .trailing)      // Gradient moves from left to right
    case "totop", "top":
        return (.bottom, .top)            // Gradient moves from bottom to top
    case "tobottom", "bottom":
        return (.top, .bottom)            // Gradient moves from top to bottom
    case "horizontal":
        return (.leading, .trailing)      // Left → Right
    case "vertical":
        return (.top, .bottom)            // Top → Bottom
    default:
        return (.top, .bottom)            // Default vertical
    }
}


// MARK: - Text Style Modifier

struct TextStyleModifier: ViewModifier {
    let styles: [String]
    
    func body(content: Content) -> some View {
        
        if #available(iOS 16.0, *) {
            return content
                .underline(styles.contains("underline"))
        } else {
            return content
        }
    }
}

// MARK: - Helpers

private func colorFromHex(_ hex: String) -> Color {
    var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    if hexSanitized.hasPrefix("#") {
        hexSanitized.removeFirst()
    }

    var rgb: UInt64 = 0
    Scanner(string: hexSanitized).scanHexInt64(&rgb)

    return Color(
        red: Double((rgb & 0xFF0000) >> 16) / 255,
        green: Double((rgb & 0x00FF00) >> 8) / 255,
        blue: Double(rgb & 0x0000FF) / 255
    )
}

// MARK: - Preview

extension DeliveryActivityAttributes {
    fileprivate static var preview: DeliveryActivityAttributes {
        DeliveryActivityAttributes()
    }
}

extension DeliveryActivityAttributes.ContentState {
    fileprivate static var preview: DeliveryActivityAttributes.ContentState {
        .init(
            message1: "Your order is on the way",
            message2: "Your order is on its way",
            message3: "Expect delivery soon",
            message1FontSize: 20,
            message1FontColorHex: "#FFFFFF",
            line1_font_text_styles: ["bold"],
            message2FontSize: 16,
            message2FontColorHex: "#FFFF00",
            line2_font_text_styles: ["italic"],
            message3FontSize: 14,
            message3FontColorHex: "#00FF00",
            line3_font_text_styles: ["underline"],
            backgroundColorHex: "#FFFFFF",
            fontColorHex: "#FFFFFF",
            progressColorHex: "#FFFFFF",
            fontSize: 14,
            progressPercent: 0.5,// 50% progress
            align: "left",
            bg_color_gradient: "#080000",
            bg_color_gradient_dir: "toRight",
            imageFileName: nil,
            imageUrl: nil
        )
    }
}

@available(iOS 18.0, *)
#Preview("Live Activity", as: .content, using: DeliveryActivityAttributes.preview) {
    DeliveryActivityLiveActivity()
} contentStates: {
    DeliveryActivityAttributes.ContentState.preview
}

