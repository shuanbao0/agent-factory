import Foundation

// MARK: - FavoritesViewModel

/// 收藏页 ViewModel
@Observable @MainActor
final class FavoritesViewModel {

    // MARK: - State

    var favorites: [FavoriteItem] = []

    // MARK: - Dependencies

    private var useCase: ManageFavoritesUseCase?

    // MARK: - Inject

    func inject(useCase: ManageFavoritesUseCase) {
        self.useCase = useCase
    }

    // MARK: - Actions

    func load() async {
        guard let useCase else { return }
        do {
            favorites = try await useCase.fetchAll()
        } catch {
            favorites = []
        }
    }

    func remove(id: String) async {
        guard let useCase else { return }
        try? await useCase.remove(id: id)
        await load()
    }
}
