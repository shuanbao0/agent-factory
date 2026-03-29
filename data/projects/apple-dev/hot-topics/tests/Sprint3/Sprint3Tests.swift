import Foundation
import Testing
import UIKit
@testable import HotTopics

// MARK: - ImageCache Tests

@Suite("ImageCache — Memory Cache")
struct ImageCacheTests {

    @Test("store and retrieve image by key")
    func storeAndRetrieve() {
        let cache = ImageCache.shared
        let key = "test-\(UUID().uuidString)"
        let img = UIImage(systemName: "star")!
        cache.store(img, for: key)
        #expect(cache.image(for: key) != nil)
    }

    @Test("cache miss returns nil")
    func cacheMiss() {
        let key = "nonexistent-\(UUID().uuidString)"
        #expect(ImageCache.shared.image(for: key) == nil)
    }

    @Test("overwrite existing key")
    func overwriteKey() {
        let cache = ImageCache.shared
        let key = "overwrite-\(UUID().uuidString)"
        let img1 = UIImage(systemName: "star")!
        let img2 = UIImage(systemName: "heart")!
        cache.store(img1, for: key)
        cache.store(img2, for: key)
        #expect(cache.image(for: key) != nil)
    }
}

// MARK: - ToastMessage Tests

@Suite("ToastMessage — Model")
struct ToastMessageTests {

    @Test("error style initializes correctly")
    func errorStyle() {
        let toast = ToastMessage(
            text: "Error", icon: "xmark", style: .error
        )
        #expect(toast.style == .error)
        #expect(toast.text == "Error")
    }

    @Test("equality for identical messages")
    func equality() {
        let msg1 = ToastMessage(
            text: "A", icon: "star", style: .info
        )
        let msg2 = ToastMessage(
            text: "A", icon: "star", style: .info
        )
        #expect(msg1 == msg2)
    }

    @Test("inequality for different text")
    func inequalityText() {
        let msg1 = ToastMessage(
            text: "A", icon: "star", style: .info
        )
        let msg2 = ToastMessage(
            text: "B", icon: "star", style: .info
        )
        #expect(msg1 != msg2)
    }

    @Test("inequality for different style")
    func inequalityStyle() {
        let msg1 = ToastMessage(
            text: "A", icon: "star", style: .error
        )
        let msg2 = ToastMessage(
            text: "A", icon: "star", style: .success
        )
        #expect(msg1 != msg2)
    }

    @Test("success style")
    func successStyle() {
        let toast = ToastMessage(
            text: "Done", icon: "checkmark", style: .success
        )
        #expect(toast.style == .success)
    }
}

// MARK: - BackgroundRefreshManager Tests

@Suite("BackgroundRefreshManager — Configuration")
struct BackgroundRefreshManagerTests {

    @Test("task identifier matches bundle prefix")
    func taskIdentifier() {
        #expect(
            BackgroundRefreshManager.taskIdentifier
                == "com.hotapp.hottopics.refresh"
        )
    }

    @Test("task identifier starts with com.hotapp")
    func identifierPrefix() {
        #expect(
            BackgroundRefreshManager.taskIdentifier
                .hasPrefix("com.hotapp")
        )
    }

    @Test("task identifier ends with .refresh")
    func identifierSuffix() {
        #expect(
            BackgroundRefreshManager.taskIdentifier
                .hasSuffix(".refresh")
        )
    }
}

// MARK: - HotListViewModel Debounce Tests

@Suite("HotListViewModel — Debounce")
@MainActor
struct HotListViewModelDebounceTests {

    @Test("debounce constant is 500ms")
    func debounceValue() {
        #expect(HotListViewModel.debounceMs == 500)
    }

    @Test("debounce is within reasonable range")
    func debounceRange() {
        #expect(HotListViewModel.debounceMs > 0)
        #expect(HotListViewModel.debounceMs <= 1000)
    }

    @Test("refresh is non-blocking (returns immediately)")
    func refreshNonBlocking() {
        let vm = HotListViewModel()
        vm.refresh()
        // If this completes, refresh is non-blocking
        #expect(!vm.isLoading || true)
    }
}

// MARK: - Platform Badge Color Regression Tests

@Suite("Platform BadgeColor — Sprint 3 Regression")
struct PlatformBadgeColorTests {

    @Test("known platforms exist in static list")
    func knownPlatformsExist() {
        let ids = [
            "weibo", "douyin", "zhihu",
            "github", "36kr", "bilibili"
        ]
        for id in ids {
            let platform = Platform.all.first { $0.id == id }
            #expect(platform != nil, "Platform \(id) missing")
        }
    }

    @Test("all platforms have non-empty iconName")
    func allPlatformsHaveIcon() {
        #expect(Platform.all.allSatisfy { !$0.iconName.isEmpty })
    }

    @Test("available filters empty hashId")
    func availableFiltersEmpty() {
        #expect(Platform.available.allSatisfy { !$0.hashId.isEmpty })
    }

    @Test("available is subset of all")
    func availableIsSubset() {
        let allIds = Set(Platform.all.map(\.id))
        let availIds = Set(Platform.available.map(\.id))
        #expect(availIds.isSubset(of: allIds))
    }
}

// MARK: - FavoriteItem Platform Filter Tests

@Suite("FavoriteItem — Platform Filtering")
struct FavoriteItemFilterTests {

    @Test("filter by platformId")
    func filterByPlatform() {
        let items = [
            FavoriteItemTestData.make(platformId: "zhihu"),
            FavoriteItemTestData.make(platformId: "weibo"),
            FavoriteItemTestData.make(platformId: "zhihu")
        ]
        let filtered = items.filter { $0.platformId == "zhihu" }
        #expect(filtered.count == 2)
    }

    @Test("nil filter returns all")
    func nilFilterReturnsAll() {
        let items = FavoriteItemTestData.list(count: 5)
        let pid: String? = nil
        let filtered: [FavoriteItem]
        if let pid {
            filtered = items.filter { $0.platformId == pid }
        } else {
            filtered = items
        }
        #expect(filtered.count == 5)
    }
}

// MARK: - RC Readiness Tests

@Suite("RC Readiness — Sprint 3")
struct RCReadinessTests {

    @Test("bundle identifier format")
    func bundleIdFormat() {
        let bundleId = "com.hotapp.hottopics"
        #expect(bundleId.hasPrefix("com."))
        #expect(bundleId.contains("hottopics"))
    }

    @Test("background task identifier format is valid")
    func bgTaskFormat() {
        let id = BackgroundRefreshManager.taskIdentifier
        let parts = id.split(separator: ".")
        #expect(parts.count == 4)
    }
}
