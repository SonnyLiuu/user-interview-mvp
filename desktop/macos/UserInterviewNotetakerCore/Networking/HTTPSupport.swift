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

func requestURL(base: String, path: String) throws -> URL {
    let normalizedBase = normalizeHttpBaseUrl(base, fallback: "http://127.0.0.1:8001")
    let joined = normalizedBase + (path.hasPrefix("/") ? path : "/" + path)
    guard let url = URL(string: joined) else {
        throw DesktopAPIError.invalidURL(joined)
    }
    return url
}

func jsonRequest(
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

/// Throws for non-2xx responses, extracting the error message from either a
/// Next.js `{"error": ...}` or FastAPI `{"detail": ...}` body.
/// `mapUnauthorized` controls whether a 401 becomes `.unauthorized` ("sign in
/// again") — appropriate for desktop-auth-token calls, but not for live-token
/// calls, where an expired live token does not mean the user is signed out.
func validateHTTPResponse(data: Data, response: URLResponse, mapUnauthorized: Bool) throws {
    guard let http = response as? HTTPURLResponse,
          !(200..<300).contains(http.statusCode)
    else { return }
    if http.statusCode == 401, mapUnauthorized {
        throw DesktopAPIError.unauthorized
    }
    let body = try? JSONDecoder().decode(ServerErrorBody.self, from: data)
    throw DesktopAPIError.httpStatus(http.statusCode, body?.message ?? "")
}

private struct ServerErrorBody: Decodable {
    var error: String?
    var detail: String?

    var message: String? {
        error ?? detail
    }

    private enum CodingKeys: String, CodingKey {
        case error
        case detail
    }

    init(from decoder: Decoder) throws {
        // `detail` may be a non-string (FastAPI validation errors); ignore
        // anything that isn't a plain message rather than failing.
        let container = try decoder.container(keyedBy: CodingKeys.self)
        error = try? container.decodeIfPresent(String.self, forKey: .error)
        detail = try? container.decodeIfPresent(String.self, forKey: .detail)
    }
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
