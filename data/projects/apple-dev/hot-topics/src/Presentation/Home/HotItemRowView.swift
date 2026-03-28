import SwiftUI

// MARK: - HotItemRowView

/// 单条热榜条目视图（点击可跳转原文）
struct HotItemRowView: View {

    // MARK: - Properties

    let item: HotItem
    @State private var showSafariURL: URL?

    // MARK: - Body

    var body: some View {
        Button {
            showSafariURL = item.url
        } label: {
            HStack(spacing: 12) {
                rankBadge
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.title)
                        .font(.subheadline)
                        .lineLimit(2)
                        .foregroundStyle(.primary)
                    HeatValueLabel(text: item.formattedHotValue)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            .padding(.vertical, 2)
        }
        .buttonStyle(.plain)
        .sheet(item: $showSafariURL) { url in
            SafariView(url: url)
                .ignoresSafeArea()
        }
    }

    // MARK: - Subviews

    private var rankBadge: some View {
        Text("\(item.rank)")
            .font(.caption.bold())
            .foregroundStyle(rankColor)
            .frame(width: 24, height: 24)
    }

    private var rankColor: Color {
        switch item.rank {
        case 1: return .red
        case 2: return .orange
        case 3: return .yellow
        default: return .secondary
        }
    }
}
