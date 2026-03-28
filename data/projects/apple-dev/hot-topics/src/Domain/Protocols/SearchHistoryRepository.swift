// MARK: - SearchHistoryRepository

/// 搜索历史 Repository 协议（Domain 层，不依赖任何框架）
protocol SearchHistoryRepository: Sendable {

    /// 获取所有搜索历史（最近在前）
    func getAll() -> [String]

    /// 添加搜索记录（去重，置顶，上限 10 条）
    func add(_ query: String)

    /// 删除指定搜索记录
    func remove(_ query: String)

    /// 清空所有搜索历史
    func clear()
}
