import Foundation

// MARK: - ManageFavoritesUseCase

/// 收藏管理 UseCase：增删查 + 已读标记
struct ManageFavoritesUseCase: Sendable {

    // MARK: - Dependencies

    private let repository: FavoritesRepository

    // MARK: - Init

    init(repository: FavoritesRepository) {
        self.repository = repository
    }

    // MARK: - Add

    /// 从 HotItem 创建收藏
    func add(hotItem: HotItem, platformName: String) async throws {
        let exists = try await repository.contains(url: hotItem.url)
        guard !exists else { return }
        let favorite = FavoriteItem(from: hotItem, platformName: platformName)
        try await repository.insert(favorite)
    }

    /// 直接插入 FavoriteItem
    func add(_ item: FavoriteItem) async throws {
        let exists = try await repository.contains(url: item.url)
        guard !exists else { return }
        try await repository.insert(item)
    }

    // MARK: - Remove

    func remove(id: String) async throws {
        try await repository.delete(id: id)
    }

    // MARK: - Fetch

    func fetchAll() async throws -> [FavoriteItem] {
        try await repository.fetchAll()
    }

    func fetchByPlatform(platformId: String) async throws -> [FavoriteItem] {
        try await repository.fetchByPlatform(platformId: platformId)
    }

    // MARK: - Read State

    func markAsRead(id: String) async throws {
        try await repository.markAsRead(id: id)
    }

    func toggleRead(id: String) async throws {
        let all = try await repository.fetchAll()
        guard let item = all.first(where: { $0.id == id }) else { return }
        if item.isRead {
            // Mark as unread — re-insert with isRead = false after delete
            try await repository.delete(id: id)
            var updated = item
            updated.isRead = false
            try await repository.insert(updated)
        } else {
            try await repository.markAsRead(id: id)
        }
    }

    func contains(url: URL) async throws -> Bool {
        try await repository.contains(url: url)
    }
}
