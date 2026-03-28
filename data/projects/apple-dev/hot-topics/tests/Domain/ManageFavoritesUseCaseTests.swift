import Foundation
import Testing
@testable import HotTopics

// MARK: - ManageFavoritesUseCase Tests

@Suite("ManageFavoritesUseCase — Favorites CRUD")
struct ManageFavoritesUseCaseTests {

    // MARK: - Add

    @Test("add inserts favorite via repository")
    func test_add_insertsFavorite() async throws {
        let mockRepo = MockFavoritesRepository()
        let sut = ManageFavoritesUseCase(repository: mockRepo)

        let hotItem = HotItemTestData.make(rank: 1, platformId: "zhihu")
        try await sut.add(hotItem: hotItem, platformName: "知乎")

        #expect(mockRepo.insertCalls.count == 1)
        #expect(mockRepo.insertCalls.first?.title == hotItem.title)
        #expect(mockRepo.insertCalls.first?.platformId == "zhihu")
    }

    @Test("add creates FavoriteItem with correct platformName")
    func test_add_setsPlatformName() async throws {
        let mockRepo = MockFavoritesRepository()
        let sut = ManageFavoritesUseCase(repository: mockRepo)

        let hotItem = HotItemTestData.make(platformId: "weibo")
        try await sut.add(hotItem: hotItem, platformName: "微博")

        #expect(mockRepo.insertCalls.first?.platformName == "微博")
    }

    @Test("add marks new favorite as unread")
    func test_add_setsUnread() async throws {
        let mockRepo = MockFavoritesRepository()
        let sut = ManageFavoritesUseCase(repository: mockRepo)

        let hotItem = HotItemTestData.make()
        try await sut.add(hotItem: hotItem, platformName: "知乎")

        #expect(mockRepo.insertCalls.first?.isRead == false)
    }

    @Test("add throws repository error")
    func test_add_repositoryError_throws() async throws {
        let mockRepo = MockFavoritesRepository()
        mockRepo.insertError = .cacheWriteError
        let sut = ManageFavoritesUseCase(repository: mockRepo)

        let hotItem = HotItemTestData.make()

        await #expect(throws: HotTopicsError.cacheWriteError) {
            try await sut.add(hotItem: hotItem, platformName: "知乎")
        }
    }

    // MARK: - Remove

    @Test("remove deletes favorite by id")
    func test_remove_deletesFavorite() async throws {
        let mockRepo = MockFavoritesRepository()
        mockRepo.favorites = FavoriteItemTestData.list(count: 3)
        let targetId = mockRepo.favorites[1].id
        let sut = ManageFavoritesUseCase(repository: mockRepo)

        try await sut.remove(id: targetId)

        #expect(mockRepo.deleteCalls == [targetId])
        #expect(mockRepo.favorites.count == 2)
    }

    @Test("remove throws error when not found")
    func test_remove_notFound_throws() async throws {
        let mockRepo = MockFavoritesRepository()
        mockRepo.deleteError = .unknown
        let sut = ManageFavoritesUseCase(repository: mockRepo)

        await #expect(throws: HotTopicsError.unknown) {
            try await sut.remove(id: "nonexistent")
        }
    }

    // MARK: - Fetch All

    @Test("fetchAll returns all favorites")
    func test_fetchAll_returnsAll() async throws {
        let mockRepo = MockFavoritesRepository()
        let items = FavoriteItemTestData.list(count: 5)
        mockRepo.favorites = items
        let sut = ManageFavoritesUseCase(repository: mockRepo)

        let result = try await sut.fetchAll()

        #expect(result.count == 5)
        #expect(mockRepo.fetchAllCallCount == 1)
    }

    @Test("fetchAll returns empty when no favorites")
    func test_fetchAll_empty() async throws {
        let mockRepo = MockFavoritesRepository()
        let sut = ManageFavoritesUseCase(repository: mockRepo)

        let result = try await sut.fetchAll()

        #expect(result.isEmpty)
    }

    @Test("fetchAll throws error on failure")
    func test_fetchAll_error_throws() async throws {
        let mockRepo = MockFavoritesRepository()
        mockRepo.fetchAllError = .cacheReadError
        let sut = ManageFavoritesUseCase(repository: mockRepo)

        await #expect(throws: HotTopicsError.cacheReadError) {
            try await sut.fetchAll()
        }
    }

    // MARK: - Mark as Read

    @Test("markAsRead updates isRead flag")
    func test_markAsRead_setsFlag() async throws {
        let mockRepo = MockFavoritesRepository()
        let item = FavoriteItemTestData.unread()
        mockRepo.favorites = [item]
        let sut = ManageFavoritesUseCase(repository: mockRepo)

        try await sut.markAsRead(id: item.id)

        #expect(mockRepo.markAsReadCalls == [item.id])
        #expect(mockRepo.favorites.first?.isRead == true)
    }

    @Test("markAsRead handles nonexistent id")
    func test_markAsRead_notFound_noops() async throws {
        let mockRepo = MockFavoritesRepository()
        mockRepo.favorites = FavoriteItemTestData.list(count: 2)
        let sut = ManageFavoritesUseCase(repository: mockRepo)

        // Should not throw, just no-op
        try await sut.markAsRead(id: "nonexistent")

        #expect(mockRepo.markAsReadCalls == ["nonexistent"])
    }

    // MARK: - Fetch by Platform

    @Test("fetchByPlatform filters correctly")
    func test_fetchByPlatform_filters() async throws {
        let mockRepo = MockFavoritesRepository()
        var items = FavoriteItemTestData.list(count: 3, platformId: "zhihu")
        items.append(contentsOf: FavoriteItemTestData.list(count: 2, platformId: "weibo"))
        mockRepo.favorites = items
        let sut = ManageFavoritesUseCase(repository: mockRepo)

        let result = try await sut.fetchByPlatform(platformId: "zhihu")

        #expect(result.count == 3)
        #expect(result.allSatisfy { $0.platformId == "zhihu" })
    }

    // MARK: - Toggle Read

    @Test("toggleRead marks unread as read")
    func test_toggleRead_unreadToRead() async throws {
        let mockRepo = MockFavoritesRepository()
        let item = FavoriteItemTestData.unread()
        mockRepo.favorites = [item]
        let sut = ManageFavoritesUseCase(repository: mockRepo)

        try await sut.toggleRead(id: item.id)

        #expect(mockRepo.favorites.first?.isRead == true)
    }

    @Test("toggleRead marks read as unread")
    func test_toggleRead_readToUnread() async throws {
        let mockRepo = MockFavoritesRepository()
        let item = FavoriteItemTestData.read()
        mockRepo.favorites = [item]
        let sut = ManageFavoritesUseCase(repository: mockRepo)

        try await sut.toggleRead(id: item.id)

        #expect(mockRepo.favorites.first?.isRead == false)
    }
}
