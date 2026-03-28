// MARK: - HotCategory

/// 热榜分类枚举，7 大分类
enum HotCategory: String, CaseIterable, Sendable, Identifiable, Codable {
    case general       = "综合"
    case tech          = "科技"
    case entertainment = "娱乐"
    case community     = "社区"
    case finance       = "财经"
    case dev           = "开发"
    case ai            = "AI"

    var id: String { rawValue }

    var displayName: String { rawValue }

    var sfSymbol: String {
        switch self {
        case .general:       return "flame.fill"
        case .tech:          return "cpu.fill"
        case .entertainment: return "tv.fill"
        case .community:     return "person.3.fill"
        case .finance:       return "chart.line.uptrend.xyaxis"
        case .dev:           return "chevron.left.forwardslash.chevron.right"
        case .ai:            return "brain.fill"
        }
    }
}
