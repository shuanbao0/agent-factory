import Foundation
@testable import HotTopics
import Testing

// MARK: - MockFavoritesRepository

/// Mock FavoritesRepository for testing
final class MockFavoritesRepository: FavoritesRepository, @unchecked Sendable {

    // MARK: - Storage

    var favorites: [FavoriteItem] = []

    // MARK: - Errors

    var insertError: HotTopicsError?
    var deleteError: HotTopicsError?
    var fetchAllError: HotTopicsError?
    var markAsReadError: HotTopicsError?
    var containsResult: Bool?

    // MARK: - Call Tracking

    private(set) var insertCalls: [FavoriteItem] = []
    private(set) var deleteCalls: [String] = []
    private(set) var fetchAllCallCount: Int = 0
    private(set) var markAsReadCalls: [String] = []
    private(set) var containsCalls: [URL] = []
    private(set) var fetchByPlatformCalls: [String] = []

    // MARK: - FavoritesRepository Conformance

    func insert(_ item: FavoriteItem) async throws {
        insertCalls.append(item)
        if let error = insertError { throw error }
        favorites.append(item)
    }

    func delete(id: String) async throws {
        deleteCalls.append(id)
        if let error = deleteError { throw error }
        favorites.removeAll { $0.id == id }
    }

    func markAsRead(id: String) async throws {
        markAsReadCalls.append(id)
        if let error = markAsReadError { throw error }
        if let index = favorites.firstIndex(where: { $0.id == id }) {
            favorites[index].isRead = true
        }
    }

    func fetchAll() async throws -> [FavoriteItem] {
        fetchAllCallCount += 1
        if let error = fetchAllError { throw error }
        return favorites.sorted { $0.savedAt > $1.savedAt }
    }

    func fetchByPlatform(platformId: String) async throws -> [FavoriteItem] {
        fetchByPlatformCalls.append(platformId)
        return favorites.filter { $0.platformId == platformId }
    }

    func contains(url: URL) async throws -> Bool {
        containsCalls.append(url)
        if let result = containsResult { return result }
        return favorites.contains { $0.url == url }
    }

    // MARK: - Reset

    func reset() {
        favorites = []
        insertCalls = []
        deleteCalls = []
        fetchAllCallCount = 0
        markAsReadCalls = []
        containsCalls = []
        fetchByPlatformCalls = []
        insertError = nil
        deleteError = nil
        fetchAllError = nil
        markAsReadError = nil
        containsResult = nil
    }
}
