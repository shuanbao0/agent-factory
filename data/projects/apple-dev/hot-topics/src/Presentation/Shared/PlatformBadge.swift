import SwiftUI

// MARK: - Platform + Badge Color (Presentation layer extension)

extension Platform {
    /// 平台品牌色（深色/浅色双套，WCAG AA ≥4.5:1）
    var badgeColor: Color {
        switch id {
        case "weibo":    return Color("PlatformWeibo")
        case "douyin":   return Color("PlatformDouyin")
        case "zhihu":    return Color("PlatformZhihu")
        case "github":   return Color("PlatformGitHub")
        case "36kr":     return Color("Platform36kr")
        case "bilibili": return Color("PlatformBili")
        case "sspai":    return Color("PlatformSspai")
        case "hupu":     return Color("PlatformHupu")
        case "juejin":   return Color("PlatformJuejin")
        case "v2ex":     return Color("PlatformV2ex")
        case "baidu":    return Color("PlatformBaidu")
        case "thepaper": return Color("PlatformThepaper")
        default:         return Color.secondary
        }
    }
}

// MARK: - PlatformBadge

/// 平台标签徽章（深色/浅色模式自适应平台品牌色）
struct PlatformBadge: View {

    // MARK: - Properties

    let platform: Platform

    // MARK: - Body

    var body: some View {
        Text(platform.name)
            .font(.caption2)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(platform.badgeColor.opacity(0.15), in: Capsule())
            .foregroundStyle(platform.badgeColor)
    }
}
