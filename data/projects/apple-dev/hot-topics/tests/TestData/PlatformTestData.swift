import Foundation
@testable import HotTopics

// MARK: - PlatformTestData

/// Test data generator for Platform
enum PlatformTestData {

    // MARK: - Predefined Platforms

    static let zhihu = Platform(
        id: "zhihu",
        name: "知乎",
        displayName: "热榜",
        iconName: "lightbulb.fill",
        category: .general,
        hashId: "mproPpoq6O"
    )

    static let weibo = Platform(
        id: "weibo",
        name: "微博",
        displayName: "热搜榜",
        iconName: "bubble.left.and.bubble.right",
        category: .general,
        hashId: "KqndgxeLl9"
    )

    static let bilibili = Platform(
        id: "bilibili",
        name: "B站",
        displayName: "热榜",
        iconName: "play.rectangle.fill",
        category: .entertainment,
        hashId: "yx4wpANe5b"
    )

    static let github = Platform(
        id: "github",
        name: "GitHub",
        displayName: "Trending",
        iconName: "chevron.left.forwardslash.chevron.right",
        category: .dev,
        hashId: "gh_test_hash"
    )

    static let douyin = Platform(
        id: "douyin",
        name: "抖音",
        displayName: "热点",
        iconName: "music.note",
        category: .entertainment,
        hashId: "dy_test_hash"
    )

    // MARK: - Factory Methods

    /// Create a platform with custom values
    static func make(
        id: String = "test_platform",
        name: String = "测试平台",
        displayName: String = "测试热榜",
        iconName: String = "star.fill",
        category: HotCategory = .general,
        hashId: String = "test_hash_id"
    ) -> Platform {
        Platform(
            id: id,
            name: name,
            displayName: displayName,
            iconName: iconName,
            category: category,
            hashId: hashId
        )
    }

    /// Create platform with empty hashId (unavailable)
    static func unavailable() -> Platform {
        make(hashId: "")
    }

    // MARK: - Collections

    static let all: [Platform] = [zhihu, weibo, bilibili, github, douyin]

    static let generalPlatforms: [Platform] = [zhihu, weibo]

    static let devPlatforms: [Platform] = [github]

    static let entertainmentPlatforms: [Platform] = [bilibili, douyin]

    // MARK: - By Category

    static func platforms(for category: HotCategory) -> [Platform] {
        all.filter { $0.category == category }
    }
}

// MARK: - FavoriteItemTestData

/// Test data generator for FavoriteItem
enum FavoriteItemTestData {

    static func make(
        id: String = UUID().uuidString,
        title: String = "收藏标题",
        platformId: String = "zhihu",
        platformName: String = "知乎",
        isRead: Bool = false
    ) -> FavoriteItem {
        FavoriteItem(
            id: id,
            title: title,
            url: URL(string: "https://www.zhihu.com/question/1")!,
            description: "收藏摘要",
            thumbnailURL: nil,
            hotValue: 100_000,
            extra: "10万热度",
            platformId: platformId,
            platformName: platformName,
            savedAt: Date(),
            isRead: isRead
        )
    }

    static func fromHotItem(_ item: HotItem, platformName: String = "知乎") -> FavoriteItem {
        FavoriteItem(from: item, platformName: platformName)
    }

    static func list(count: Int = 5, platformId: String = "zhihu") -> [FavoriteItem] {
        (1...count).map {
            make(id: "fav_\($0)", title: "收藏 #\($0)", platformId: platformId)
        }
    }

    static func unread() -> FavoriteItem {
        make(isRead: false)
    }

    static func read() -> FavoriteItem {
        make(isRead: true)
    }
}
