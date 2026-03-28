import Foundation
@testable import HotTopics
import Testing

// MARK: - UserDefaultsSearchHistoryRepositoryTests

@Suite("UserDefaultsSearchHistoryRepository Tests")
struct UserDefaultsSearchHistoryRepositoryTests {

    private func makeSUT() -> UserDefaultsSearchHistoryRepository {
        let suiteName = "test.search.history.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        return UserDefaultsSearchHistoryRepository(defaults: defaults)
    }

    @Test("初始状态为空")
    func getAll_initiallyEmpty() {
        let sut = makeSUT()
        #expect(sut.getAll().isEmpty)
    }

    @Test("添加后可获取")
    func add_thenGetAll_returnsItem() {
        let sut = makeSUT()
        sut.add("swift")
        #expect(sut.getAll() == ["swift"])
    }

    @Test("最近添加排在前面")
    func add_multiple_mostRecentFirst() {
        let sut = makeSUT()
        sut.add("aaa")
        sut.add("bbb")
        #expect(sut.getAll() == ["bbb", "aaa"])
    }

    @Test("重复添加去重并置顶")
    func add_duplicate_movesToFront() {
        let sut = makeSUT()
        sut.add("aaa")
        sut.add("bbb")
        sut.add("aaa")
        let result = sut.getAll()
        #expect(result == ["aaa", "bbb"])
    }

    @Test("上限 10 条")
    func add_moreThanMax_capsAt10() {
        let sut = makeSUT()
        for idx in 1...15 {
            sut.add("query\(idx)")
        }
        #expect(sut.getAll().count == 10)
        #expect(sut.getAll().first == "query15")
    }

    @Test("删除指定记录")
    func remove_deletesItem() {
        let sut = makeSUT()
        sut.add("swift")
        sut.add("ios")
        sut.remove("swift")
        #expect(sut.getAll() == ["ios"])
    }

    @Test("删除不存在的记录不影响列表")
    func remove_nonExisting_noEffect() {
        let sut = makeSUT()
        sut.add("swift")
        sut.remove("android")
        #expect(sut.getAll() == ["swift"])
    }

    @Test("清空全部")
    func clear_removesAll() {
        let sut = makeSUT()
        sut.add("swift")
        sut.add("ios")
        sut.clear()
        #expect(sut.getAll().isEmpty)
    }

    @Test("空白字符串不添加")
    func add_emptyString_ignored() {
        let sut = makeSUT()
        sut.add("   ")
        #expect(sut.getAll().isEmpty)
    }
}
