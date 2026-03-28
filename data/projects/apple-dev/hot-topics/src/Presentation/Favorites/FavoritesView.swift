import SwiftUI

// MARK: - FavoritesView

/// 收藏列表视图
struct FavoritesView: View {

    // MARK: - Dependencies

    @Environment(AppDependencies.self) private var deps
    @State private var viewModel = FavoritesViewModel()
    @State private var showSafariURL: URL?

    // MARK: - Body

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.favorites.isEmpty {
                    EmptyStateView(
                        title: "暂无收藏",
                        systemImage: "star",
                        message: "浏览热榜时点击星标即可收藏"
                    )
                } else {
                    favoritesList
                }
            }
            .navigationTitle("收藏")
            .task {
                viewModel.inject(useCase: deps.manageFavoritesUseCase)
                await viewModel.load()
            }
        }
        .sheet(item: $showSafariURL) { url in
            SafariView(url: url)
                .ignoresSafeArea()
        }
    }

    // MARK: - Subviews

    private var favoritesList: some View {
        List {
            ForEach(viewModel.favorites) { item in
                Button {
                    showSafariURL = item.url
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.title)
                            .font(.subheadline)
                            .lineLimit(2)
                            .foregroundStyle(.primary)
                        HStack {
                            Text(item.platformName)
                                .font(.caption2)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(.orange.opacity(0.15), in: Capsule())
                                .foregroundStyle(.orange)
                            Spacer()
                            if !item.isRead {
                                Circle()
                                    .fill(.orange)
                                    .frame(width: 8, height: 8)
                            }
                        }
                    }
                    .padding(.vertical, 2)
                }
                .buttonStyle(.plain)
            }
            .onDelete { indexSet in
                Task {
                    for index in indexSet {
                        let id = viewModel.favorites[index].id
                        await viewModel.remove(id: id)
                    }
                }
            }
        }
        .listStyle(.plain)
    }
}

// MARK: - URL Identifiable

extension URL: @retroactive Identifiable {
    public var id: String { absoluteString }
}
