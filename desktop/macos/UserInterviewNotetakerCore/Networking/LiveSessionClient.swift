import Foundation

/// Client for the FastAPI live-session endpoints authenticated with the
/// short-lived per-session live token. A 401 here means the live token
/// expired, not that the user is signed out, so it is never mapped to
/// `DesktopAPIError.unauthorized`.
public final class LiveSessionClient: Sendable {
    private let session: URLSession
    private let decoder = JSONDecoder()

    public init(session: URLSession = .shared) {
        self.session = session
    }

    public func snapshot(foundryBaseUrl: String, sessionId: String, liveToken: String) async throws -> LiveSessionResponse {
        let request = try jsonRequest(
            base: foundryBaseUrl,
            path: "/v1/desktop/live-sessions/\(sessionId)",
            method: "GET",
            bearerToken: liveToken
        )
        return try await send(request)
    }

    public func end(foundryBaseUrl: String, sessionId: String, liveToken: String) async throws {
        let request = try jsonRequest(
            base: foundryBaseUrl,
            path: "/v1/desktop/live-sessions/\(sessionId)/end",
            method: "POST",
            bearerToken: liveToken,
            body: EmptyResponse()
        )
        try await sendIgnoringBody(request)
    }

    public func overrideTopic(
        foundryBaseUrl: String,
        sessionId: String,
        liveToken: String,
        topicId: String,
        checked: Bool
    ) async throws {
        let request = try jsonRequest(
            base: foundryBaseUrl,
            path: "/v1/desktop/live-sessions/\(sessionId)/topics/\(topicId)/override",
            method: "POST",
            bearerToken: liveToken,
            body: TopicOverrideRequest(checked: checked)
        )
        try await sendIgnoringBody(request)
    }

    public func appendTranscriptTurn(
        foundryBaseUrl: String,
        sessionId: String,
        liveToken: String,
        text: String
    ) async throws -> LiveTranscriptTurnResponse {
        let request = try jsonRequest(
            base: foundryBaseUrl,
            path: "/v1/desktop/live-sessions/\(sessionId)/transcript-turns",
            method: "POST",
            bearerToken: liveToken,
            body: TranscriptTurnRequest(text: text)
        )
        return try await send(request)
    }

    /// Builds the SSE request for the live event stream; the caller owns
    /// streaming and reconnect behavior.
    public func events(foundryBaseUrl: String, sessionId: String, liveToken: String) throws -> URLRequest {
        var request = URLRequest(url: try requestURL(
            base: foundryBaseUrl,
            path: "/v1/desktop/live-sessions/\(sessionId)/events"
        ))
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(liveToken)", forHTTPHeaderField: "Authorization")
        return request
    }

    /// Builds the WebSocket request for streaming desktop audio. The live
    /// token goes in the Authorization header, not the query string, so it
    /// never lands in server or proxy access logs.
    public func audioStreamRequest(foundryBaseUrl: String, sessionId: String, liveToken: String) throws -> URLRequest {
        let httpURL = try requestURL(
            base: foundryBaseUrl,
            path: "/v1/desktop/live-sessions/\(sessionId)/audio"
        )
        guard var components = URLComponents(url: httpURL, resolvingAgainstBaseURL: false) else {
            throw DesktopAPIError.invalidURL(httpURL.absoluteString)
        }
        components.scheme = components.scheme == "https" ? "wss" : "ws"
        guard let wsURL = components.url else {
            throw DesktopAPIError.invalidURL(httpURL.absoluteString)
        }
        var request = URLRequest(url: wsURL)
        request.setValue("Bearer \(liveToken)", forHTTPHeaderField: "Authorization")
        return request
    }

    private func send<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: request)
        try validateHTTPResponse(data: data, response: response, mapUnauthorized: false)
        return try decoder.decode(T.self, from: data)
    }

    private func sendIgnoringBody(_ request: URLRequest) async throws {
        let (data, response) = try await session.data(for: request)
        try validateHTTPResponse(data: data, response: response, mapUnauthorized: false)
    }
}
