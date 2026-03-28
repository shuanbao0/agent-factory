import SwiftUI
import SwiftData

// MARK: - AppDependencies

/// DI 容器：集中管理所有依赖注入
@Observable @MainActor
final class AppDependencies {

    // MARK: - Repositories

    let hotListRepository: HotListRepository
    let favoritesRepository: FavoritesRepository
    let searchHistoryRepository: any SearchHistoryRepository

    // MARK: - UseCases

    let fetchHotListUseCase: FetchHotListUseCase
    let getCachedHotListUseCase: GetCachedHotListUseCase
    let manageFavoritesUseCase: ManageFavoritesUseCase

    // MARK: - Init

    init(modelContext: ModelContext) {
        let hotListRepo = SwiftDataHotListRepository(modelContext: modelContext)
        let favoritesRepo = SwiftDataFavoritesRepository(modelContext: modelContext)

        self.hotListRepository = hotListRepo
        self.favoritesRepository = favoritesRepo
        self.searchHistoryRepository = UserDefaultsSearchHistoryRepository()

        self.fetchHotListUseCase = FetchHotListUseCase(repository: hotListRepo)
        self.getCachedHotListUseCase = GetCachedHotListUseCase(repository: hotListRepo)
        self.manageFavoritesUseCase = ManageFavoritesUseCase(repository: favoritesRepo)
    }
}
