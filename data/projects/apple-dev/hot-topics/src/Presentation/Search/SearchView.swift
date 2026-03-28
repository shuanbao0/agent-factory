import SwiftUI

// MARK: - SearchView

/// 搜索页：本地过滤热榜 + 搜索历史管理
struct SearchView: View {

    // MARK: - Dependencies

    @Environment(AppDependencies.self) private var deps
    @State private var viewModel = SearchViewModel()

    // MARK: - Body

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.query.trimmingCharacters(in: .whitespaces).isEmpty {
                    recentSearchesView
                } else if viewModel.filteredItems.isEmpty {
                    EmptyStateView(
                        title: "无结果",
                        systemImage: "magnifyingglass",
                        message: "尝试其他关键词"
                    )
                } else {
                    searchResultsList
                }
            }
            .navigationTitle("搜索")
            .searchable(text: $viewModel.query, prompt: "搜索热榜")
            .onSubmit(of: .search) {
                viewModel.submitSearch()
            }
            .task {
                await loadCachedItems()
            }
        }
    }

    // MARK: - Subviews

    private var recentSearchesView: some View {
        Group {
            if viewModel.recentSearches.isEmpty {
                EmptyStateView(
                    title: "搜索热榜",
                    systemImage: "magnifyingglass",
                    message: "输入关键词搜索全平台热榜"
                )
            } else {
                List {
                    Section("最近搜索") {
                        ForEach(viewModel.recentSearches, id: \.self) { query in
                            Button {
                                viewModel.query = query
                                viewModel.submitSearch()
                            } label: {
                                Label(query, systemImage: "clock")
                                    .foregroundStyle(.primary)
                            }
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    viewModel.removeRecentSearch(query)
                                } label: {
                                    Label("删除", systemImage: "trash")
                                }
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("清空") {
                            viewModel.clearAllRecent()
                        }
                    }
                }
            }
        }
    }

    private var searchResultsList: some View {
        List(viewModel.filteredItems) { item in
            HotItemRowView(item: item)
        }
        .listStyle(.plain)
    }

    // MARK: - Private

    private func loadCachedItems() async {
        let useCase = deps.getCachedHotListUseCase
        let historyRepo = deps.searchHistoryRepository
        var items: [HotItem] = []
        for platform in Platform.available {
            let result = try? await useCase.execute(platformId: platform.id)
            items.append(contentsOf: result?.items ?? [])
        }
        viewModel.inject(items: items, historyRepo: historyRepo)
    }
}
