import WidgetKit
import SwiftUI

// MARK: - WidgetHotItem

/// Widget 专用轻量热榜条目
struct WidgetHotItem: Identifiable, Sendable, Codable {
    let id: String
    let title: String
    let platformName: String
    let rank: Int
}

// MARK: - Entry

struct HotTopicsEntry: TimelineEntry {
    let date: Date
    let items: [WidgetHotItem]
    let platformName: String
}

// MARK: - Provider

struct HotTopicsTimelineProvider: TimelineProvider {

    func placeholder(in context: Context) -> HotTopicsEntry {
        HotTopicsEntry(date: .now, items: Self.placeholderItems, platformName: "热榜")
    }

    func getSnapshot(in context: Context, completion: @escaping (HotTopicsEntry) -> Void) {
        let entry = loadEntry()
        completion(entry)
    }

    func getTimeline(
        in context: Context,
        completion: @escaping (Timeline<HotTopicsEntry>) -> Void
    ) {
        let entry = loadEntry()
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: .now) ?? .now
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }

    // MARK: - Private

    private func loadEntry() -> HotTopicsEntry {
        guard let url = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.com.hotapp.hottopics"
        )?.appending(path: "widget_cache.json"),
              let data = try? Data(contentsOf: url),
              let items = try? JSONDecoder().decode([WidgetHotItem].self, from: data),
              !items.isEmpty
        else {
            return HotTopicsEntry(date: .now, items: Self.placeholderItems, platformName: "热榜")
        }
        let platform = items.first?.platformName ?? "热榜"
        return HotTopicsEntry(date: .now, items: items, platformName: platform)
    }

    private static let placeholderItems: [WidgetHotItem] = [
        WidgetHotItem(id: "1", title: "加载中...", platformName: "热榜", rank: 1),
    ]
}

// MARK: - Single News Widget View (Small/Medium)

struct SingleNewsWidgetView: View {
    let entry: HotTopicsEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Image(systemName: "flame.fill")
                    .foregroundStyle(.orange)
                Text(entry.platformName)
                    .font(.caption.bold())
            }
            if let top = entry.items.first {
                Text(top.title)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(3)
            }
            Spacer()
            Text(entry.date, style: .time)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding()
    }
}

// MARK: - Multi News Widget View (Medium/Large)

struct MultiNewsWidgetView: View {
    let entry: HotTopicsEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Image(systemName: "flame.fill")
                    .foregroundStyle(.orange)
                Text("热榜")
                    .font(.caption.bold())
                Spacer()
                Text(entry.date, style: .time)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding(.bottom, 2)
            ForEach(Array(entry.items.prefix(5).enumerated()), id: \.element.id) { index, item in
                HStack(spacing: 6) {
                    Text("\(index + 1)")
                        .font(.caption2.bold())
                        .foregroundStyle(index < 3 ? .orange : .secondary)
                        .frame(width: 16)
                    Text(item.title)
                        .font(.caption)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding()
    }
}

// MARK: - Widgets

struct SingleHotTopicWidget: Widget {
    let kind = "SingleHotTopicWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: HotTopicsTimelineProvider()) { entry in
            SingleNewsWidgetView(entry: entry)
        }
        .configurationDisplayName("热榜速览")
        .description("显示最热门话题")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct MultiHotTopicsWidget: Widget {
    let kind = "MultiHotTopicsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: HotTopicsTimelineProvider()) { entry in
            MultiNewsWidgetView(entry: entry)
        }
        .configurationDisplayName("热榜 Top 5")
        .description("显示多条热门话题")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

// MARK: - Widget Bundle

@main
struct HotTopicsWidgetBundle: WidgetBundle {
    var body: some Widget {
        SingleHotTopicWidget()
        MultiHotTopicsWidget()
    }
}
