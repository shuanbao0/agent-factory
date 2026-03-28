import Foundation
import Testing
@testable import HotTopics

// MARK: - TophubAPIClient Tests

@Suite("TophubAPIClient — Network Requests")
struct TophubAPIClientTests {

    // MARK: - Happy Path

    @Test("fetchHotList decodes valid JSON response")
    func test_fetchHotList_decodesResponse() async throws {
        let mockSession = MockURLSessionForAPI()
        let validJSON = """
        {
            "error": false,
            "status": 200,
            "data": {
                "hashid": "mproPpoq6O",
                "name": "知乎",
                "display": "热榜",
                "items": [
                    {
                        "title": "测试条目1",
                        "url": "https://www.zhihu.com/question/1",
                        "description": "摘要1",
                        "thumbnail": null,
                        "extra": "100"
                    },
                    {
                        "title": "测试条目2",
                        "url": "https://www.zhihu.com/question/2",
                        "description": "摘要2",
                        "thumbnail": "https://example.com/img.jpg",
                        "extra": "50"
                    }
                ]
            }
        }
        """.data(using: .utf8)!

        mockSession.data = validJSON
        mockSession.response = HTTPURLResponse(
            url: URL(string: "https://api.tophubdata.com/nodes/mproPpoq6O")!,
            statusCode: 200,
            httpVersion: nil,
            headerFields: nil
        )

        let client = TophubAPIClient(session: mockSession, apiKey: "test_key")
        let result = try await client.fetchHotList(hashId: "mproPpoq6O")

        #expect(result.count == 2)
        #expect(result[0].title == "测试条目1")
        #expect(result[0].hotValue == 100)
        #expect(result[1].title == "测试条目2")
    }

    @Test("fetchHotList constructs correct URL")
    func test_fetchHotList_correctURL() async throws {
        let mockSession = MockURLSessionForAPI()
        mockSession.data = validEmptyResponse()
        mockSession.response = HTTPURLResponse(
            url: URL(string: "https://api.tophubdata.com")!,
            statusCode: 200,
            httpVersion: nil,
            headerFields: nil
        )

        let client = TophubAPIClient(session: mockSession, apiKey: "key")
        _ = try? await client.fetchHotList(hashId: "mproPpoq6O")

        #expect(mockSession.receivedRequest?.url?.path == "/nodes/mproPpoq6O")
    }

    // MARK: - Error Handling

