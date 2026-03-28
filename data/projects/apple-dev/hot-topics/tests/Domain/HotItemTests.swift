import Foundation
import Testing
@testable import HotTopics

// MARK: - HotItem Tests

@Suite("HotItem — Value Type & Computed Properties")
struct HotItemTests {

    // MARK: - Initialization

    @Test("HotItem init with required fields")
    func test_init_requiredFields() {
        let item = HotItem(
            id: "zhihu_1",
            title: "测试标题",
            url: URL(string: "https://www.zhihu.com/question/1")!,
            description: "摘要",
            thumbnailURL: nil,
            hotValue: 1_000_000,
            extra: "100万热度",
            rank: 1,
            platformId: "zhihu",
            cachedAt: Date(),
            expiresAt: Date().addingTimeInterval(900)
        )

        #expect(item.id == "zhihu_1")
        #expect(item.title == "测试标题")
        #expect(item.hotValue == 1_000_000)
        #expect(item.rank == 1)
    }

    @Test("HotItem id is unique per platform and rank")
    func test_id_uniqueness() {
        let item1 = HotItem(
            id: "zhihu_1",
            title: "标题1",
            url: URL(string: "https://zhihu.com/1")!,
            description: nil,
            thumbnailURL: nil,
            hotValue: 100,
            extra: nil,
            rank: 1,
            platformId: "zhihu",
            cachedAt: Date(),
            expiresAt: Date().addingTimeInterval(900)
        )

        let item2 = HotItem(
            id: "weibo_1",
            title: "标题1",
            url: URL(string: "https://weibo.com/1")!,
            description: nil,
            thumbnailURL: nil,
            hotValue: 100,
            extra: nil,
            rank: 1,
            platformId: "weibo",
            cachedAt: Date(),
            expiresAt: Date().addingTimeInterval(900)
        )

        #expect(item1.id != item2.id)
    }

    // MARK: - isExpired

    @Test("isExpired returns false when expiresAt is in future")
    func test_isExpired_false() {
        let item = HotItem(
            id: "zhihu_1",
            title: "标题",
            url: URL(string: "https://zhihu.com/1")!,
            description: nil,
            thumbnailURL: nil,
            hotValue: 100,
            extra: nil,
            rank: 1,
            platformId: "zhihu",
            cachedAt: Date(),
            expiresAt: Date().addingTimeInterval(900) // 15 min later
        )

        #expect(!item.isExpired)
    }

    @Test("isExpired returns true when expiresAt is in past")
    func test_isExpired_true() {
        let item = HotItem(
            id: "zhihu_1",
            title: "标题",
            url: URL(string: "https://zhihu.com/1")!,
            description: nil,
            thumbnailURL: nil,
            hotValue: 100,
            extra: nil,
            rank: 1,
            platformId: "zhihu",
            cachedAt: Date().addingTimeInterval(-3600),
            expiresAt: Date().addingTimeInterval(-3000)
        )

        #expect(item.isExpired)
    }

    // MARK: - formattedHotValue

    @Test("formattedHotValue returns extra when available")
    func test_formattedHotValue_withExtra() {
        let item = HotItem(
            id: "zhihu_1",
            title: "标题",
            url: URL(string: "https://zhihu.com/1")!,
            description: nil,
            thumbnailURL: nil,
            hotValue: 455_0000,
            extra: "455 万热度",
            rank: 1,
            platformId: "zhihu",
            cachedAt: Date(),
            expiresAt: Date().addingTimeInterval(900)
        )

        #expect(item.formattedHotValue == "455 万热度")
    }

    @Test("formattedHotValue formats thousands")
    func test_formattedHotValue_thousands() {
        let item = HotItem(
            id: "zhihu_1",
            title: "标题",
            url: URL(string: "https://zhihu.com/1")!,
            description: nil,
            thumbnailURL: nil,
            hotValue: 5000,
            extra: nil,
            rank: 1,
            platformId: "zhihu",
            cachedAt: Date(),
            expiresAt: Date().addingTimeInterval(900)
        )

        #expect(item.formattedHotValue == "5000")
    }

    @Test("formattedHotValue formats wan for 10k-1e8")
    func test_formattedHotValue_wan() {
        let item = HotItem(
            id: "zhihu_1",
            title: "标题",
            url: URL(string: "https://zhihu.com/1")!,
            description: nil,
            thumbnailURL: nil,
            hotValue: 50_0000, // 50万
            extra: nil,
            rank: 1,
            platformId: "zhihu",
            cachedAt: Date(),
            expiresAt: Date().addingTimeInterval(900)
        )

        #expect(item.formattedHotValue == "50.0万")
    }

