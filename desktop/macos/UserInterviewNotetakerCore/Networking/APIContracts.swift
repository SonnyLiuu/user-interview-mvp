import Foundation

// Request/response DTOs shared with the Next.js and FastAPI backends.
// Field names are part of the wire contract — do not rename.

public struct EmptyResponse: Codable, Equatable, Sendable {
    public init() {}
}

public struct DevAuthRequest: Codable, Equatable, Sendable {
    public var email: String
    public var name: String?

    public init(email: String, name: String? = nil) {
        self.email = email
        self.name = name
    }
}

public struct DesktopAuthTokenResponse: Codable, Equatable, Sendable {
    public var token: String
    public var expiresAt: String?
}

public struct LaunchTokenRequest: Codable, Equatable, Sendable {
    public var personId: String
    public var zoomMeetingIdentifier: String?

    public init(personId: String, zoomMeetingIdentifier: String? = nil) {
        self.personId = personId
        self.zoomMeetingIdentifier = zoomMeetingIdentifier
    }
}

public struct LaunchTokenResponse: Codable, Equatable, Sendable {
    public var token: String?
    public var zoomMeetingIdentifier: String?
}

public struct StartLiveSessionRequest: Codable, Equatable, Sendable {
    public var personId: String
    public var captureProvider: String
    public var zoomMeetingIdentifier: String?

    public init(
        personId: String,
        captureProvider: String = "desktop_audio",
        zoomMeetingIdentifier: String? = nil
    ) {
        self.personId = personId
        self.captureProvider = captureProvider
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

public struct EndSessionTopic: Codable, Equatable, Sendable {
    public var id: String
    public var label: String
    public var checked: Bool
    public var checkedBy: String?
    public var checkedAt: String?
    public var evidence: String?
    public var manualOverride: Bool

    public init(topic: Topic) {
        id = topic.id
        label = topic.label
        checked = topic.checked
        checkedBy = topic.checkedBy
        checkedAt = topic.checkedAt
        evidence = topic.evidence
        manualOverride = topic.manualOverride
    }
}

public struct EndSessionRequest: Codable, Equatable, Sendable {
    public var personId: String
    public var startedAt: String
    public var endedAt: String
    public var liveSessionId: String?
    public var liveToken: String?
    public var topics: [EndSessionTopic]
    public var notesRaw: String
    public var transcriptRaw: String

    public init(
        personId: String,
        startedAt: String,
        endedAt: String,
        liveSessionId: String?,
        liveToken: String?,
        topics: [EndSessionTopic],
        notesRaw: String,
        transcriptRaw: String
    ) {
        self.personId = personId
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.liveSessionId = liveSessionId
        self.liveToken = liveToken
        self.topics = topics
        self.notesRaw = notesRaw
        self.transcriptRaw = transcriptRaw
    }
}
