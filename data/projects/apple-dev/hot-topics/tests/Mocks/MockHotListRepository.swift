import Foundation
@testable import HotTopics
import Testing

// MARK: - MockHotListRepository

/// Mock HotListRepository for testing
final class MockHotListRepository: HotListRepository, @unchecked Sendable {

    // MARK: - Configurable Results

    var fetchFromNetworkResult: Result<[HotItem], HotTopicsError> = .success([])
    var getValidCachedResult: [HotItem] = []
    var getAllCachedResult: [HotItem] = []

    // MARK: - Call Tracking

    private(set) var fetchFromNetworkCalls: [Platform] = []
    private(set) var getValidCachedCalls: [String] = []
    private(set) var getAllCachedCalls: [String] = []
    private(set) var saveCalls: [(items: [HotItem], platform: Platform)] = []
    private(set) var purgeExpiredCalls: Int = 0
    private(set) var seedPlatformsCalls: Int = 0

    // MARK: - Errors

    var getValidCachedError: HotTopicsError?
    var getAllCachedError: HotTopicsError?
    var saveError: HotTopicsError?
    var purgeExpiredError: HotTopicsError?

    // MARK: - HotListRepository Conformance

    func fetchFromNetwork(platform: Platform) async throws -> [HotItem] {
        fetchFromNetworkCalls.append(platform)
        switch fetchFromNetworkResult {
        case .success(let items):
            return items
        case .failure(let error):
            throw error
        }
    }

    func getValidCached(platformId: String) async throws -> [HotItem] {
        getValidCachedCalls.append(platformId)
        if let error = getValidCachedError {
            throw error
        }
        return getValidCachedResult
    }

    func getAllCached(platformId: String) async throws -> [HotItem] {
        getAllCachedCalls.append(platformId)
        if let error = getAllCachedError {
            throw error
        }
        return getAllCachedResult
    }

    func save(_ items: [HotItem], for platform: Platform) async throws {
        saveCalls.append((items, platform))
        if let error = saveError {
            throw error
        }
    }

    func purgeExpired() async throws {
        purgeExpiredCalls += 1
        if let error = purgeExpiredError {
            throw error
        }
    }

    func seedPlatformsIfNeeded() async throws {
        seedPlatformsCalls += 1
    }

    // MARK: - Reset

    func reset() {
        fetchFromNetworkCalls = []
        getValidCachedCalls = []
        getAllCachedCalls = []
        saveCalls = []
        purgeExpiredCalls = 0
        seedPlatformsCalls = 0
        getValidCachedError = nil
        getAllCachedError = nil
        saveError = nil
        purgeExpiredError = nil
        fetchFromNetworkResult = .success([])
        getValidCachedResult = []
        getAllCachedResult = []
    }
}
