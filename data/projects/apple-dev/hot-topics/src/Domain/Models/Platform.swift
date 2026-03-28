// MARK: - Platform

/// 热榜平台信息（值类型，Domain 层）
struct Platform: Identifiable, Sendable, Equatable, Hashable {
    let id: String            // 平台唯一标识，如 "zhihu"
    let name: String          // 中文名，如 "知乎"
    let displayName: String   // 热榜名称，如 "热榜"（来自 API）
    let iconName: String      // SF Symbol 名称
    let category: HotCategory
    let hashId: String        // tophubdata.com 节点 hashid

    // MARK: - Static Platform List
    // ⚠️ hashId 注册 tophubdata.com 后通过 /nodes 补全
    static let all: [Platform] = [
        Platform(
            id: "zhihu", name: "知乎", displayName: "热榜",
            iconName: "lightbulb.fill", category: .general, hashId: "mproPpoq6O"
        ),
        Platform(
            id: "weibo", name: "微博", displayName: "热搜榜",
            iconName: "bubble.left.and.bubble.right", category: .general, hashId: "KqndgxeLl9"
        ),
        Platform(
            id: "bilibili", name: "B站", displayName: "热榜",
            iconName: "play.rectangle.fill", category: .entertainment, hashId: "yx4wpANe5b"
        ),
        Platform(
            id: "douyin", name: "抖音", displayName: "热点",
            iconName: "music.note", category: .entertainment, hashId: ""
        ),
        Platform(
            id: "github", name: "GitHub", displayName: "Trending",
            iconName: "chevron.left.forwardslash.chevron.right", category: .dev, hashId: ""
        ),
        Platform(
            id: "36kr", name: "36氪", displayName: "热榜",
            iconName: "chart.bar.fill", category: .tech, hashId: ""
        ),
        Platform(
            id: "sspai", name: "少数派", displayName: "热门",
            iconName: "star.fill", category: .tech, hashId: ""
        ),
        Platform(
            id: "hupu", name: "虎扑", displayName: "热榜",
            iconName: "sportscourt.fill", category: .community, hashId: ""
        ),
        Platform(
            id: "juejin", name: "掘金", displayName: "热榜",
            iconName: "hammer.fill", category: .dev, hashId: ""
        ),
        Platform(
            id: "v2ex", name: "V2EX", displayName: "热门",
            iconName: "terminal.fill", category: .community, hashId: ""
        ),
        Platform(
            id: "baidu", name: "百度", displayName: "热搜",
            iconName: "magnifyingglass", category: .general, hashId: ""
        ),
        Platform(
            id: "thepaper", name: "澎湃", displayName: "热榜",
            iconName: "newspaper.fill", category: .finance, hashId: ""
        ),
    ]

    static func platforms(for category: HotCategory) -> [Platform] {
        all.filter { $0.category == category }
    }

    /// 已配置 hashId 的平台（可实际请求 API）
    static var available: [Platform] {
        all.filter { !$0.hashId.isEmpty }
    }
}
