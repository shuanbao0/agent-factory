import Foundation
import SwiftData

// MARK: - SwiftDataHotListRepository

/// HotListRepository 的 SwiftData 实现
final class SwiftDataHotListRepository: HotListRepository, @unchecked Sendable {

    // MARK: - Dependencies

    private let modelContext: ModelContext
    private let apiClient: TophubAPIClient

    // MARK: - Init

    init(
        modelContext: ModelContext,
        apiClient: TophubAPIClient = TophubAPIClient(
            apiKey: UserDefaults.standard.string(forKey: "tophub_api_key") ?? ""
        )
    ) {
        self.modelContext = modelContext
        self.apiClient = apiClient
    }

    // MARK: - HotListRepository

    func fetchFromNetwork(platform: Platform) async throws -> [HotItem] {
        try await apiClient.fetchHotList(platform: platform)
    }

    func getValidCached(platformId: String) async throws -> [HotItem] {
        let now = Date()
        let predicate = #Predicate<HotItemEntity> { entity in
            entity.platformId == platformId && entity.expiresAt > now
        }
        let descriptor = FetchDescriptor<HotItemEntity>(
            predicate: predicate,
            sortBy: [SortDescriptor(\.rank)]
        )
        let entities = try modelContext.fetch(descriptor)
        return entities.compactMap { $0.toDomain() }
    }

    func getAllCached(platformId: String) async throws -> [HotItem] {
        let predicate = #Predicate<HotItemEntity> { entity in
            entity.platformId == platformId
        }
        let descriptor = FetchDescriptor<HotItemEntity>(
            predicate: predicate,
            sortBy: [SortDescriptor(\.rank)]
        )
        let entities = try modelContext.fetch(descriptor)
        return entities.compactMap { $0.toDomain() }
    }

    func save(_ items: [HotItem], for platform: Platform) async throws {
        // 删除该平台旧缓存
        let platformId = platform.id
        let predicate = #Predicate<HotItemEntity> { entity in
            entity.platformId == platformId
        }
        let descriptor = FetchDescriptor<HotItemEntity>(predicate: predicate)
        let existing = try modelContext.fetch(descriptor)
        for entity in existing {
            modelContext.delete(entity)
        }
        // 插入新数据
        for item in items {
            modelContext.insert(HotItemEntity(from: item))
        }
        try modelContext.save()
        updateWidgetCache(items: items, platform: platform)
    }

    func purgeExpired() async throws {
        let now = Date()
        let predicate = #Predicate<HotItemEntity> { entity in
            entity.expiresAt < now
        }
        let descriptor = FetchDescriptor<HotItemEntity>(predicate: predicate)
        let expired = try modelContext.fetch(descriptor)
        for entity in expired {
            modelContext.delete(entity)
        }
        try modelContext.save()
    }

    func seedPlatformsIfNeeded() async throws {
        let descriptor = FetchDescriptor<PlatformEntity>()
        let count = try modelContext.fetchCount(descriptor)
        guard count == 0 else { return } // swiftlint:disable:this empty_count

        for platform in Platform.all {
            modelContext.insert(PlatformEntity(from: platform))
        }
        try modelContext.save()
    }

    // MARK: - Widget Cache

    /// 写入 Widget 共享 JSON 缓存（App Group，best-effort）
    private func updateWidgetCache(items: [HotItem], platform: Platform) {
        guard let groupURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.com.hotapp.hottopics"
        ) else { return }
        let fileURL = groupURL.appending(path: "widget_cache.json")

        // 读取已有缓存，合并后保留前 10 条
        var existing: [WidgetCacheItem] = []
        if let data = try? Data(contentsOf: fileURL) {
            existing = (try? JSONDecoder().decode([WidgetCacheItem].self, from: data)) ?? []
        }
        // 移除当前平台旧数据
        existing.removeAll { $0.platformName == platform.name }
        // 追加新数据（取前 3 条）
        let newItems = items.prefix(3).map { item in
            WidgetCacheItem(
                id: item.id,
                title: item.title,
                platformName: platform.name,
                rank: item.rank
            )
        }
        existing.append(contentsOf: newItems)
        // 按 rank 排序，截取前 10
        existing.sort { $0.rank < $1.rank }
        if existing.count > 10 {
            existing = Array(existing.prefix(10))
        }
        if let data = try? JSONEncoder().encode(existing) {
            try? data.write(to: fileURL, options: .atomic)
        }
    }
}

// MARK: - WidgetCacheItem

/// Widget 共享缓存条目（与 WidgetExtension 的 WidgetHotItem 结构对齐）
private struct WidgetCacheItem: Codable {
    let id: String
    let title: String
    let platformName: String
    let rank: Int
}
