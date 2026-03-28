import Foundation
import Testing
@testable import HotTopics

// MARK: - FetchHotListUseCase Tests

@Suite("FetchHotListUseCase — Cache-First Strategy")
struct FetchHotListUseCaseTests {

    // MARK: - Execute with Valid Cache

    @Test("execute returns cached items when cache is valid")
    func test_execute_withValidCache_returnsCached() async throws {
        let mockRepo = MockHotListRepository()
        let cachedItems = HotItemTestData.list(count: 20, platformId: "zhihu")
        mockRepo.getValidCachedResult = cachedItems

        let sut = FetchHotListUseCase(repository: mockRepo)
        let result = try await sut.execute(platform: PlatformTestData.zhihu)

        #expect(result == cachedItems)
        #expect(mockRepo.getValidCachedCalls == ["zhihu"])
        #expect(mockRepo.fetchFromNetworkCalls.isEmpty)
    }

    @Test("execute calls getValidCached before network")
    func test_execute_checksCacheFirst() async throws {
        let mockRepo = MockHotListRepository()
        mockRepo.getValidCachedResult = []
        mockRepo.fetchFromNetworkResult = .success(HotItemTestData.list(count: 10))

        let sut = FetchHotListUseCase(repository: mockRepo)
        _ = try await sut.execute(platform: PlatformTestData.zhihu)

        #expect(mockRepo.getValidCachedCalls.first == "zhihu")
        #expect(mockRepo.fetchFromNetworkCalls.count == 1)
    }

    // MARK: - Execute with Expired Cache

    @Test("execute fetches from network when cache is empty")
    func test_execute_withEmptyCache_fetchesNetwork() async throws {
        let mockRepo = MockHotListRepository()
        mockRepo.getValidCachedResult = []
        let networkItems = HotItemTestData.list(count: 15, platformId: "weibo")
        mockRepo.fetchFromNetworkResult = .success(networkItems)

        let sut = FetchHotListUseCase(repository: mockRepo)
        let result = try await sut.execute(platform: PlatformTestData.weibo)

        #expect(result == networkItems)
        #expect(mockRepo.fetchFromNetworkCalls == [PlatformTestData.weibo])
    }

    @Test("execute saves fetched items to cache")
    func test_execute_savesToCache() async throws {
        let mockRepo = MockHotListRepository()
        mockRepo.getValidCachedResult = []
        let items = HotItemTestData.list(count: 10)
        mockRepo.fetchFromNetworkResult = .success(items)

        let sut = FetchHotListUseCase(repository: mockRepo)
        _ = try await sut.execute(platform: PlatformTestData.zhihu)

        #expect(mockRepo.saveCalls.count == 1)
        #expect(mockRepo.saveCalls.first?.items == items)
        #expect(mockRepo.saveCalls.first?.platform == PlatformTestData.zhihu)
    }

    // MARK: - Execute with Network Error

    @Test("execute throws when network fails and no cache")
    func test_execute_networkError_throws() async throws {
        let mockRepo = MockHotListRepository()
        mockRepo.getValidCachedResult = []
        mockRepo.fetchFromNetworkResult = .failure(.networkUnavailable)

        let sut = FetchHotListUseCase(repository: mockRepo)

        await #expect(throws: HotTopicsError.networkUnavailable) {
            try await sut.execute(platform: PlatformTestData.zhihu)
        }
    }

    @Test("execute throws apiError with message")
    func test_execute_apiError_throws() async throws {
        let mockRepo = MockHotListRepository()
        mockRepo.getValidCachedResult = []
        mockRepo.fetchFromNetworkResult = .failure(.apiError("Server error"))

        let sut = FetchHotListUseCase(repository: mockRepo)

        await #expect(throws: HotTopicsError.apiError("Server error")) {
            try await sut.execute(platform: PlatformTestData.zhihu)
        }
    }

    // MARK: - Force Refresh

    @Test("forceRefresh bypasses cache and fetches network")
    func test_forceRefresh_bypassesCache() async throws {
        let mockRepo = MockHotListRepository()
        mockRepo.getValidCachedResult = HotItemTestData.list(count: 20) // stale cache
        let freshItems = HotItemTestData.list(count: 10)
        mockRepo.fetchFromNetworkResult = .success(freshItems)

        let sut = FetchHotListUseCase(repository: mockRepo)
        let result = try await sut.forceRefresh(platform: PlatformTestData.zhihu)

        #expect(result == freshItems)
        #expect(mockRepo.getValidCachedCalls.isEmpty) // cache not checked
        #expect(mockRepo.fetchFromNetworkCalls == [PlatformTestData.zhihu])
    }

    @Test("forceRefresh saves new items to cache")
    func test_forceRefresh_savesToCache() async throws {
        let mockRepo = MockHotListRepository()
        let items = HotItemTestData.list(count: 10)
        mockRepo.fetchFromNetworkResult = .success(items)

        let sut = FetchHotListUseCase(repository: mockRepo)
        _ = try await sut.forceRefresh(platform: PlatformTestData.zhihu)

        #expect(mockRepo.saveCalls.count == 1)
    }

    @Test("forceRefresh throws network error")
    func test_forceRefresh_networkError_throws() async throws {
        let mockRepo = MockHotListRepository()
        mockRepo.fetchFromNetworkResult = .failure(.authorizationFailed)

        let sut = FetchHotListUseCase(repository: mockRepo)

        await #expect(throws: HotTopicsError.authorizationFailed) {
            try await sut.forceRefresh(platform: PlatformTestData.zhihu)
        }
    }

    // MARK: - Edge Cases

    @Test("execute handles empty network response")
    func test_execute_emptyNetworkResponse() async throws {
        let mockRepo = MockHotListRepository()
        mockRepo.getValidCachedResult = []
        mockRepo.fetchFromNetworkResult = .success([])

        let sut = FetchHotListUseCase(repository: mockRepo)
        let result = try await sut.execute(platform: PlatformTestData.zhihu)

        #expect(result.isEmpty)
    }

    @Test("execute with unavailable platform hashId still calls repository")
    func test_execute_unavailablePlatform_callsRepository() async throws {
        let mockRepo = MockHotListRepository()
        mockRepo.getValidCachedResult = []
        mockRepo.fetchFromNetworkResult = .failure(.apiError("Invalid hashId"))

        let unavailablePlatform = PlatformTestData.unavailable()
        let sut = FetchHotListUseCase(repository: mockRepo)

        await #expect(throws: HotTopicsError.apiError("Invalid hashId")) {
            try await sut.execute(platform: unavailablePlatform)
        }
    }
}
