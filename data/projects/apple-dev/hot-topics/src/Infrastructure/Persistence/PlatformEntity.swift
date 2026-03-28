import Foundation
import SwiftData

// MARK: - PlatformEntity

/// SwiftData 平台实体（种子数据 + 缓存关联）
@Model
final class PlatformEntity {
    @Attribute(.unique) var id: String
    var name: String
    var displayName: String
    var iconName: String
    var categoryRaw: String
    var hashId: String

    @Relationship(deleteRule: .cascade, inverse: \HotItemEntity.platform)
    var hotItems: [HotItemEntity]?

    init(
        id: String,
        name: String,
        displayName: String,
        iconName: String,
        categoryRaw: String,
        hashId: String
    ) {
        self.id = id
        self.name = name
        self.displayName = displayName
        self.iconName = iconName
        self.categoryRaw = categoryRaw
        self.hashId = hashId
    }

    // MARK: - Conversion

    convenience init(from platform: Platform) {
        self.init(
            id: platform.id,
            name: platform.name,
            displayName: platform.displayName,
            iconName: platform.iconName,
            categoryRaw: platform.category.rawValue,
            hashId: platform.hashId
        )
    }

    func toDomain() -> Platform {
        Platform(
            id: id,
            name: name,
            displayName: displayName,
            iconName: iconName,
            category: HotCategory(rawValue: categoryRaw) ?? .general,
            hashId: hashId
        )
    }
}
