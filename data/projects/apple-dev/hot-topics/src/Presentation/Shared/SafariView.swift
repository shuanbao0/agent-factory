import SafariServices
import SwiftUI

// MARK: - SafariView

/// SFSafariViewController 的 SwiftUI 包装
struct SafariView: UIViewControllerRepresentable {

    // MARK: - Properties

    let url: URL

    // MARK: - UIViewControllerRepresentable

    func makeUIViewController(context: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }

    func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) {}
}
