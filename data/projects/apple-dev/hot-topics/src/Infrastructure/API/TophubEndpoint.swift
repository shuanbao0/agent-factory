import Foundation

// MARK: - TophubEndpoint

/// tophubdata.com API 端点定义
enum TophubEndpoint {
    case nodes
    case node(hashId: String)
    case history(hashId: String, date: String)

    // MARK: - Base URL

    // swiftlint:disable:next force_unwrapping
    static let baseURL = URL(string: "https://api.tophubdata.com")!

    // MARK: - URL

    var url: URL {
        switch self {
        case .nodes:
            return Self.baseURL.appending(path: "nodes")
        case .node(let hashId):
            return Self.baseURL.appending(path: "nodes/\(hashId)")
        case .history(let hashId, let date):
            return Self.baseURL.appending(path: "nodes/\(hashId)/historys/\(date)")
        }
    }

    // MARK: - URLRequest

    func request(apiKey: String) -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 15
        return request
    }
}
