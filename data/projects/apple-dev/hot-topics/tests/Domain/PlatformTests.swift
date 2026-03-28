import Testing
@testable import HotTopics

// MARK: - PlatformTests

@Suite("Platform Tests")
struct PlatformTests {

    @Test("Platform.all 包含 12 个平台")
    func allPlatformsCount() {
        #expect(Platform.all.count == 12)
    }

    @Test("available 只返回有 hashId 的平台")
    func availablePlatforms() {
        let available = Platform.available
        for platform in available {
            #expect(!platform.hashId.isEmpty)
        }
    }

    @Test("platforms(for:) 按分类过滤")
    func filterByCategory() {
        let general = Platform.platforms(for: .general)
        for platform in general {
            #expect(platform.category == .general)
        }
        #expect(!general.isEmpty)
    }

    @Test("每个平台 ID 唯一")
    func uniqueIds() {
        let ids = Platform.all.map(\.id)
        let uniqueIds = Set(ids)
        #expect(ids.count == uniqueIds.count)
    }

    @Test("知乎 hashId 已配置")
    func zhihuHashId() {
        let zhihu = Platform.all.first { $0.id == "zhihu" }
        #expect(zhihu?.hashId == "mproPpoq6O")
    }

    @Test("Platform 符合 Hashable")
    func hashable() {
        let p1 = PlatformTestData.zhihu
        let p2 = PlatformTestData.weibo
        let set: Set<Platform> = [p1, p2, p1]
        #expect(set.count == 2)
    }
}
