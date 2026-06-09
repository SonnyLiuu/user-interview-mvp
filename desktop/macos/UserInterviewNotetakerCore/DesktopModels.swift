import Foundation

public enum SessionStatus: String, Codable, Sendable {
    case idle
    case pickingPerson
    case active
}

public enum TopicCategory: String, Codable, Sendable {
    case goal
    case question
    case signal
}

public struct Topic: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var label: String
    public var category: TopicCategory
    public var checked: Bool
    public var checkedBy: String?
    public var checkedAt: String?
    public var evidence: String?
    public var manualOverride: Bool

    public init(
        id: String,
        label: String,
        category: TopicCategory = .goal,
        checked: Bool = false,
        checkedBy: String? = nil,
        checkedAt: String? = nil,
        evidence: String? = nil,
        manualOverride: Bool = false
    ) {
        self.id = id
        self.label = label
        self.category = category
        self.checked = checked
        self.checkedBy = checkedBy
        self.checkedAt = checkedAt
        self.evidence = evidence
        self.manualOverride = manualOverride
    }
}

public struct DesktopPerson: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var title: String?
    public var company: String?
    public var projectName: String?
    public var projectId: String?
    public var projectSlug: String?

    public init(
        id: String,
        name: String,
        title: String? = nil,
        company: String? = nil,
        projectName: String? = nil,
        projectId: String? = nil,
        projectSlug: String? = nil
    ) {
        self.id = id
        self.name = name
        self.title = title
        self.company = company
        self.projectName = projectName
        self.projectId = projectId
        self.projectSlug = projectSlug
    }

    public var subtitle: String {
        [title, company, projectName]
            .compactMap { value in
                let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines)
                return trimmed?.isEmpty == false ? trimmed : nil
            }
            .joined(separator: " - ")
    }
}

public struct DesktopSettings: Codable, Equatable, Sendable {
    public var apiBaseUrl: String
    public var hasOverlayPosition: Bool
    public var overlayX: Double
    public var overlayY: Double

    public init(
        apiBaseUrl: String = "http://localhost:3000",
        hasOverlayPosition: Bool = false,
        overlayX: Double = 0,
        overlayY: Double = 0
    ) {
        self.apiBaseUrl = apiBaseUrl
        self.hasOverlayPosition = hasOverlayPosition
        self.overlayX = overlayX
        self.overlayY = overlayY
    }

    public var normalizedApiBaseUrl: String {
        normalizeHttpBaseUrl(apiBaseUrl, fallback: "http://localhost:3000")
    }
}

public struct DesktopAuthTokenResponse: Codable, Equatable, Sendable {
    public var token: String
    public var expiresAt: String?
}

public struct LaunchTokenResponse: Codable, Equatable, Sendable {
    public var token: String?
    public var zoomMeetingIdentifier: String?
}

public struct LiveTranscriptTurn: Codable, Equatable, Sendable {
    public var speaker: String
    public var source: String
    public var text: String
    public var externalTurnId: String?
    public var createdAt: String
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

public func normalizeHttpBaseUrl(_ raw: String?, fallback: String) -> String {
    let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    var value = trimmed.isEmpty ? fallback : trimmed
    if !value.lowercased().hasPrefix("http://") && !value.lowercased().hasPrefix("https://") {
        value = "http://" + value
    }
    while value.last == "/" {
        value.removeLast()
    }
    return value
}
