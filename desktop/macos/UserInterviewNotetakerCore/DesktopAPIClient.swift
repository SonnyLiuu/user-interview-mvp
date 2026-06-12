import Foundation

public struct EmptyResponse: Codable, Equatable, Sendable {
    public init() {}
}

public struct StartLiveSessionRequest: Codable, Equatable, Sendable {
    public var personId: String
    public var captureProvider: String
    public var zoomMeetingIdentifier: String?

    public init(
        personId: String,
        captureProvider: String = "zoom_rtms",
        zoomMeetingIdentifier: String? = nil
    ) {
        self.personId = personId
        self.captureProvider = captureProvider
        self.zoomMeetingIdentifier = zoomMeetingIdentifier
    }
}

public struct DevAuthRequest: Codable, Equatable, Sendable {
    public var email: String
    public var name: String?

    public init(email: String, name: String? = nil) {
        self.email = email
        self.name = name
    }
}

public struct LaunchTokenRequest: Codable, Equatable, Sendable {
    public var personId: String
    public var zoomMeetingIdentifier: String?

    public init(personId: String, zoomMeetingIdentifier: String? = nil) {
        self.personId = personId
        self.zoomMeetingIdentifier = zoomMeetingIdentifier
    }
}

public struct TopicOverrideRequest: Codable, Equatable, Sendable {
    public var checked: Bool

    public init(checked: Bool) {
        self.checked = checked
    }
}

public struct TranscriptTurnRequest: Codable, Equatable, Sendable {
    public var source: String
    public var speaker: String?
    public var text: String
    public var externalTurnId: String?

    public init(source: String = "manual_upload", speaker: String? = "Speaker", text: String, externalTurnId: String? = nil) {
        self.source = source
        self.speaker = speaker
        self.text = text
        self.externalTurnId = externalTurnId
    }
}

public final class DesktopAPIClient: Sendable {
    private let session: URLSession
    private let decoder = JSONDecoder()

    public init(session: URLSession = .shared) {
        self.session = session
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

    // MARK: People (v2 – not yet wired in the UI)

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
        let request = try jsonRequest(
            base: apiBaseUrl,
            path: "/v1/desktop/sessions/end",
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
        throw lastError ?? DesktopAPIError.httpStatus(0, "saveEndSession failed after \(maxRetries) retries")
    }

    private func send<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: request)
        try validate(data: data, response: response)
        return try decoder.decode(T.self, from: data)
    }

    private func sendAllowingEmpty<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: request)
        try validate(data: data, response: response)
        if data.isEmpty, let empty = EmptyResponse() as? T {
            return empty
        }
        return try decoder.decode(T.self, from: data)
    }

    private func validate(data: Data, response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard (200..<300).contains(http.statusCode) else {
            if http.statusCode == 401 {
                throw DesktopAPIError.unauthorized
            }
            let message = (try? JSONDecoder().decode(ServerError.self, from: data).error) ?? ""
            throw DesktopAPIError.httpStatus(http.statusCode, message)
        }
    }
}

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
        let (_, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw DesktopAPIError.httpStatus(http.statusCode, "")
        }
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
        let (_, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw DesktopAPIError.httpStatus(http.statusCode, "")
        }
    }

    public func appendTranscriptTurn(
        foundryBaseUrl: String,
        sessionId: String,
        liveToken: String,
        text: String
    ) async throws {
        let request = try jsonRequest(
            base: foundryBaseUrl,
            path: "/v1/desktop/live-sessions/\(sessionId)/transcript-turns",
            method: "POST",
            bearerToken: liveToken,
            body: TranscriptTurnRequest(text: text)
        )
        let (_, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw DesktopAPIError.httpStatus(http.statusCode, "")
        }
    }

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

    private func send<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw DesktopAPIError.httpStatus(http.statusCode, "")
        }
        return try decoder.decode(T.self, from: data)
    }
}

private struct ServerError: Decodable {
    var error: String?
}
