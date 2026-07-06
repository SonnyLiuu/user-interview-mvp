import Foundation

public enum TopicCategory: String, Codable, Sendable {
    case goal
    case question
    case signal

    /// The backend stores categories as free-form JSON strings and defaults
    /// unknown values to "goal"; decode leniently so one unexpected category
    /// cannot fail an entire session payload.
    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = TopicCategory(rawValue: raw) ?? .goal
    }
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

/// Merges a server topic list into the local one. Local manual overrides win
/// over `gpt_realtime` auto-checks so a user's explicit toggle is never undone
/// by a stale realtime match.
public func mergeTopics(existing: [Topic], incoming: [Topic]) -> [Topic] {
    incoming.map { next in
        guard let current = existing.first(where: { $0.id == next.id }) else {
            return next
        }
        if current.manualOverride && next.checkedBy == "gpt_realtime" {
            return current
        }
        return next
    }
}