    @Test("formattedHotValue formats yi for >= 1e8")
    func test_formattedHotValue_yi() {
        let item = HotItem(
            id: "zhihu_1",
            title: "标题",
            url: URL(string: "https://zhihu.com/1")!,
            description: nil,
            thumbnailURL: nil,
            hotValue: 5_0000_0000, // 5亿
            extra: nil,
            rank: 1,
            platformId: "zhihu",
            cachedAt: Date(),
            expiresAt: Date().addingTimeInterval(900)
        )

        #expect(item.formattedHotValue == "5.0亿")
    }

    // MARK: - cacheAgeDescription

    @Test("cacheAgeDescription returns 刚刚更新 for < 1 min")
    func test_cacheAgeDescription_justNow() {
        let item = HotItem(
            id: "zhihu_1",
            title: "标题",
            url: URL(string: "https://zhihu.com/1")!,
            description: nil,
            thumbnailURL: nil,
            hotValue: 100,
            extra: nil,
            rank: 1,
            platformId: "zhihu",
            cachedAt: Date(),
            expiresAt: Date().addingTimeInterval(900)
        )

        #expect(item.cacheAgeDescription == "刚刚更新")
    }

    @Test("cacheAgeDescription returns minutes for < 60 min")
    func test_cacheAgeDescription_minutes() {
        let item = HotItem(
            id: "zhihu_1",
            title: "标题",
            url: URL(string: "https://zhihu.com/1")!,
            description: nil,
            thumbnailURL: nil,
            hotValue: 100,
            extra: nil,
            rank: 1,
            platformId: "zhihu",
            cachedAt: Date().addingTimeInterval(-300), // 5 min ago
            expiresAt: Date().addingTimeInterval(600)
        )

        #expect(item.cacheAgeDescription.contains("分钟"))
    }

    // MARK: - Equatable

    @Test("HotItem equatable same values")
    func test_equatable_same() {
        let date = Date()
        let expires = date.addingTimeInterval(900)

        let item1 = HotItem(
            id: "zhihu_1",
            title: "标题",
            url: URL(string: "https://zhihu.com/1")!,
            description: nil,
            thumbnailURL: nil,
            hotValue: 100,
            extra: nil,
            rank: 1,
            platformId: "zhihu",
            cachedAt: date,
            expiresAt: expires
        )

        let item2 = HotItem(
            id: "zhihu_1",
            title: "标题",
            url: URL(string: "https://zhihu.com/1")!,
            description: nil,
            thumbnailURL: nil,
            hotValue: 100,
            extra: nil,
            rank: 1,
            platformId: "zhihu",
            cachedAt: date,
            expiresAt: expires
        )

        #expect(item1 == item2)
    }

    @Test("HotItem equatable different values")
    func test_equatable_different() {
        let date = Date()
        let expires = date.addingTimeInterval(900)

        let item1 = HotItem(
            id: "zhihu_1",
            title: "标题1",
            url: URL(string: "https://zhihu.com/1")!,
            description: nil,
            thumbnailURL: nil,
            hotValue: 100,
            extra: nil,
            rank: 1,
            platformId: "zhihu",
            cachedAt: date,
            expiresAt: expires
        )

        let item2 = HotItem(
            id: "zhihu_1",
            title: "标题2",
            url: URL(string: "https://zhihu.com/1")!,
            description: nil,
            thumbnailURL: nil,
            hotValue: 100,
            extra: nil,
            rank: 1,
            platformId: "zhihu",
            cachedAt: date,
            expiresAt: expires
        )

        #expect(item1 != item2)
    }

    // MARK: - Hashable

    @Test("HotItem hashable for Set/Dict")
    func test_hashable() {
        let item = HotItem(
            id: "zhihu_1",
            title: "标题",
            url: URL(string: "https://zhihu.com/1")!,
            description: nil,
            thumbnailURL: nil,
            hotValue: 100,
            extra: nil,
            rank: 1,
            platformId: "zhihu",
            cachedAt: Date(),
            expiresAt: Date().addingTimeInterval(900)
        )

        var set = Set<HotItem>()
        set.insert(item)
        #expect(set.count == 1)
        #expect(set.contains(item))
    }
}
