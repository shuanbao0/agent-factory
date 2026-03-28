import Foundation

// MARK: - UserDefaultsSearchHistoryRepository

/// 基于 UserDefaults 的搜索历史存储（最多 10 条，最近在前）
final class UserDefaultsSearchHistoryRepository: SearchHistoryRepository, @unchecked Sendable {

    // MARK: - Constants

    private let key = "hot_topics_search_history"
    private let maxCount = 10
    private let defaults: UserDefaults

    // MARK: - Init

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    // MARK: - SearchHistoryRepository

    func getAll() -> [String] {
        defaults.stringArray(forKey: key) ?? []
    }

    func add(_ query: String) {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        var history = getAll()
        history.removeAll { $0 == trimmed }
        history.insert(trimmed, at: 0)
        if history.count > maxCount {
            history = Array(history.prefix(maxCount))
        }
        defaults.set(history, forKey: key)
    }

    func remove(_ query: String) {
        var history = getAll()
        history.removeAll { $0 == query }
        defaults.set(history, forKey: key)
    }

    func clear() {
        defaults.removeObject(forKey: key)
    }
}
