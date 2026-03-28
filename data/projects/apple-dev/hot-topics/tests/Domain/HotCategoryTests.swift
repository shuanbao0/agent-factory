import Testing
@testable import HotTopics

// MARK: - HotCategoryTests

@Suite("HotCategory Tests")
struct HotCategoryTests {

    @Test("共有 7 个分类")
    func allCasesCount() {
        #expect(HotCategory.allCases.count == 7)
    }

    @Test("每个分类有对应 SF Symbol")
    func sfSymbols() {
        for category in HotCategory.allCases {
            #expect(!category.sfSymbol.isEmpty)
        }
    }

    @Test("rawValue 为中文名称")
    func rawValues() {
        #expect(HotCategory.general.rawValue == "综合")
        #expect(HotCategory.tech.rawValue == "科技")
        #expect(HotCategory.ai.rawValue == "AI")
    }

    @Test("id 等于 rawValue")
    func idEqualsRawValue() {
        for category in HotCategory.allCases {
            #expect(category.id == category.rawValue)
        }
    }

    @Test("从 rawValue 初始化成功")
    func initFromRawValue() {
        let category = HotCategory(rawValue: "开发")
        #expect(category == .dev)
    }

    @Test("无效 rawValue 返回 nil")
    func initInvalidRawValue() {
        let category = HotCategory(rawValue: "无效")
        #expect(category == nil)
    }
}
