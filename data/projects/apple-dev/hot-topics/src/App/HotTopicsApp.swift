import SwiftUI
import SwiftData

// MARK: - HotTopicsApp

@main
struct HotTopicsApp: App {

    // MARK: - State

    private let modelContainer: ModelContainer
    @State private var dependencies: AppDependencies

    // MARK: - Init

    init() {
        let schema = Schema([
            HotItemEntity.self,
            FavoriteItemEntity.self,
            PlatformEntity.self,
        ])
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)
        // swiftlint:disable:next force_try
        let container = try! ModelContainer(for: schema, configurations: [config])
        self.modelContainer = container
        let context = ModelContext(container)
        self._dependencies = State(initialValue: AppDependencies(modelContext: context))
    }

    // MARK: - Body

    var body: some Scene {
        WindowGroup {
            HomeView()
                .environment(dependencies)
                .modelContainer(modelContainer)
                .task {
                    try? await dependencies.hotListRepository.seedPlatformsIfNeeded()
                    try? await dependencies.hotListRepository.purgeExpired()
                }
        }
    }
}
