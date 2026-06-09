import Foundation
import Combine
import UserInterviewNotetakerCore

@MainActor
final class AppViewModel: ObservableObject {
    /// Shared formatter so date strings are consistent across the app.
    static let iso8601 = ISO8601DateFormatter()

    @Published var status: SessionStatus = .idle
    @Published var settings = DesktopSettings()
    @Published var authToken: String?
    @Published var selectedPersonId: String?
    @Published var selectedPersonName = ""
    @Published var sessionStartedAt: String?
    @Published var liveSessionId: String?
    @Published var liveToken: String?
    @Published var foundryBaseUrl: String?
    @Published var captureProvider = "zoom_rtms"
    @Published var realtimeStatus = "idle"
    @Published var realtimeError: String?
    @Published var liveTranscriptRaw = ""
    @Published var topics: [Topic] = []
    @Published var message = "Ready."

    var isActive: Bool {
        status == .active
    }

    func applyLiveSession(_ response: LiveSessionResponse) {
        selectedPersonId = response.personId
        selectedPersonName = response.personName
        liveSessionId = response.sessionId
        liveToken = response.liveToken
        foundryBaseUrl = response.foundryBaseUrl.map { normalizeHttpBaseUrl($0, fallback: "http://127.0.0.1:8001") }
        captureProvider = response.captureProvider
        realtimeStatus = response.realtimeStatus ?? "pending"
        realtimeError = response.realtimeError
        liveTranscriptRaw = response.transcriptRaw ?? ""
        topics = response.topics
        sessionStartedAt = response.startedAt
        status = .active
        message = "Live checklist active."
    }

    func applySnapshot(_ response: LiveSessionResponse) {
        topics = mergeTopics(incoming: response.topics)
        realtimeStatus = response.realtimeStatus ?? realtimeStatus
        realtimeError = response.realtimeError
        liveTranscriptRaw = response.transcriptRaw ?? liveTranscriptRaw
    }

    func applyTopic(_ incoming: Topic) {
        if let index = topics.firstIndex(where: { $0.id == incoming.id }) {
            topics[index] = incoming
        }
    }

    func toggleTopic(_ topic: Topic) {
        guard let index = topics.firstIndex(where: { $0.id == topic.id }) else { return }
        topics[index].checked.toggle()
        topics[index].checkedBy = "manual"
        topics[index].checkedAt = Self.iso8601.string(from: Date())
        topics[index].evidence = nil
        topics[index].manualOverride = true
    }

    func resetSession() {
        status = .idle
        selectedPersonId = nil
        selectedPersonName = ""
        sessionStartedAt = nil
        liveSessionId = nil
        liveToken = nil
        foundryBaseUrl = nil
        captureProvider = "zoom_rtms"
        realtimeStatus = "idle"
        realtimeError = nil
        liveTranscriptRaw = ""
        topics = []
        message = "Ready."
    }

    func notesSummary() -> String {
        let checklistTopics = topics.filter { $0.category != .signal }
        let checked = checklistTopics.filter(\.checked)
        let unchecked = checklistTopics.filter { !$0.checked }
        return [
            "Checked topics:",
            checked.isEmpty ? "- None" : checked.map { "- \($0.label)" }.joined(separator: "\n"),
            "",
            "Unchecked topics:",
            unchecked.isEmpty ? "- None" : unchecked.map { "- \($0.label)" }.joined(separator: "\n")
        ].joined(separator: "\n")
    }

    func endSessionRequest() -> EndSessionRequest? {
        guard let personId = selectedPersonId else { return nil }
        let now = Self.iso8601.string(from: Date())
        return EndSessionRequest(
            personId: personId,
            startedAt: sessionStartedAt ?? now,
            endedAt: now,
            liveSessionId: liveSessionId,
            liveToken: liveToken,
            topics: topics.map(EndSessionTopic.init(topic:)),
            notesRaw: notesSummary(),
            transcriptRaw: liveTranscriptRaw
        )
    }

    private func mergeTopics(incoming: [Topic]) -> [Topic] {
        incoming.map { next in
            guard let existing = topics.first(where: { $0.id == next.id }) else {
                return next
            }
            if existing.manualOverride && next.checkedBy == "gpt_realtime" {
                return existing
            }
            return next
        }
    }
}
