import Foundation

// MARK: - HotTopicsError

/// 统一错误类型（Domain 层）
enum HotTopicsError: LocalizedError, Sendable, Equatable {
    case networkUnavailable
    case apiError(String)
    case authorizationFailed
    case rateLimited
    case cacheReadError
    case cacheWriteError
    case invalidURL(String)
    case unknown

    var errorDescription: String? {
        switch self {
        case .networkUnavailable:
            return "网络不可用，显示缓存数据"
        case .apiError(let msg):
            return "获取数据失败：\(msg)"
        case .authorizationFailed:
            return "API Key 验证失败，请在设置中更新"
        case .rateLimited:
            return "请求过于频繁，请稍后重试"
        case .cacheReadError:
            return "读取缓存失败"
        case .cacheWriteError:
            return "写入缓存失败"
        case .invalidURL(let url):
            return "无效链接：\(url)"
        case .unknown:
            return "未知错误"
        }
    }

    var shouldShowToUser: Bool {
        switch self {
        case .cacheReadError, .cacheWriteError: return false
        default: return true
        }
    }
}
