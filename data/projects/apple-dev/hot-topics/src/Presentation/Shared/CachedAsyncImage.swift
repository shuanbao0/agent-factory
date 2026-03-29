import SwiftUI
import UIKit

// MARK: - ImageCache

/// 内存图片缓存（NSCache，自动清理）
final class ImageCache: @unchecked Sendable {
    static let shared = ImageCache()
    private let cache = NSCache<NSString, UIImage>()

    private init() {
        cache.countLimit = 100
    }

    func image(for key: String) -> UIImage? {
        cache.object(forKey: key as NSString)
    }

    func store(_ image: UIImage, for key: String) {
        cache.setObject(image, forKey: key as NSString)
    }
}

// MARK: - CachedAsyncImage

/// 带内存缓存的异步图片加载组件
struct CachedAsyncImage: View {

    // MARK: - Properties

    let url: URL?
    var placeholder: Image = Image(systemName: "photo")

    @State private var loadedImage: UIImage?

    // MARK: - Body

    var body: some View {
        Group {
            if let loadedImage {
                Image(uiImage: loadedImage)
                    .resizable()
                    .scaledToFill()
            } else {
                placeholder
                    .foregroundStyle(.secondary)
            }
        }
        .task(id: url) { await load() }
    }

    // MARK: - Private

    private func load() async {
        guard let url else { return }
        let key = url.absoluteString
        if let cached = ImageCache.shared.image(for: key) {
            loadedImage = cached
            return
        }
        guard let (data, _) = try? await URLSession.shared.data(from: url),
              let uiImage = UIImage(data: data) else { return }
        ImageCache.shared.store(uiImage, for: key)
        loadedImage = uiImage
    }
}
