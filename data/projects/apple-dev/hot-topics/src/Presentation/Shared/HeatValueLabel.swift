import SwiftUI

// MARK: - HeatValueLabel

/// 热度数值标签
struct HeatValueLabel: View {

    // MARK: - Properties

    let text: String

    // MARK: - Body

    var body: some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(.secondary)
    }
}
