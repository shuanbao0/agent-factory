import Foundation

// MARK: - PlatformDetailViewModel

/// 平台详情页 ViewModel
@Observable @MainActor
final class PlatformDetailViewModel {

    // MARK: - State

    var items: [HotItem] = []
    var isLoading = false
    var errorMessage: String?

    // MARK: - Dependencies

    private var fetchUseCase: FetchHotListUseCase?

    // MARK: - Inject

    func inject(fetchUseCase: FetchHotListUseCase) {
        self.fetchUseCase = fetchUseCase
    }

    // MARK: - Actions

    func load(platform: Platform) async {
        guard items.isEmpty else { return }
        await fetchData(platform: platform, forceRefresh: false)
    }

    func forceRefresh(platform: Platform) async {
        await fetchData(platform: platform, forceRefresh: true)
    }

    // MARK: - Private

    private func fetchData(platform: Platform, forceRefresh: Bool) async {
        guard let fetchUseCase else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            if forceRefresh {
                items = try await fetchUseCase.forceRefresh(platform: platform)
            } else {
                items = try await fetchUseCase.execute(platform: platform)
            }
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
