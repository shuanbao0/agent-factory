import SwiftUI

// MARK: - PlatformBadge

/// 平台标签徽章
struct PlatformBadge: View {

    // MARK: - Properties

    let platform: Platform

    // MARK: - Body

    var body: some View {
        Text(platform.name)
            .font(.caption2)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(.orange.opacity(0.15), in: Capsule())
            .foregroundStyle(.orange)
    }
}