    @Test("fetchHotList throws authorizationFailed on empty API key")
    func test_fetchHotList_emptyAPIKey_throws() async throws {
        let mockSession = MockURLSessionForAPI()
        let client = TophubAPIClient(session: mockSession, apiKey: "")

        await #expect(throws: HotTopicsError.authorizationFailed) {
            try await client.fetchHotList(hashId: "hash")
        }
    }

    @Test("fetchHotList throws networkUnavailable on network error")
    func test_fetchHotList_networkError_throws() async throws {
        let mockSession = MockURLSessionForAPI()
        mockSession.error = URLError(.notConnectedToInternet)

        let client = TophubAPIClient(session: mockSession, apiKey: "key")

        await #expect(throws: HotTopicsError.networkUnavailable) {
            try await client.fetchHotList(hashId: "hash")
        }
    }

    @Test("fetchHotList throws authorizationFailed on 401")
    func test_fetchHotList_401_throws() async throws {
        let mockSession = MockURLSessionForAPI()
        mockSession.data = "{}".data(using: .utf8)!
        mockSession.response = HTTPURLResponse(
            url: URL(string: "https://api.tophubdata.com")!,
            statusCode: 401,
            httpVersion: nil,
            headerFields: nil
        )

        let client = TophubAPIClient(session: mockSession, apiKey: "bad_key")

        await #expect(throws: HotTopicsError.authorizationFailed) {
            try await client.fetchHotList(hashId: "hash")
        }
    }

    @Test("fetchHotList throws rateLimited on 429")
    func test_fetchHotList_429_throws() async throws {
        let mockSession = MockURLSessionForAPI()
        mockSession.data = "{}".data(using: .utf8)!
        mockSession.response = HTTPURLResponse(
            url: URL(string: "https://api.tophubdata.com")!,
            statusCode: 429,
            httpVersion: nil,
            headerFields: nil
        )

        let client = TophubAPIClient(session: mockSession, apiKey: "key")

        await #expect(throws: HotTopicsError.rateLimited) {
            try await client.fetchHotList(hashId: "hash")
        }
    }

    @Test("fetchHotList throws apiError on 500")
    func test_fetchHotList_500_throws() async throws {
        let mockSession = MockURLSessionForAPI()
        mockSession.data = "Internal Server Error".data(using: .utf8)!
        mockSession.response = HTTPURLResponse(
            url: URL(string: "https://api.tophubdata.com")!,
            statusCode: 500,
            httpVersion: nil,
            headerFields: nil
        )

        let client = TophubAPIClient(session: mockSession, apiKey: "key")

        await #expect(throws: HotTopicsError.apiError("500")) {
            try await client.fetchHotList(hashId: "hash")
        }
    }

    // MARK: - Response Parsing

    @Test("fetchHotList handles null thumbnail")
    func test_fetchHotList_nullThumbnail() async throws {
        let mockSession = MockURLSessionForAPI()
        let json = """
        {
            "error": false,
            "status": 200,
            "data": {
                "hashid": "hash",
                "name": "知乎",
                "display": "热榜",
                "items": [{
                    "title": "标题",
                    "url": "https://zhihu.com/1",
                    "description": null,
                    "thumbnail": null,
                    "extra": null
                }]
            }
        }
        """.data(using: .utf8)!

        mockSession.data = json
        mockSession.response = HTTPURLResponse(
            url: URL(string: "https://api.tophubdata.com")!,
            statusCode: 200,
            httpVersion: nil,
            headerFields: nil
        )

        let client = TophubAPIClient(session: mockSession, apiKey: "key")
        let result = try await client.fetchHotList(hashId: "hash")

        #expect(result[0].thumbnailURL == nil)
        #expect(result[0].description == nil)
        #expect(result[0].extra == nil)
    }

    @Test("fetchHotList parses wan correctly")
    func test_fetchHotList_parsesWan() async throws {
        let mockSession = MockURLSessionForAPI()
        let json = """
        {
            "error": false,
            "status": 200,
            "data": {
                "hashid": "hash",
                "name": "知乎",
                "display": "热榜",
                "items": [{
                    "title": "标题",
                    "url": "https://zhihu.com/1",
                    "description": null,
                    "thumbnail": null,
                    "extra": "455"
                }]
            }
        }
        """.data(using: .utf8)!

        mockSession.data = json
        mockSession.response = HTTPURLResponse(
            url: URL(string: "https://api.tophubdata.com")!,
            statusCode: 200,
            httpVersion: nil,
            headerFields: nil
        )

        let client = TophubAPIClient(session: mockSession, apiKey: "key")
        let result = try await client.fetchHotList(hashId: "hash")

        #expect(result[0].hotValue == 455)
    }

    // MARK: - Helpers

    private func validEmptyResponse() -> Data {
        """
        {
            "error": false,
            "status": 200,
            "data": {
                "hashid": "hash",
                "name": "知乎",
                "display": "热榜",
                "items": []
            }
        }
        """.data(using: .utf8)!
    }
}

// MARK: - Mock URLSessionProtocol

final class MockURLSessionForAPI: URLSessionProtocol, @unchecked Sendable {
    var data: Data?
    var response: URLResponse?
    var error: Error?
    private(set) var receivedRequest: URLRequest?

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        receivedRequest = request
        if let error = error {
            throw error
        }
        guard let data = data, let response = response else {
            throw HotTopicsError.networkUnavailable
        }
        return (data, response)
    }
}
