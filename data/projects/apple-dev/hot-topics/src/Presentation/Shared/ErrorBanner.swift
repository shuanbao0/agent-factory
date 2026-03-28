import SwiftUI

// MARK: - ErrorBanner

/// 内联错误提示 Banner，显示在列表顶部
struct ErrorBanner: View {

    // MARK: - Properties

    let message: String
    var retryAction: (() -> Void)?

    // MARK: - Body

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.yellow)
            Text(message)
                .font(.caption)
                .foregroundStyle(.primary)
                .lineLimit(2)
            Spacer()
            if let retryAction {
                Button("重试", action: retryAction)
                    .font(.caption.bold())
                    .buttonStyle(.borderedProminent)
                    .controlSize(.mini)
                    .tint(.orange)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.red.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
        .padding(.horizontal)
    }
}

// MARK: - Preview

#if DEBUG
#Preview {
    ErrorBanner(message: "网络连接失败，请检查网络后重试") {
        print("retry tapped")
    }
}
#endif
