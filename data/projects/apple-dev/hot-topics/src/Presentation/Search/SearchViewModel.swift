import Foundation

// MARK: - SearchViewModel

/// 搜索页 ViewModel（本地过滤 + 搜索历史管理）
@Observable @MainActor
final class SearchViewModel {

    // MARK: - State

    var query: String = ""
    var recentSearches: [String] = []
    private var allItems: [HotItem] = []

    // MARK: - Dependencies

    private var historyRepo: (any SearchHistoryRepository)?

    // MARK: - Computed Properties

    var filteredItems: [HotItem] {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return [] }
        let lowered = trimmed.lowercased()
        return allItems.filter {
            $0.title.lowercased().contains(lowered) ||
            ($0.extra?.lowercased().contains(lowered) ?? false)
        }
    }

    // MARK: - Inject

    func inject(items: [HotItem], historyRepo: any SearchHistoryRepository) {
        self.allItems = items
        self.historyRepo = historyRepo
        self.recentSearches = historyRepo.getAll()
    }

    // MARK: - Actions

    func submitSearch() {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        historyRepo?.add(trimmed)
        recentSearches = historyRepo?.getAll() ?? []
    }

    func removeRecentSearch(_ query: String) {
        historyRepo?.remove(query)
        recentSearches = historyRepo?.getAll() ?? []
    }

    func clearAllRecent() {
        historyRepo?.clear()
        recentSearches = []
    }
}
