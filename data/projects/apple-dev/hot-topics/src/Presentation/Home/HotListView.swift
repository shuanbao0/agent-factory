import SwiftUI

// MARK: - HotListView

/// 热榜列表页（首页 Tab）
struct HotListView: View {

    // MARK: - Dependencies

    @Environment(AppDependencies.self) private var deps
    @State private var viewModel = HotListViewModel()
    @State private var toastMessage: ToastMessage?

    // MARK: - Body

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && !viewModel.hasData {
                    ProgressView("加载中...")
                        .frame(
                            maxWidth: .infinity,
                            maxHeight: .infinity
                        )
                } else if viewModel.hasData {
                    platformList
                } else {
                    EmptyStateView(
                        icon: "flame",
                        title: "暂无热榜数据",
                        message: "请检查网络连接或 API Key 设置"
                    )
                }
            }
            .navigationTitle("热榜")
            .safeAreaInset(edge: .top) {
                if viewModel.showError {
                    ErrorBanner(message: viewModel.errorMessage) {
                        viewModel.refresh()
                    }
                    .padding(.top, 4)
                }
            }
            .refreshable {
                viewModel.refresh()
            }
            .task {
                viewModel.inject(
                    fetchUseCase: deps.fetchHotListUseCase
                )
                await viewModel.onAppear()
            }
            .onChange(of: viewModel.showError) { _, show in
                if show {
                    toastMessage = ToastMessage(
                        text: viewModel.errorMessage,
                        icon: "exclamationmark.triangle",
                        style: .error
                    )
                }
            }
        }
        .toast(message: $toastMessage)
    }

    // MARK: - Subviews

    private var platformList: some View {
        List {
            ForEach(Platform.available) { platform in
                Section {
                    let items = viewModel.items(for: platform.id)
                    if items.isEmpty {
                        Text("加载中...")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(items.prefix(5)) { item in
                            HotItemRowView(item: item)
                        }
                        NavigationLink {
                            PlatformDetailView(
                                platform: platform
                            )
                        } label: {
                            Text("查看全部")
                                .font(.footnote)
                                .foregroundStyle(.orange)
                        }
                    }
                } header: {
                    Label(
                        platform.name,
                        systemImage: platform.iconName
                    )
                    .font(.headline)
                }
            }
        }
        .listStyle(.insetGrouped)
    }
}
