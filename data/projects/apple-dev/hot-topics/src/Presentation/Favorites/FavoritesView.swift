import SwiftUI

// MARK: - FavoritesView

/// 收藏列表视图（支持按平台筛选）
struct FavoritesView: View {

    // MARK: - Dependencies

    @Environment(AppDependencies.self) private var deps
    @State private var viewModel = FavoritesViewModel()
    @State private var showSafariURL: URL?
    @State private var selectedPlatformId: String?

    // MARK: - Computed

    private var filteredFavorites: [FavoriteItem] {
        guard let pid = selectedPlatformId else {
            return viewModel.favorites
        }
        return viewModel.favorites.filter { $0.platformId == pid }
    }

    private var platformIds: [String] {
        Array(
            Set(viewModel.favorites.map(\.platformId))
        ).sorted()
    }

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
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    platformFilterMenu
                }
            }
            .task {
                viewModel.inject(
                    useCase: deps.manageFavoritesUseCase
                )
                await viewModel.load()
            }
        }
        .sheet(item: $showSafariURL) { url in
            SafariView(url: url)
                .ignoresSafeArea()
        }
    }

    // MARK: - Subviews

    private var platformFilterMenu: some View {
        Menu {
            Button("全部") { selectedPlatformId = nil }
            ForEach(platformIds, id: \.self) { pid in
                let name = platformName(for: pid)
                Button(name) { selectedPlatformId = pid }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "line.3.horizontal.decrease")
                if let pid = selectedPlatformId {
                    Text(platformName(for: pid))
                        .font(.caption)
                }
            }
        }
    }

    private var favoritesList: some View {
        List {
            ForEach(filteredFavorites) { item in
                Button {
                    showSafariURL = item.url
                } label: {
                    favoriteRow(item)
                }
                .buttonStyle(.plain)
            }
            .onDelete { indexSet in
                Task {
                    for index in indexSet {
                        let id = filteredFavorites[index].id
                        await viewModel.remove(id: id)
                    }
                }
            }
        }
        .listStyle(.plain)
    }

    private func favoriteRow(_ item: FavoriteItem) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(item.title)
                .font(.subheadline)
                .lineLimit(2)
                .foregroundStyle(.primary)
            HStack {
                platformBadge(for: item)
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

    // MARK: - Helpers

    private func platformBadge(
        for item: FavoriteItem
    ) -> some View {
        let platform = Platform.all.first {
            $0.id == item.platformId
        }
        return Group {
            if let platform {
                PlatformBadge(platform: platform)
            } else {
                Text(item.platformName)
                    .font(.caption2)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(
                        Color.secondary.opacity(0.15),
                        in: Capsule()
                    )
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func platformName(for id: String) -> String {
        Platform.all.first { $0.id == id }?.name ?? id
    }
}

// MARK: - URL Identifiable

extension URL: @retroactive Identifiable {
    public var id: String { absoluteString }
}
