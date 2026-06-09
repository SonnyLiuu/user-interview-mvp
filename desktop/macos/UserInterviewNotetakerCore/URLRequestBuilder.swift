import Foundation

public enum DesktopAPIError: Error, LocalizedError, Equatable {
    case invalidURL(String)
    case unauthorized
    case httpStatus(Int, String)
    case emptyBody

    public var errorDescription: String? {
        switch self {
        case .invalidURL(let value):
            return "Invalid URL: \(value)"
        case .unauthorized:
            return "Sign in again to continue."
        case .httpStatus(let status, let message):
            return message.isEmpty ? "Request failed with status \(status)." : message
        case .emptyBody:
            return "The server returned an empty response."
        }
    }
}

public func requestURL(base: String, path: String) throws -> URL {
    let normalizedBase = normalizeHttpBaseUrl(base, fallback: "http://localhost:3000")
    let joined = normalizedBase + (path.hasPrefix("/") ? path : "/" + path)
    guard let url = URL(string: joined) else {
        throw DesktopAPIError.invalidURL(joined)
    }
    return url
}

public func jsonRequest(
    base: String,
    path: String,
    method: String,
    bearerToken: String?,
    body: Encodable? = nil
) throws -> URLRequest {
    var request = URLRequest(url: try requestURL(base: base, path: path))
    request.httpMethod = method
    request.cachePolicy = .reloadIgnoringLocalCacheData
    if let bearerToken, !bearerToken.isEmpty {
        request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
    }
    if let body {
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(AnyEncodable(body))
    }
    return request
}

private struct AnyEncodable: Encodable {
    private let encodeValue: (Encoder) throws -> Void

    init(_ wrapped: Encodable) {
        encodeValue = wrapped.encode(to:)
    }

    func encode(to encoder: Encoder) throws {
        try encodeValue(encoder)
    }
}
