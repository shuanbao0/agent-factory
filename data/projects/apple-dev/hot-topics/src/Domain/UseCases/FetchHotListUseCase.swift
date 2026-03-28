import Foundation

// MARK: - FetchHotListUseCase

/// 获取热榜 UseCase：缓存有效直接返回，否则走网络
/// 无状态 struct，线程安全
struct FetchHotListUseCase: Sendable {

    // MARK: - Dependencies

    private let repository: HotListRepository

    // MARK: - Init

    init(repository: HotListRepository) {
        self.repository = repository
    }

    // MARK: - Execute

    /// 获取热榜（缓存优先）
    /// - Parameter platform: 目标平台
    /// - Returns: 热榜条目列表（来自缓存或网络）
    func execute(platform: Platform) async throws -> [HotItem] {
        // 1. 尝试读取有效缓存
        let cached = try await repository.getValidCached(platformId: platform.id)
        if !cached.isEmpty {
            return cached
        }
        // 2. 缓存无效，走网络
        let items = try await repository.fetchFromNetwork(platform: platform)
        // 3. 写入缓存
        try await repository.save(items, for: platform)
        return items
    }

    /// 强制刷新（忽略缓存，直接走网络）
    func forceRefresh(platform: Platform) async throws -> [HotItem] {
        let items = try await repository.fetchFromNetwork(platform: platform)
        try await repository.save(items, for: platform)
        return items
    }
}
