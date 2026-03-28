import Foundation
@testable import HotTopics
import Testing

// MARK: - WidgetCacheItemTests

/// 测试 Widget 共享缓存写入相关的轻量模型行为
@Suite("Widget Cache Tests")
struct WidgetCacheItemTests {

    @Test("HotItem stub 创建 id 格式正确")
    func hotItem_stub_idFormat() {
        let item = HotItem.stub(rank: 1, platformId: "zhihu")
        #expect(item.id == "zhihu_1")
    }

    @Test("HotItem stub 属性正确")
    func hotItem_stub_properties() {
        let item = HotItem.stub(rank: 3, title: "标题", platformId: "weibo")
        #expect(item.rank == 3)
        #expect(item.title == "标题")
        #expect(item.platformId == "weibo")
    }

    @Test("HotItem stubs 生成正确数量")
    func hotItem_stubs_correctCount() {
        let items = HotItem.stubs(count: 5)
        #expect(items.count == 5)
    }

    @Test("HotItem stubs 排名从 1 开始递增")
    func hotItem_stubs_ranksAscending() {
        let items = HotItem.stubs(count: 3)
        #expect(items[0].rank == 1)
        #expect(items[1].rank == 2)
        #expect(items[2].rank == 3)
    }
}
