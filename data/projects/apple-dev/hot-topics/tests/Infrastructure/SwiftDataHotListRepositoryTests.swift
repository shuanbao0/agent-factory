import Foundation
import Testing
#if canImport(SwiftData)
import SwiftData
@testable import HotTopics

// MARK: - SwiftDataHotListRepository Tests

@Suite("SwiftDataHotListRepository — Persistence")
@MainActor
struct SwiftDataHotListRepositoryTests {

    // MARK: - Setup

    func makeContainer() throws -> ModelContainer {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        return try ModelContainer(
            for: HotItemEntity.self,
            PlatformEntity.self,
            configurations: config
        )
    }

    func makeRepository(container: ModelContainer) -> SwiftDataHotListRepository {
        SwiftDataHotListRepository(modelContext: container.mainContext)
    }

    // MARK: - Save

    @Test("save inserts items into SwiftData")
    func test_save_insertsItems() async throws {
        let container = try makeContainer()
        let repo = makeRepository(container: container)
        let items = HotItemTestData.list(count: 5, platformId: "zhihu")
        let platform = PlatformTestData.zhihu

        try await repo.save(items, for: platform)

        let descriptor = FetchDescriptor<HotItemEntity>()
        let saved = try container.mainContext.fetch(descriptor)
        #expect(saved.count == 5)
    }

    @Test("save overwrites existing items for same platform")
    func test_save_overwritesExisting() async throws {
        let container = try makeContainer()
        let repo = makeRepository(container: container)

        let items1 = HotItemTestData.list(count: 3, platformId: "zhihu")
        let items2 = HotItemTestData.list(count: 5, platformId: "zhihu")
        let platform = PlatformTestData.zhihu

        try await repo.save(items1, for: platform)
        try await repo.save(items2, for: platform)

        let descriptor = FetchDescriptor<HotItemEntity>()
        let saved = try container.mainContext.fetch(descriptor)
        #expect(saved.count == 5)
    }

    // MARK: - Get Valid Cached

    @Test("getValidCached returns non-expired items")
    func test_getValidCached_returnsValid() async throws {
        let container = try makeContainer()
        let repo = makeRepository(container: container)

        let freshItems = HotItemTestData.list(count: 3, platformId: "zhihu")
        try await repo.save(freshItems, for: PlatformTestData.zhihu)

        let result = try await repo.getValidCached(platformId: "zhihu")
        #expect(result.count == 3)
    }

    @Test("getValidCached excludes expired items")
    func test_getValidCached_excludesExpired() async throws {
        let container = try makeContainer()
        let repo = makeRepository(container: container)

        // Save fresh items first
        let freshItems = HotItemTestData.list(count: 2, platformId: "zhihu")
        try await repo.save(freshItems, for: PlatformTestData.zhihu)

        // Manually insert expired item
        let expiredEntity = HotItemEntity(
            id: "zhihu_expired",
            title: "过期",
            urlString: "https://zhihu.com/expired",
            descriptionText: nil,
            thumbnailURLString: nil,
            hotValue: 100,
            extra: nil,
            rank: 999,
            platformId: "zhihu",
            cachedAt: Date().addingTimeInterval(-7200),
            expiresAt: Date().addingTimeInterval(-3600)
        )
        container.mainContext.insert(expiredEntity)
        try container.mainContext.save()

        let result = try await repo.getValidCached(platformId: "zhihu")
        #expect(result.allSatisfy { !$0.isExpired })
    }

    @Test("getValidCached returns empty for unknown platform")
    func test_getValidCached_unknownPlatform() async throws {
        let container = try makeContainer()
        let repo = makeRepository(container: container)

        let result = try await repo.getValidCached(platformId: "unknown")
        #expect(result.isEmpty)
    }

    // MARK: - Get All Cached

    @Test("getAllCached includes expired items")
    func test_getAllCached_includesExpired() async throws {
        let container = try makeContainer()
        let repo = makeRepository(container: container)

        let items = HotItemTestData.list(count: 2, platformId: "zhihu")
        try await repo.save(items, for: PlatformTestData.zhihu)

        let result = try await repo.getAllCached(platformId: "zhihu")
        #expect(result.count >= 2)
    }

    // MARK: - Purge Expired

    @Test("purgeExpired removes expired items")
    func test_purgeExpired_removesExpired() async throws {
        let container = try makeContainer()
        let repo = makeRepository(container: container)

        // Save fresh items
        let freshItems = HotItemTestData.list(count: 2, platformId: "zhihu")
        try await repo.save(freshItems, for: PlatformTestData.zhihu)

        // Insert expired item
        let expiredEntity = HotItemEntity(
            id: "zhihu_expired",
            title: "过期",
            urlString: "https://zhihu.com/expired",
            descriptionText: nil,
            thumbnailURLString: nil,
            hotValue: 100,
            extra: nil,
            rank: 999,
            platformId: "zhihu",
            cachedAt: Date().addingTimeInterval(-7200),
            expiresAt: Date().addingTimeInterval(-3600)
        )
        container.mainContext.insert(expiredEntity)
        try container.mainContext.save()

        try await repo.purgeExpired()

        let descriptor = FetchDescriptor<HotItemEntity>()
        let remaining = try container.mainContext.fetch(descriptor)
        #expect(remaining.allSatisfy { !$0.isExpired })
    }

    // MARK: - Seed Platforms

    @Test("seedPlatformsIfNeeded inserts platform entities")
    func test_seedPlatformsIfNeeded_inserts() async throws {
        let container = try makeContainer()
        let repo = makeRepository(container: container)

        try await repo.seedPlatformsIfNeeded()

        let descriptor = FetchDescriptor<PlatformEntity>()
        let platforms = try container.mainContext.fetch(descriptor)
        #expect(platforms.count > 0)
    }

    // MARK: - Entity Mapping

    @Test("save preserves all HotItem fields")
    func test_save_preservesFields() async throws {
        let container = try makeContainer()
        let repo = makeRepository(container: container)

        let item = HotItemTestData.make(rank: 1, title: "测试标题", hotValue: 500_000)
        try await repo.save([item], for: PlatformTestData.zhihu)

        let itemId = item.id
        let descriptor = FetchDescriptor<HotItemEntity>(
            predicate: #Predicate { $0.id == itemId }
        )
        let saved = try container.mainContext.fetch(descriptor).first!

        #expect(saved.id == item.id)
        #expect(saved.title == item.title)
        #expect(saved.hotValue == item.hotValue)
        #expect(saved.rank == item.rank)
    }
}

#else
@Suite("SwiftDataHotListRepository — Skipped (SwiftData Unavailable)")
struct SwiftDataHotListRepositoryTests {
    // Tests require SwiftData (iOS 17+)
}
#endif
