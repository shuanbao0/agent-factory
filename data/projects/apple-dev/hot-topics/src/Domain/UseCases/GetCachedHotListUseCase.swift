// MARK: - GetCachedHotListUseCase

/// 仅读缓存的 UseCase（Widget 用）
/// 返回 (items, isStale) — isStale 表示数据已过 TTL
struct GetCachedHotListUseCase: Sendable {

    // MARK: - Dependencies

    private let repository: HotListRepository

    // MARK: - Init

    init(repository: HotListRepository) {
        self.repository = repository
    }

    // MARK: - Execute

    /// 读取缓存数据
    /// - Parameter platformId: 平台 ID
    /// - Returns: (items, isStale) — 优先返回有效缓存；无效时返回所有缓存并标记 stale
    func execute(platformId: String) async throws -> (items: [HotItem], isStale: Bool) {
        let valid = try await repository.getValidCached(platformId: platformId)
        if !valid.isEmpty {
            return (valid, false)
        }
        let all = try await repository.getAllCached(platformId: platformId)
        return (all, true)
    }
}
