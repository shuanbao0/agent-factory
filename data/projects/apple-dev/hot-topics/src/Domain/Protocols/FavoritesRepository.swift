import Foundation

// MARK: - FavoritesRepository

/// 收藏数据 Repository 协议（Domain 层）
protocol FavoritesRepository: Sendable {

    /// 添加收藏
    func insert(_ item: FavoriteItem) async throws

    /// 删除收藏
    /// - Parameter id: FavoriteItem.id（UUID 字符串）
    func delete(id: String) async throws

    /// 标记为已读
    func markAsRead(id: String) async throws

    /// 获取所有收藏（按收藏时间倒序）
    func fetchAll() async throws -> [FavoriteItem]

    /// 按平台过滤收藏
    func fetchByPlatform(platformId: String) async throws -> [FavoriteItem]

    /// 检查指定 URL 是否已收藏
    func contains(url: URL) async throws -> Bool
}
