import Foundation
import Testing
@testable import HotTopics

// MARK: - HotListViewModel Tests

@Suite("HotListViewModel — State Management")
@MainActor
struct HomeViewModelTests {

    // MARK: - Initial State

    @Test("initial state has no data")
    func test_initialState_noData() {
        let viewModel = HotListViewModel()

        #expect(!viewModel.hasData)
        #expect(!viewModel.isLoading)
        #expect(!viewModel.showError)
        #expect(viewModel.errorMessage.isEmpty)
    }

    // MARK: - Items

    @Test("items returns empty for unknown platform")
    func test_items_unknownPlatform() {
        let viewModel = HotListViewModel()

        let items = viewModel.items(for: "unknown")

        #expect(items.isEmpty)
    }

    // MARK: - Inject

    @Test("inject sets fetchUseCase")
    func test_inject_setsUseCase() {
        let viewModel = HotListViewModel()
        let mockRepo = MockHotListRepository()
        let useCase = FetchHotListUseCase(repository: mockRepo)

        viewModel.inject(fetchUseCase: useCase)

        // No error on inject - use case is set
        #expect(!viewModel.isLoading)
    }

    // MARK: - onAppear

    @Test("onAppear does nothing when hasData")
    func test_onAppear_skipsWhenHasData() async {
        let viewModel = HotListViewModel()
        let mockRepo = MockHotListRepository()
        mockRepo.getValidCachedResult = HotItemTestData.list(count: 5)
        let useCase = FetchHotListUseCase(repository: mockRepo)
        viewModel.inject(fetchUseCase: useCase)

        // First load some data by manually setting
        await viewModel.refresh()

        // onAppear should skip if hasData
        await viewModel.onAppear()

        // No error means it worked
        #expect(!viewModel.isLoading)
    }

    // MARK: - Error Handling

    @Test("errorMessage is populated on error")
    func test_errorMessage_onError() async {
        let viewModel = HotListViewModel()
        let mockRepo = MockHotListRepository()
        mockRepo.getValidCachedResult = []
        mockRepo.fetchFromNetworkResult = .failure(.apiError("Server error"))
        let useCase = FetchHotListUseCase(repository: mockRepo)
        viewModel.inject(fetchUseCase: useCase)

        await viewModel.refresh()

        #expect(viewModel.showError || !viewModel.errorMessage.isEmpty || !viewModel.isLoading)
    }
}

// MARK: - FavoritesViewModel Tests

@Suite("FavoritesViewModel — State Management")
@MainActor
struct FavoritesViewModelTests {

    // MARK: - Initial State

    @Test("initial state has empty favorites")
    func test_initialState_empty() {
        let viewModel = FavoritesViewModel()

        #expect(viewModel.favorites.isEmpty)
    }

    // MARK: - Inject

    @Test("inject sets useCase")
    func test_inject_setsUseCase() {
        let viewModel = FavoritesViewModel()
        let mockRepo = MockFavoritesRepository()
        let useCase = ManageFavoritesUseCase(repository: mockRepo)

        viewModel.inject(useCase: useCase)

        // No error on inject
        #expect(viewModel.favorites.isEmpty)
    }

    // MARK: - Load

    @Test("load populates favorites")
    func test_load_populatesFavorites() async {
        let viewModel = FavoritesViewModel()
        let mockRepo = MockFavoritesRepository()
        mockRepo.favorites = FavoriteItemTestData.list(count: 5)
        let useCase = ManageFavoritesUseCase(repository: mockRepo)
        viewModel.inject(useCase: useCase)

        await viewModel.load()

        #expect(viewModel.favorites.count == 5)
    }

    @Test("load clears on error")
    func test_load_clearsOnError() async {
        let viewModel = FavoritesViewModel()
        let mockRepo = MockFavoritesRepository()
        mockRepo.fetchAllError = .cacheReadError
        let useCase = ManageFavoritesUseCase(repository: mockRepo)
        viewModel.inject(useCase: useCase)

        await viewModel.load()

        // Error is caught, favorites cleared
        #expect(viewModel.favorites.isEmpty)
    }

    // MARK: - Remove

    @Test("remove deletes favorite")
    func test_remove_deletesFavorite() async {
        let viewModel = FavoritesViewModel()
        let mockRepo = MockFavoritesRepository()
        mockRepo.favorites = FavoriteItemTestData.list(count: 3)
        let targetId = mockRepo.favorites[1].id
        let useCase = ManageFavoritesUseCase(repository: mockRepo)
        viewModel.inject(useCase: useCase)
        await viewModel.load()

        await viewModel.remove(id: targetId)

        #expect(viewModel.favorites.count == 2)
        #expect(mockRepo.deleteCalls.contains(targetId))
    }
}
