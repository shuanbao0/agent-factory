import Foundation
import SwiftData

// MARK: - FavoriteItemEntity

/// SwiftData 收藏条目实体（独立存储，不依赖缓存）
@Model
final class FavoriteItemEntity {
    @Attribute(.unique) var id: String
    var title: String
    var urlString: String
    var itemDescription: String?
    var thumbnailURLString: String?
    var hotValue: Int
    var extra: String?
    var platformId: String
    var platformName: String
    var savedAt: Date
    var isRead: Bool

    init(
        id: String,
        title: String,
        urlString: String,
        itemDescription: String?,
        thumbnailURLString: String?,
        hotValue: Int,
        extra: String?,
        platformId: String,
        platformName: String,
        savedAt: Date,
        isRead: Bool
    ) {
        self.id = id
        self.title = title
        self.urlString = urlString
        self.itemDescription = itemDescription
        self.thumbnailURLString = thumbnailURLString
        self.hotValue = hotValue
        self.extra = extra
        self.platformId = platformId
        self.platformName = platformName
        self.savedAt = savedAt
        self.isRead = isRead
    }

    // MARK: - Conversion

    convenience init(from item: FavoriteItem) {
        self.init(
            id: item.id,
            title: item.title,
            urlString: item.url.absoluteString,
            itemDescription: item.description,
            thumbnailURLString: item.thumbnailURL?.absoluteString,
            hotValue: item.hotValue,
            extra: item.extra,
            platformId: item.platformId,
            platformName: item.platformName,
            savedAt: item.savedAt,
            isRead: item.isRead
        )
    }

    func toDomain() -> FavoriteItem? {
        guard let url = URL(string: urlString) else { return nil }
        return FavoriteItem(
            id: id,
            title: title,
            url: url,
            description: itemDescription,
            thumbnailURL: thumbnailURLString.flatMap { URL(string: $0) },
            hotValue: hotValue,
            extra: extra,
            platformId: platformId,
            platformName: platformName,
            savedAt: savedAt,
            isRead: isRead
        )
    }
}
