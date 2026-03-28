import Foundation

// MARK: - FavoriteItem

/// 收藏条目（值类型，Domain 层）
/// 独立存储，不依赖缓存，缓存清理不影响收藏
struct FavoriteItem: Identifiable, Sendable, Equatable {
    let id: String
    let title: String
    let url: URL
    let description: String?
    let thumbnailURL: URL?
    let hotValue: Int
    let extra: String?
    let platformId: String
    let platformName: String  // 冗余存储，避免查 Platform
    let savedAt: Date
    var isRead: Bool

    // MARK: - Init from HotItem

    init(from hotItem: HotItem, platformName: String) {
        self.id           = UUID().uuidString
        self.title        = hotItem.title
        self.url          = hotItem.url
        self.description  = hotItem.description
        self.thumbnailURL = hotItem.thumbnailURL
        self.hotValue     = hotItem.hotValue
        self.extra        = hotItem.extra
        self.platformId   = hotItem.platformId
        self.platformName = platformName
        self.savedAt      = Date()
        self.isRead       = false
    }

    // MARK: - Direct Init

    init(
        id: String = UUID().uuidString,
        title: String,
        url: URL,
        description: String? = nil,
        thumbnailURL: URL? = nil,
        hotValue: Int,
        extra: String? = nil,
        platformId: String,
        platformName: String,
        savedAt: Date = Date(),
        isRead: Bool = false
    ) {
        self.id           = id
        self.title        = title
        self.url          = url
        self.description  = description
        self.thumbnailURL = thumbnailURL
        self.hotValue     = hotValue
        self.extra        = extra
        self.platformId   = platformId
        self.platformName = platformName
        self.savedAt      = savedAt
        self.isRead       = isRead
    }

    var formattedSavedAt: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        formatter.timeStyle = .short
        return formatter.string(from: savedAt)
    }
}
