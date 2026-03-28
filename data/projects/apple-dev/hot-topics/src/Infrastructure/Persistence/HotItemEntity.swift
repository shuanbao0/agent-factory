import Foundation
import SwiftData

// MARK: - HotItemEntity

/// SwiftData 热榜条目实体
@Model
final class HotItemEntity {
    @Attribute(.unique) var id: String
    var title: String
    var urlString: String
    var descriptionText: String?
    var thumbnailURLString: String?
    var hotValue: Int
    var extra: String?
    var rank: Int
    var platformId: String
    var cachedAt: Date
    var expiresAt: Date

    @Relationship(deleteRule: .nullify)
    var platform: PlatformEntity?

    // MARK: - Computed

    var isExpired: Bool { expiresAt < Date() }

    // MARK: - Init

    init(
        id: String,
        title: String,
        urlString: String,
        descriptionText: String?,
        thumbnailURLString: String?,
        hotValue: Int,
        extra: String?,
        rank: Int,
        platformId: String,
        cachedAt: Date,
        expiresAt: Date
    ) {
        self.id = id
        self.title = title
        self.urlString = urlString
        self.descriptionText = descriptionText
        self.thumbnailURLString = thumbnailURLString
        self.hotValue = hotValue
        self.extra = extra
        self.rank = rank
        self.platformId = platformId
        self.cachedAt = cachedAt
        self.expiresAt = expiresAt
    }

    /// 便捷初始化：接受 URL 类型参数（测试友好）
    convenience init(
        id: String,
        title: String,
        url: URL,
        descriptionText: String?,
        thumbnailURL: URL?,
        hotValue: Int,
        extra: String?,
        rank: Int,
        platformId: String,
        cachedAt: Date,
        expiresAt: Date
    ) {
        self.init(
            id: id,
            title: title,
            urlString: url.absoluteString,
            descriptionText: descriptionText,
            thumbnailURLString: thumbnailURL?.absoluteString,
            hotValue: hotValue,
            extra: extra,
            rank: rank,
            platformId: platformId,
            cachedAt: cachedAt,
            expiresAt: expiresAt
        )
    }

    // MARK: - Conversion

    convenience init(from item: HotItem) {
        self.init(
            id: item.id,
            title: item.title,
            urlString: item.url.absoluteString,
            descriptionText: item.description,
            thumbnailURLString: item.thumbnailURL?.absoluteString,
            hotValue: item.hotValue,
            extra: item.extra,
            rank: item.rank,
            platformId: item.platformId,
            cachedAt: item.cachedAt,
            expiresAt: item.expiresAt
        )
    }

    func toDomain() -> HotItem? {
        guard let url = URL(string: urlString) else { return nil }
        return HotItem(
            id: id,
            title: title,
            url: url,
            description: descriptionText,
            thumbnailURL: thumbnailURLString.flatMap { URL(string: $0) },
            hotValue: hotValue,
            extra: extra,
            rank: rank,
            platformId: platformId,
            cachedAt: cachedAt,
            expiresAt: expiresAt
        )
    }
}
