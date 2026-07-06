import Foundation
import Combine
import UserInterviewNotetakerCore

enum OverlayMode {
    case onboarding
    case main
    case settings
    case signIn
    case transcript
    case review
    case saveConfirmation
}

/// Snapshot of a just-saved call, shown on the confirmation screen after the
/// session state has been reset.
struct SavedCallSummary: Equatable {
    var personName: String
    var coveredTopics: Int
    var totalTopics: Int
}

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
    @Published var captureProvider = "desktop_audio"
    @Published var realtimeStatus = "idle"
    @Published var realtimeError: String?
    @Published var liveTranscriptRaw = ""
    @Published var topics: [Topic] = []
    @Published var message = "Ready."
    @Published var overlayMode: OverlayMode = .main
    @Published var savedCallSummary: SavedCallSummary?

    // People picker state
    @Published var allPeople: [DesktopPerson] = []
    @Published var selectedStartup: String?  // startup project filter ("All Startups" = nil)
    @Published var selectedProject: String?  // outreach project filter ("All Projects" = nil)
    @Published var isLoadingPeople = false

    // Session lifecycle
    @Published var hasStartedSession = false

    // Audio capture state
    @Published var isCapturingAudio = false
    @Published var audioCaptureError: String?
    @Published var systemAudioCaptureWarning: String?

    var isActive: Bool {
        status == .active
    }

    /// Unique startup projects from the loaded people list, sorted alphabetically.
    var availableStartups: [String] {
        let startups = allPeople.compactMap { person -> String? in
            guard let startup = person.startupName?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !startup.isEmpty else { return nil }
            return startup
        }
        return Array(Set(startups)).sorted()
    }

    /// Unique outreach project names from the current startup selection, sorted alphabetically.
    var availableProjects: [String] {
        let people = selectedStartup == nil
            ? allPeople
            : allPeople.filter { $0.startupName == selectedStartup }
        let projectNames = people.compactMap { person -> String? in
            guard let name = person.projectName?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !name.isEmpty else { return nil }
            return name
        }
        return Array(Set(projectNames)).sorted()
    }

    /// People filtered by the selected startup and/or project.
    var filteredPeople: [DesktopPerson] {
        allPeople.filter { person in
            if let startup = selectedStartup {
                guard person.startupName == startup else { return false }
            }
            if let project = selectedProject {
                guard person.projectName == project else { return false }
            }
            return true
        }
    }

    func loadPeople(using client: DesktopAPIClient, apiBaseUrl: String, authToken: String) async {
        isLoadingPeople = true
        message = "Loading people..."
        do {
            allPeople = try await client.people(apiBaseUrl: apiBaseUrl, authToken: authToken)
            message = allPeople.isEmpty ? "No people found." : "Pick a person for the call."
        } catch {
            message = error.localizedDescription
        }
        isLoadingPeople = false
    }

    func resetPicker() {
        allPeople = []
        selectedStartup = nil
        selectedProject = nil
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
        topics = mergeTopics(existing: topics, incoming: response.topics)
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
        captureProvider = "desktop_audio"
        realtimeStatus = "idle"
        realtimeError = nil
        liveTranscriptRaw = ""
        topics = []
        isCapturingAudio = false
        audioCaptureError = nil
        systemAudioCaptureWarning = nil
        hasStartedSession = false
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
}
