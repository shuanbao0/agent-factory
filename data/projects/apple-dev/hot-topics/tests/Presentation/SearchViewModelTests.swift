import Foundation
@testable import HotTopics
import Testing

// MARK: - MockSearchHistoryRepository

final class MockSearchHistoryRepository: SearchHistoryRepository, @unchecked Sendable {
    private var history: [String] = []

    func getAll() -> [String] { history }

    func add(_ query: String) {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        history.removeAll { $0 == trimmed }
        history.insert(trimmed, at: 0)
        if history.count > 10 {
            history = Array(history.prefix(10))
        }
    }

    func remove(_ query: String) {
        history.removeAll { $0 == query }
    }

    func clear() {
        history = []
    }
}

// MARK: - SearchViewModelTests

@Suite("SearchViewModel Tests")
@MainActor
struct SearchViewModelTests {

    private func makeSUT() -> (SearchViewModel, MockSearchHistoryRepository) {
        let vm = SearchViewModel()
        let repo = MockSearchHistoryRepository()
        let items = HotItem.stubs(count: 10, platformId: "zhihu")
        vm.inject(items: items, historyRepo: repo)
        return (vm, repo)
    }

    @Test("空查询返回空结果")
    func filteredItems_emptyQuery_returnsEmpty() {
        let (vm, _) = makeSUT()
        vm.query = ""
        #expect(vm.filteredItems.isEmpty)
    }

    @Test("空白查询返回空结果")
    func filteredItems_whitespaceQuery_returnsEmpty() {
        let (vm, _) = makeSUT()
        vm.query = "   "
        #expect(vm.filteredItems.isEmpty)
    }

    @Test("匹配标题关键词")
    func filteredItems_matchingTitle_returnsResults() {
        let (vm, _) = makeSUT()
        vm.query = "热榜条目 1"
        #expect(!vm.filteredItems.isEmpty)
    }

    @Test("不匹配关键词返回空")
    func filteredItems_nonMatching_returnsEmpty() {
        let (vm, _) = makeSUT()
        vm.query = "zzz_no_match_zzz"
        #expect(vm.filteredItems.isEmpty)
    }

    @Test("提交搜索添加到历史")
    func submitSearch_addsToRecent() {
        let (vm, _) = makeSUT()
        vm.query = "测试搜索"
        vm.submitSearch()
        #expect(vm.recentSearches.contains("测试搜索"))
    }

    @Test("提交空白搜索不添加历史")
    func submitSearch_emptyQuery_doesNotAdd() {
        let (vm, _) = makeSUT()
        vm.query = "  "
        vm.submitSearch()
        #expect(vm.recentSearches.isEmpty)
    }

    @Test("删除历史记录")
    func removeRecentSearch_removesFromList() {
        let (vm, _) = makeSUT()
        vm.query = "搜索1"
        vm.submitSearch()
        vm.removeRecentSearch("搜索1")
        #expect(!vm.recentSearches.contains("搜索1"))
    }

    @Test("清空全部历史")
    func clearAllRecent_emptiesList() {
        let (vm, _) = makeSUT()
        vm.query = "搜索1"
        vm.submitSearch()
        vm.query = "搜索2"
        vm.submitSearch()
        vm.clearAllRecent()
        #expect(vm.recentSearches.isEmpty)
    }
}
