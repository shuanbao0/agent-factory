// MARK: - HotListRepository

/// 热榜数据 Repository 协议（Domain 层，不依赖任何框架）
protocol HotListRepository: Sendable {

    /// 从网络获取热榜并写入缓存
    /// - Parameter platform: 目标平台
    /// - Returns: 最新热榜条目列表
    /// - Throws: HotTopicsError
    func fetchFromNetwork(platform: Platform) async throws -> [HotItem]

    /// 读取有效缓存（TTL 内）
    /// - Parameter platformId: 平台 ID
    /// - Returns: 有效缓存条目，若为空则缓存已过期或不存在
    func getValidCached(platformId: String) async throws -> [HotItem]

    /// 读取所有缓存（含过期，离线降级用）
    func getAllCached(platformId: String) async throws -> [HotItem]

    /// 保存热榜数据到缓存
    func save(_ items: [HotItem], for platform: Platform) async throws

    /// 清理所有过期缓存
    func purgeExpired() async throws

    /// 首次启动时写入平台种子数据
    func seedPlatformsIfNeeded() async throws
}
