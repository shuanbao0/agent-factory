import SwiftUI

// MARK: - CategoryViewModel

/// 分类页 ViewModel（分类排序 + 徽章）
@Observable @MainActor
final class CategoryViewModel {

    // MARK: - State

    var categories: [HotCategory] = HotCategory.allCases

    // MARK: - Computed

    func badgeCount(for category: HotCategory) -> Int {
        Platform.platforms(for: category).count * 3
    }

    // MARK: - Actions

    func move(from source: IndexSet, to destination: Int) {
        categories.move(fromOffsets: source, toOffset: destination)
    }
}

// MARK: - CategoryView

/// 分类浏览视图（可排序 + 平台数徽章）
struct CategoryView: View {

    // MARK: - State

    @State private var viewModel = CategoryViewModel()
    @State private var isEditing = false

    // MARK: - Body

    var body: some View {
        NavigationStack {
            List {
                ForEach(viewModel.categories, id: \.self) { category in
                    NavigationLink {
                        categoryDetail(category)
                    } label: {
                        categoryRow(category)
                    }
                }
                .onMove { viewModel.move(from: $0, to: $1) }
            }
            .environment(\.editMode, .constant(isEditing ? .active : .inactive))
            .navigationTitle("分类")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(isEditing ? "完成" : "编辑") {
                        isEditing.toggle()
                    }
                }
            }
        }
    }

    // MARK: - Subviews

    private func categoryRow(_ category: HotCategory) -> some View {
        let badge = viewModel.badgeCount(for: category)
        return HStack {
            Label(category.displayName, systemImage: category.sfSymbol)
            Spacer()
            if badge != 0 {
                Text("\(badge)")
                    .font(.caption2.bold())
                    .foregroundStyle(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(.orange, in: Capsule())
            }
        }
    }

    private func categoryDetail(_ category: HotCategory) -> some View {
        let platforms = Platform.platforms(for: category)
        return Group {
            if platforms.isEmpty {
                EmptyStateView(
                    title: category.displayName,
                    systemImage: category.sfSymbol,
                    message: "该分类热榜即将上线"
                )
            } else {
                List(platforms) { platform in
                    NavigationLink(platform.name) {
                        PlatformDetailView(platform: platform)
                    }
                }
            }
        }
        .navigationTitle(category.displayName)
    }
}
