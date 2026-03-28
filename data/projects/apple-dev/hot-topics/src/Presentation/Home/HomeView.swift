import SwiftUI

// MARK: - HomeView

/// 主界面 TabView 入口（5 个 Tab）
struct HomeView: View {

    // MARK: - State

    @State private var selectedTab = 0

    // MARK: - Body

    var body: some View {
        TabView(selection: $selectedTab) {
            HotListView()
                .tabItem {
                    Label("热榜", systemImage: "flame.fill")
                }
                .tag(0)

            CategoryView()
                .tabItem {
                    Label("分类", systemImage: "square.grid.2x2.fill")
                }
                .tag(1)

            SearchView()
                .tabItem {
                    Label("搜索", systemImage: "magnifyingglass")
                }
                .tag(2)

            FavoritesView()
                .tabItem {
                    Label("收藏", systemImage: "star.fill")
                }
                .tag(3)

            SettingsView()
                .tabItem {
                    Label("设置", systemImage: "gearshape.fill")
                }
                .tag(4)
        }
        .tint(.orange)
    }
}
