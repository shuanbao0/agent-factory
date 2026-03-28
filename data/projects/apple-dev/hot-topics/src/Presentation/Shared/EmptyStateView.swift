import SwiftUI

// MARK: - EmptyStateView

/// 空状态占位视图
struct EmptyStateView: View {

    // MARK: - Properties

    let title: String
    let systemImage: String
    var message: String?
    var onRefresh: (() -> Void)?

    // MARK: - Init (支持 icon: 和 systemImage: 两种调用方式)

    init(
        title: String,
        systemImage: String,
        message: String? = nil,
        onRefresh: (() -> Void)? = nil
    ) {
        self.title = title
        self.systemImage = systemImage
        self.message = message
        self.onRefresh = onRefresh
    }

    init(
        icon: String,
        title: String,
        message: String? = nil,
        onRefresh: (() -> Void)? = nil
    ) {
        self.title = title
        self.systemImage = icon
        self.message = message
        self.onRefresh = onRefresh
    }

    // MARK: - Body

    var body: some View {
        VStack(spacing: 16) {
            ContentUnavailableView(
                title,
                systemImage: systemImage,
                description: message.map { Text($0) }
            )
            if let onRefresh {
                Button("重新加载", action: onRefresh)
                    .buttonStyle(.borderedProminent)
                    .tint(.orange)
            }
        }
    }
}
