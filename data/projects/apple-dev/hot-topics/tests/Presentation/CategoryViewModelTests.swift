import Foundation
@testable import HotTopics
import Testing

// MARK: - CategoryViewModelTests

@Suite("CategoryViewModel Tests")
@MainActor
struct CategoryViewModelTests {

    @Test("初始分类数量与 HotCategory.allCases 一致")
    func initialCategories_matchesAllCases() {
        let vm = CategoryViewModel()
        #expect(vm.categories.count == HotCategory.allCases.count)
    }

    @Test("初始分类包含全部 7 个类别")
    func initialCategories_containsAll7() {
        let vm = CategoryViewModel()
        #expect(vm.categories.count == 7)
    }

    @Test("badgeCount 返回非负值")
    func badgeCount_nonNegative() {
        let vm = CategoryViewModel()
        for category in vm.categories {
            #expect(vm.badgeCount(for: category) >= 0)
        }
    }

    @Test("badgeCount 为平台数乘 3")
    func badgeCount_equalsPlatformCountTimes3() {
        let vm = CategoryViewModel()
        let generalCount = Platform.platforms(for: .general).count * 3
        #expect(vm.badgeCount(for: .general) == generalCount)
    }

    @Test("移动分类重排序")
    func move_reordersCategories() {
        let vm = CategoryViewModel()
        let first = vm.categories[0]
        vm.move(from: IndexSet(integer: 0), to: 3)
        #expect(vm.categories[0] != first)
    }

    @Test("移动后分类总数不变")
    func move_preservesCount() {
        let vm = CategoryViewModel()
        let originalCount = vm.categories.count
        vm.move(from: IndexSet(integer: 0), to: 2)
        #expect(vm.categories.count == originalCount)
    }
}
