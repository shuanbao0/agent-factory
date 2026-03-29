import SwiftUI

// MARK: - ToastMessage

/// Toast 消息模型
struct ToastMessage: Equatable {
    let text: String
    let icon: String
    let style: ToastStyle

    // MARK: - Style

    enum ToastStyle: Equatable {
        case error
        case success
        case info
    }
}

// MARK: - ToastModifier

private struct ToastModifier: ViewModifier {
    @Binding var toast: ToastMessage?

    func body(content: Content) -> some View {
        ZStack(alignment: .bottom) {
            content
            if let toast {
                ToastView(message: toast)
                    .padding(.bottom, 16)
                    .transition(
                        .move(edge: .bottom).combined(with: .opacity)
                    )
                    .onAppear { scheduleHide() }
            }
        }
        .animation(.spring(response: 0.3), value: toast)
    }

    private func scheduleHide() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
            withAnimation(.spring(response: 0.3)) {
                toast = nil
            }
        }
    }
}

// MARK: - ToastView

/// Toast 弹出提示视图
struct ToastView: View {

    // MARK: - Properties

    let message: ToastMessage

    // MARK: - Body

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: message.icon)
                .foregroundStyle(iconColor)
            Text(message.text)
                .font(.subheadline)
                .foregroundStyle(.primary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.regularMaterial, in: Capsule())
        .shadow(color: .black.opacity(0.12), radius: 8, y: 4)
    }

    // MARK: - Private

    private var iconColor: Color {
        switch message.style {
        case .error: return .red
        case .success: return .green
        case .info: return .blue
        }
    }
}

// MARK: - View + Toast

extension View {
    func toast(message: Binding<ToastMessage?>) -> some View {
        modifier(ToastModifier(toast: message))
    }
}
