import SwiftUI

// MARK: - PlatformDetailView

/// 平台热榜详情页（展示完整列表）
struct PlatformDetailView: View {

    // MARK: - Properties

    let platform: Platform

    @Environment(AppDependencies.self) private var deps
    @State private var viewModel = PlatformDetailViewModel()

    // MARK: - Body

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.items.isEmpty {
                ProgressView("加载中...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.items.isEmpty {
                EmptyStateView(
                    icon: platform.iconName,
                    title: "暂无数据",
                    message: "\(platform.name)热榜暂时无法获取"
                )
            } else {
                List(viewModel.items) { item in
                    HotItemRowView(item: item)
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("\(platform.name) \(platform.displayName)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if viewModel.isLoading {
                    ProgressView()
                }
            }
        }
        .refreshable {
            await viewModel.forceRefresh(platform: platform)
        }
        .task {
            viewModel.inject(fetchUseCase: deps.fetchHotListUseCase)
            await viewModel.load(platform: platform)
        }
    }
}
