import Foundation

// MARK: - HotItem

/// 热榜条目（值类型，Domain 层）
struct HotItem: Identifiable, Sendable, Equatable, Hashable {
    let id: String          // "{platformId}_{rank}"
    let title: String
    let url: URL
    let description: String?
    let thumbnailURL: URL?
    let hotValue: Int       // 热度数值（从 extra 解析）
    let extra: String?      // 原始热度文字，如 "455 万热度"
    let rank: Int           // 排名
    let platformId: String
    let cachedAt: Date
    let expiresAt: Date

    // MARK: - Computed Properties

    var isExpired: Bool { expiresAt < Date() }

    var formattedHotValue: String {
        if let extra, !extra.isEmpty { return extra }
        switch hotValue {
        case 0..<10_000:
            return "\(hotValue)"
        case 0..<100_000_000:
            return String(format: "%.1f万", Double(hotValue) / 10_000)
        default:
            return String(format: "%.1f亿", Double(hotValue) / 100_000_000)
        }
    }

    var cacheAge: TimeInterval {
        Date().timeIntervalSince(cachedAt)
    }

    var cacheAgeDescription: String {
        let minutes = Int(cacheAge / 60)
        if minutes < 1 { return "刚刚更新" }
        if minutes < 60 { return "\(minutes) 分钟前更新" }
        let hours = minutes / 60
        return "\(hours) 小时前更新"
    }
}

// MARK: - Test Stubs

#if DEBUG
extension HotItem {
    static func stub(
        rank: Int = 1,
        title: String = "测试热榜条目标题",
        platformId: String = "zhihu"
    ) -> HotItem {
        HotItem(
            id: "\(platformId)_\(rank)",
            title: title,
            url: URL(string: "https://www.zhihu.com/question/000") ?? URL(fileURLWithPath: "/"),
            description: "测试摘要内容",
            thumbnailURL: nil,
            hotValue: 1_000_000,
            extra: "100 万热度",
            rank: rank,
            platformId: platformId,
            cachedAt: Date(),
            expiresAt: Date().addingTimeInterval(15 * 60)
        )
    }

    static func stubs(count: Int = 20, platformId: String = "zhihu") -> [HotItem] {
        (1...count).map { stub(rank: $0, title: "热榜条目 \($0)", platformId: platformId) }
    }
}
#endif
