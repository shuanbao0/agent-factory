import Foundation

// MARK: - HotListViewModel

/// 热榜首页 ViewModel
@Observable @MainActor
final class HotListViewModel {

    // MARK: - State

    var isLoading = false
    var showError = false
    var errorMessage = ""
    private var hotItems: [String: [HotItem]] = [:]

    // MARK: - Computed Properties

    var hasData: Bool { !hotItems.isEmpty }

    // MARK: - Dependencies

    private var fetchUseCase: FetchHotListUseCase?

    // MARK: - Inject

    func inject(fetchUseCase: FetchHotListUseCase) {
        self.fetchUseCase = fetchUseCase
    }

    // MARK: - Actions

    func onAppear() async {
        guard !hasData else { return }
        await loadAllPlatforms()
    }

    func refresh() async {
        await loadAllPlatforms()
    }

    func items(for platformId: String) -> [HotItem] {
        hotItems[platformId] ?? []
    }

    // MARK: - Private

    private func loadAllPlatforms() async {
        guard let fetchUseCase else { return }
        isLoading = true
        defer { isLoading = false }

        for platform in Platform.available {
            do {
                let items = try await fetchUseCase.execute(platform: platform)
                hotItems[platform.id] = items
            } catch let error as HotTopicsError where !error.shouldShowToUser {
                continue
            } catch {
                errorMessage = error.localizedDescription
                showError = true
            }
        }
    }
}
