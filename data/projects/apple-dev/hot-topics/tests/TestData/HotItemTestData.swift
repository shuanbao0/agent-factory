import Foundation
@testable import HotTopics

// MARK: - HotItemTestData

/// Test data generator for HotItem
enum HotItemTestData {

    // MARK: - Constants

    static let ttlSeconds: TimeInterval = 15 * 60

    // MARK: - Factory Methods

    /// Create a single HotItem with defaults
    static func make(
        rank: Int = 1,
        title: String = "测试标题",
        platformId: String = "zhihu",
        hotValue: Int = 1_000_000,
        extra: String? = nil,
        cachedAt: Date = Date(),
        expiresAt: Date? = nil
    ) -> HotItem {
        HotItem(
            id: "\(platformId)_\(rank)",
            title: title,
            url: URL(string: "https://www.zhihu.com/question/\(rank)")!,
            description: "测试摘要内容",
            thumbnailURL: nil,
            hotValue: hotValue,
            extra: extra ?? "\(hotValue / 10_000)万热度",
            rank: rank,
            platformId: platformId,
            cachedAt: cachedAt,
            expiresAt: expiresAt ?? cachedAt.addingTimeInterval(ttlSeconds)
        )
    }

    /// Create an expired HotItem
    static func expired(
        rank: Int = 1,
        platformId: String = "zhihu"
    ) -> HotItem {
        let cachedAt = Date().addingTimeInterval(-3600)
        return HotItem(
            id: "\(platformId)_\(rank)",
            title: "过期条目",
            url: URL(string: "https://www.zhihu.com/question/\(rank)")!,
            description: "过期摘要",
            thumbnailURL: nil,
            hotValue: 500_000,
            extra: "50万热度",
            rank: rank,
            platformId: platformId,
            cachedAt: cachedAt,
            expiresAt: cachedAt.addingTimeInterval(-3000)
        )
    }

    /// Create a list of HotItems
    static func list(
        count: Int = 20,
        platformId: String = "zhihu",
        startRank: Int = 1
    ) -> [HotItem] {
        (startRank...(startRank + count - 1)).map {
            make(rank: $0, title: "热榜条目 #\($0)", platformId: platformId)
        }
    }

    /// Create HotItems for multiple platforms
    static func multiPlatform() -> [HotItem] {
        var items: [HotItem] = []
        items.append(contentsOf: list(count: 5, platformId: "zhihu"))
        items.append(contentsOf: list(count: 5, platformId: "weibo", startRank: 1))
        return items
    }

    // MARK: - Edge Cases

    static func withZeroHotValue() -> HotItem {
        make(hotValue: 0, extra: nil)
    }

    static func withVeryLargeHotValue() -> HotItem {
        make(hotValue: 1_000_000_000, extra: "10亿热度")
    }

    static func withNilDescription() -> HotItem {
        HotItem(
            id: "zhihu_1",
            title: "无摘要标题",
            url: URL(string: "https://www.zhihu.com/question/1")!,
            description: nil,
            thumbnailURL: nil,
            hotValue: 100_000,
            extra: nil,
            rank: 1,
            platformId: "zhihu",
            cachedAt: Date(),
            expiresAt: Date().addingTimeInterval(ttlSeconds)
        )
    }
}
