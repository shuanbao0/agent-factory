import Foundation

// MARK: - URLSessionProtocol

/// URLSession 抽象协议（支持测试注入 Mock）
protocol URLSessionProtocol: Sendable {
    func data(for request: URLRequest) async throws -> (Data, URLResponse)
}

extension URLSession: URLSessionProtocol {}

// MARK: - TophubAPIClient

/// tophubdata.com API 客户端（actor 隔离，线程安全）
actor TophubAPIClient {

    // MARK: - Dependencies

    private let session: any URLSessionProtocol
    private let apiKey: String

    // MARK: - Init

    init(session: any URLSessionProtocol = URLSession.shared, apiKey: String) {
        self.session = session
        self.apiKey = apiKey
    }

    // MARK: - Fetch Hot List

    /// 获取指定 hashId 的热榜数据
    func fetchHotList(hashId: String) async throws -> [HotItem] {
        guard !apiKey.isEmpty else {
            throw HotTopicsError.authorizationFailed
        }

        let endpoint = TophubEndpoint.node(hashId: hashId)
        let request = endpoint.request(apiKey: apiKey)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw HotTopicsError.networkUnavailable
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw HotTopicsError.unknown
        }

        switch httpResponse.statusCode {
        case 200:
            break
        case 401, 403:
            throw HotTopicsError.authorizationFailed
        case 429:
            throw HotTopicsError.rateLimited
        default:
            throw HotTopicsError.apiError("\(httpResponse.statusCode)")
        }

        return try parseResponse(data: data, hashId: hashId)
    }

    /// 获取指定平台的热榜数据（便捷方法）
    func fetchHotList(platform: Platform) async throws -> [HotItem] {
        guard !platform.hashId.isEmpty else {
            throw HotTopicsError.invalidURL(platform.id)
        }
        var items = try await fetchHotList(hashId: platform.hashId)
        // 补充 platformId（解析时用 hashId 作 platformId，这里替换为实际 id）
        items = items.map { item in
            HotItem(
                id: "\(platform.id)_\(item.rank)",
                title: item.title,
                url: item.url,
                description: item.description,
                thumbnailURL: item.thumbnailURL,
                hotValue: item.hotValue,
                extra: item.extra,
                rank: item.rank,
                platformId: platform.id,
                cachedAt: item.cachedAt,
                expiresAt: item.expiresAt
            )
        }
        return items
    }

    // MARK: - Parse

    private func parseResponse(data: Data, hashId: String) throws -> [HotItem] {
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        guard let dataDict = json?["data"] as? [String: Any],
              let rawItems = dataDict["items"] as? [[String: Any]] else {
            throw HotTopicsError.apiError("Invalid response format")
        }

        let now = Date()
        let ttl: TimeInterval = 15 * 60

        return rawItems.enumerated().compactMap { index, dict in
            guard let title = dict["title"] as? String else { return nil }
            let urlString = dict["url"] as? String ?? ""
            guard let url = URL(string: urlString) else { return nil }

            let rank = index + 1
            let extra = dict["extra"] as? String
            let hotValue = parseHotValue(extra)

            return HotItem(
                id: "\(hashId)_\(rank)",
                title: title,
                url: url,
                description: dict["description"] as? String,
                thumbnailURL: (dict["thumbnail"] as? String).flatMap { URL(string: $0) },
                hotValue: hotValue,
                extra: extra,
                rank: rank,
                platformId: hashId,
                cachedAt: now,
                expiresAt: now.addingTimeInterval(ttl)
            )
        }
    }

    private func parseHotValue(_ extra: String?) -> Int {
        guard let extra else { return 0 }
        let digits = extra.filter { $0.isNumber || $0 == "." }
        guard let value = Double(digits) else { return 0 }
        if extra.contains("亿") { return Int(value * 100_000_000) }
        if extra.contains("万") { return Int(value * 10_000) }
        return Int(value)
    }
}
