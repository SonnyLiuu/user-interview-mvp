import Foundation

/// Client for endpoints authenticated with the long-lived desktop auth token:
/// dev sign-in, the people list, launch tokens, live-session start (FastAPI),
/// and the final session save (Next.js).
public final class DesktopAPIClient: Sendable {
    private let session: URLSession
    private let decoder = JSONDecoder()

    public init(session: URLSession? = nil) {
        self.session = session ?? DesktopAPIClient.defaultSession()
    }

    private static func defaultSession() -> URLSession {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 8
        configuration.timeoutIntervalForResource = 15
        return URLSession(configuration: configuration)
    }

    public func devAuthToken(apiBaseUrl: String, email: String) async throws -> DesktopAuthTokenResponse {
        let request = try jsonRequest(
            base: apiBaseUrl,
            path: "/v1/desktop/auth/dev-token",
            method: "POST",
            bearerToken: nil,
            body: DevAuthRequest(email: email)
        )
        return try await send(request)
    }

    public func people(apiBaseUrl: String, authToken: String) async throws -> [DesktopPerson] {
        let request = try jsonRequest(
            base: apiBaseUrl,
            path: "/v1/desktop/people",
            method: "GET",
            bearerToken: authToken
        )
        return try await send(request)
    }

    public func launchToken(
        apiBaseUrl: String,
        authToken: String,
        personId: String,
        zoomMeetingIdentifier: String?
    ) async throws -> LaunchTokenResponse {
        let body = LaunchTokenRequest(personId: personId, zoomMeetingIdentifier: zoomMeetingIdentifier)
        let request = try jsonRequest(
            base: apiBaseUrl,
            path: "/v1/desktop/launch-token",
            method: "POST",
            bearerToken: authToken,
            body: body
        )
        return try await send(request)
    }

    public func startLiveSession(
        apiBaseUrl: String,
        authToken: String,
        personId: String,
        captureProvider: String = "desktop_audio",
        zoomMeetingIdentifier: String? = nil
    ) async throws -> LiveSessionResponse {
        let body = StartLiveSessionRequest(
            personId: personId,
            captureProvider: captureProvider,
            zoomMeetingIdentifier: zoomMeetingIdentifier
        )
        let request = try jsonRequest(
            base: apiBaseUrl,
            path: "/v1/desktop/live-sessions",
            method: "POST",
            bearerToken: authToken,
            body: body
        )
        return try await send(request)
    }

    public func saveEndSession(
        apiBaseUrl: String,
        authToken: String,
        body: EndSessionRequest,
        maxRetries: Int = 3
    ) async throws -> EmptyResponse {
        // Save goes to Next.js (port 3000), not FastAPI (port 8001).
        let settings = DesktopSettings(apiBaseUrl: apiBaseUrl)
        let nextBase = settings.normalizedNextBaseUrl
        let request = try jsonRequest(
            base: nextBase,
            path: "/api/desktop/sessions/end",
            method: "POST",
            bearerToken: authToken,
            body: body
        )
        var lastError: Error?
        for attempt in 0...maxRetries {
            do {
                return try await sendAllowingEmpty(request)
            } catch {
                lastError = error
                if case DesktopAPIError.unauthorized = error { throw error }
                guard attempt < maxRetries else { break }
                let delay = UInt64(pow(2.0, Double(attempt))) * 500_000_000 // 0.5s, 1s, 2s
                try? await Task.sleep(nanoseconds: delay)
            }
        }
        throw lastError ?? DesktopAPIError.httpStatus(0, "saveEndSession failed after \(maxRetries + 1) attempts")
    }

    private func send<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: request)
        try validateHTTPResponse(data: data, response: response, mapUnauthorized: true)
        return try decoder.decode(T.self, from: data)
    }

    private func sendAllowingEmpty<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: request)
        try validateHTTPResponse(data: data, response: response, mapUnauthorized: true)
        if data.isEmpty, let empty = EmptyResponse() as? T {
            return empty
        }
        return try decoder.decode(T.self, from: data)
    }
}
