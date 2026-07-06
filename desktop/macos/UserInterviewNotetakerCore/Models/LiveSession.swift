import Foundation

public enum SessionStatus: String, Codable, Sendable {
    case idle
    case pickingPerson
    case active
}

public struct LiveTranscriptTurn: Codable, Equatable, Sendable {
    public var speaker: String
    public var source: String
    public var text: String
    public var externalTurnId: String?
    public var createdAt: String
}

public struct LiveTranscriptTurnResponse: Codable, Equatable, Sendable {
    public var sessionId: String
    public var turn: LiveTranscriptTurn
    public var transcriptRaw: String
}

public struct LiveSessionResponse: Codable, Equatable, Sendable {
    public var sessionId: String
    public var personId: String
    public var personName: String
    public var status: String
    public var captureProvider: String
    public var audioCaptureEnabled: Bool
    public var zoomMeetingIdentifier: String?
    public var liveToken: String?
    public var foundryBaseUrl: String?
    public var topics: [Topic]
    public var startedAt: String
    public var endedAt: String?
    public var realtimeStatus: String?
    public var realtimeError: String?
    public var transcriptTurns: [LiveTranscriptTurn]?
    public var transcriptRaw: String?

    public init(
        sessionId: String,
        personId: String,
        personName: String,
        status: String,
        captureProvider: String,
        audioCaptureEnabled: Bool,
        zoomMeetingIdentifier: String? = nil,
        liveToken: String? = nil,
        foundryBaseUrl: String? = nil,
        topics: [Topic],
        startedAt: String,
        endedAt: String? = nil,
        realtimeStatus: String? = nil,
        realtimeError: String? = nil,
        transcriptTurns: [LiveTranscriptTurn]? = nil,
        transcriptRaw: String? = nil
    ) {
        self.sessionId = sessionId
        self.personId = personId
        self.personName = personName
        self.status = status
        self.captureProvider = captureProvider
        self.audioCaptureEnabled = audioCaptureEnabled
        self.zoomMeetingIdentifier = zoomMeetingIdentifier
        self.liveToken = liveToken
        self.foundryBaseUrl = foundryBaseUrl
        self.topics = topics
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.realtimeStatus = realtimeStatus
        self.realtimeError = realtimeError
        self.transcriptTurns = transcriptTurns
        self.transcriptRaw = transcriptRaw
    }
}

/// A single parsed server-sent event from the live-session event stream.
public struct LiveSessionEvent: Equatable, Sendable {
    public var id: String?
    public var type: String
    public var data: Data

    public init(id: String? = nil, type: String, data: Data) {
        self.id = id
        self.type = type
        self.data = data
    }
}
