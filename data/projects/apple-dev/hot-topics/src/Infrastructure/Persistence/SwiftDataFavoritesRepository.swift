import Foundation
import SwiftData

// MARK: - SwiftDataFavoritesRepository

/// FavoritesRepository 的 SwiftData 实现
final class SwiftDataFavoritesRepository: FavoritesRepository, @unchecked Sendable {

    // MARK: - Dependencies

    private let modelContext: ModelContext

    // MARK: - Init

    init(modelContext: ModelContext) {
        self.modelContext = modelContext
    }

    // MARK: - FavoritesRepository

    func insert(_ item: FavoriteItem) async throws {
        modelContext.insert(FavoriteItemEntity(from: item))
        try modelContext.save()
    }

    func delete(id: String) async throws {
        let predicate = #Predicate<FavoriteItemEntity> { entity in
            entity.id == id
        }
        let descriptor = FetchDescriptor<FavoriteItemEntity>(predicate: predicate)
        let entities = try modelContext.fetch(descriptor)
        for entity in entities {
            modelContext.delete(entity)
        }
        try modelContext.save()
    }

    func markAsRead(id: String) async throws {
        let predicate = #Predicate<FavoriteItemEntity> { entity in
            entity.id == id
        }
        let descriptor = FetchDescriptor<FavoriteItemEntity>(predicate: predicate)
        let entities = try modelContext.fetch(descriptor)
        if let entity = entities.first {
            entity.isRead = true
            try modelContext.save()
        }
    }

    func fetchAll() async throws -> [FavoriteItem] {
        let descriptor = FetchDescriptor<FavoriteItemEntity>(
            sortBy: [SortDescriptor(\.savedAt, order: .reverse)]
        )
        let entities = try modelContext.fetch(descriptor)
        return entities.compactMap { $0.toDomain() }
    }

    func fetchByPlatform(platformId: String) async throws -> [FavoriteItem] {
        let predicate = #Predicate<FavoriteItemEntity> { entity in
            entity.platformId == platformId
        }
        let descriptor = FetchDescriptor<FavoriteItemEntity>(
            predicate: predicate,
            sortBy: [SortDescriptor(\.savedAt, order: .reverse)]
        )
        let entities = try modelContext.fetch(descriptor)
        return entities.compactMap { $0.toDomain() }
    }

    func contains(url: URL) async throws -> Bool {
        let urlString = url.absoluteString
        let predicate = #Predicate<FavoriteItemEntity> { entity in
            entity.urlString == urlString
        }
        let descriptor = FetchDescriptor<FavoriteItemEntity>(predicate: predicate)
        return try modelContext.fetchCount(descriptor) > 0
    }
}
