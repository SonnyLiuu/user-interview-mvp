import Foundation
import UserInterviewNotetakerCore

/// Owns the full lifecycle of a live interview session: starting the session
/// on the backend, monitoring real-time SSE events with a polling fallback,
/// toggling topics, submitting transcript text, and ending the session.
@MainActor
final class SessionOrchestrator {
    private let viewModel: AppViewModel
    private let desktopAPI: DesktopAPIClient
    private let liveAPI: LiveSessionClient

    private var eventTask: Task<Void, Never>?
    private var pollTask: Task<Void, Never>?
    private var lastSSEEventTime = Date.distantPast

    /// Long-lived session for SSE streams. The request timeout (time between
    /// bytes) must exceed the server's 15 s heartbeat interval, and the
    /// resource timeout must not cap the stream's lifetime mid-interview.
    private let sseSession: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 24 * 60 * 60
        return URLSession(configuration: configuration)
    }()

    /// Called when the backend returns `audioCaptureEnabled: true`.
    var onAudioStart: ((_ foundryBaseUrl: String, _ sessionId: String, _ liveToken: String) -> Void)?
    /// Called when the session ends or is cancelled.
    var onAudioStop: (() -> Void)?
    /// Called when the backend returns 401 (e.g. expired token).
    var onUnauthorized: (() -> Void)?

    /// Audio start deferred until user clicks "Start Session".
    private var pendingAudioStart: (foundryBaseUrl: String, sessionId: String, liveToken: String)?

    init(
        viewModel: AppViewModel,
        desktopAPI: DesktopAPIClient = DesktopAPIClient(),
        liveAPI: LiveSessionClient = LiveSessionClient()
    ) {
        self.viewModel = viewModel
        self.desktopAPI = desktopAPI
        self.liveAPI = liveAPI
    }

    deinit {
        sseSession.invalidateAndCancel()
    }

    // MARK: - Starting sessions

    func selectPerson(_ person: DesktopPerson) {
        startSession(personId: person.id, zoomMeetingIdentifier: nil, autoStartMonitoring: false)
    }

    /// Starts a session from a `foundry://` deep link using local desktop audio.
    /// Deep links skip the explicit "Start Session" click.
    func startFromDeepLink(
        personId: String,
        zoomMeetingIdentifier: String?,
        onStarted: (() -> Void)? = nil
    ) {
        startSession(
            personId: personId,
            zoomMeetingIdentifier: zoomMeetingIdentifier,
            autoStartMonitoring: true,
            onStarted: onStarted
        )
    }

    private func startSession(
        personId: String,
        zoomMeetingIdentifier: String?,
        autoStartMonitoring: Bool,
        onStarted: (() -> Void)? = nil
    ) {
        guard let authToken = viewModel.authToken else { return }

        // Kill any stale session before starting a new one.
        onAudioStop?()
        cancelMonitoring()
        pendingAudioStart = nil
        viewModel.realtimeError = nil
        viewModel.audioCaptureError = nil
        viewModel.hasStartedSession = false
        viewModel.message = "Starting live checklist..."

        Task {
            do {
                let response = try await desktopAPI.startLiveSession(
                    apiBaseUrl: viewModel.settings.normalizedApiBaseUrl,
                    authToken: authToken,
                    personId: personId,
                    captureProvider: "desktop_audio",
                    zoomMeetingIdentifier: zoomMeetingIdentifier
                )
                viewModel.applyLiveSession(response)
                viewModel.overlayMode = .main

                // Defer audio until monitoring starts.
                if response.audioCaptureEnabled,
                   let foundryBaseUrl = viewModel.foundryBaseUrl,
                   let sessionId = viewModel.liveSessionId,
                   let liveToken = viewModel.liveToken
                {
                    pendingAudioStart = (foundryBaseUrl, sessionId, liveToken)
                }
                if autoStartMonitoring {
                    startMonitoring()
                }
                onStarted?()
            } catch {
                viewModel.message = error.localizedDescription
                if case DesktopAPIError.unauthorized = error {
                    onUnauthorized?()
                }
            }
        }
    }

    // MARK: - People

    func refreshPeople() {
        guard let authToken = viewModel.authToken else { return }
        Task {
            await viewModel.loadPeople(
                using: desktopAPI,
                apiBaseUrl: viewModel.settings.normalizedApiBaseUrl,
                authToken: authToken
            )
        }
    }

    func returnToPeopleList() {
        let sessionToEnd = liveSessionHandle()
        onAudioStop?()
        cancelMonitoring()
        pendingAudioStart = nil

        viewModel.resetSession()
        viewModel.status = .pickingPerson
        viewModel.overlayMode = .main
        viewModel.message = viewModel.allPeople.isEmpty ? "No people found." : "Pick a person for the call."

        if viewModel.allPeople.isEmpty, let authToken = viewModel.authToken {
            Task {
                await viewModel.loadPeople(
                    using: desktopAPI,
                    apiBaseUrl: viewModel.settings.normalizedApiBaseUrl,
                    authToken: authToken
                )
            }
        }

        if let sessionToEnd {
            Task {
                try? await liveAPI.end(
                    foundryBaseUrl: sessionToEnd.foundryBaseUrl,
                    sessionId: sessionToEnd.sessionId,
                    liveToken: sessionToEnd.liveToken
                )
            }
        }
    }

    // MARK: - Live session actions

    func toggleTopic(_ topic: Topic) {
        viewModel.toggleTopic(topic)
        guard let live = liveSessionHandle(),
              let updated = viewModel.topics.first(where: { $0.id == topic.id })
        else { return }
        Task {
            try? await liveAPI.overrideTopic(
                foundryBaseUrl: live.foundryBaseUrl,
                sessionId: live.sessionId,
                liveToken: live.liveToken,
                topicId: updated.id,
                checked: updated.checked
            )
        }
    }

    func submitTranscript(_ text: String) {
        guard let live = liveSessionHandle() else {
            viewModel.message = "No active live session."
            return
        }
        Task {
            do {
                let response = try await liveAPI.appendTranscriptTurn(
                    foundryBaseUrl: live.foundryBaseUrl,
                    sessionId: live.sessionId,
                    liveToken: live.liveToken,
                    text: text
                )
                viewModel.liveTranscriptRaw = response.transcriptRaw
                viewModel.message = "Transcript text sent."
            } catch {
                viewModel.message = error.localizedDescription
            }
        }
    }

    // MARK: - Ending sessions

    /// Stops audio + monitoring but keeps session alive for review.
    func stopSession() {
        onAudioStop?()
        cancelMonitoring()
        viewModel.hasStartedSession = false
    }

    func prepareReviewSession() {
        stopSession()
        viewModel.message = "Preparing review..."
        guard let live = liveSessionHandle() else {
            viewModel.overlayMode = .review
            viewModel.message = "Review transcript before saving."
            return
        }

        Task {
            let snapshot = try? await liveAPI.snapshot(
                foundryBaseUrl: live.foundryBaseUrl,
                sessionId: live.sessionId,
                liveToken: live.liveToken
            )
            // The session may have changed while the request was in flight.
            guard viewModel.liveSessionId == live.sessionId else { return }
            if let snapshot {
                viewModel.applySnapshot(snapshot)
            }
            viewModel.overlayMode = .review
            viewModel.message = "Review transcript before saving."
        }
    }

    /// Saves the session with the current transcript (potentially edited in review).
    func saveSession(preserveCurrentTranscript: Bool = false) {
        guard let authToken = viewModel.authToken, viewModel.selectedPersonId != nil else {
            viewModel.message = "No active session to save."
            return
        }
        let live = liveSessionHandle()

        Task {
            let preservedTranscript = preserveCurrentTranscript ? viewModel.liveTranscriptRaw : nil
            // 1. Tell the live-session service we're done, then pull its final
            //    snapshot so late auto-checks are not lost.
            if let live {
                try? await liveAPI.end(
                    foundryBaseUrl: live.foundryBaseUrl,
                    sessionId: live.sessionId,
                    liveToken: live.liveToken
                )
                if let snapshot = try? await liveAPI.snapshot(
                    foundryBaseUrl: live.foundryBaseUrl,
                    sessionId: live.sessionId,
                    liveToken: live.liveToken
                ), viewModel.liveSessionId == live.sessionId {
                    viewModel.applySnapshot(snapshot)
                    if let preservedTranscript {
                        viewModel.liveTranscriptRaw = preservedTranscript
                    }
                }
            }

            // 2. Persist through Next.js.
            guard let request = viewModel.endSessionRequest() else {
                viewModel.message = "No active session to save."
                return
            }
            do {
                _ = try await desktopAPI.saveEndSession(
                    apiBaseUrl: viewModel.settings.normalizedApiBaseUrl,
                    authToken: authToken,
                    body: request
                )
                let checklistTopics = viewModel.topics.filter { $0.category != .signal }
                let summary = SavedCallSummary(
                    personName: viewModel.selectedPersonName,
                    coveredTopics: checklistTopics.filter(\.checked).count,
                    totalTopics: checklistTopics.count
                )
                viewModel.resetSession()
                viewModel.savedCallSummary = summary
                viewModel.overlayMode = .saveConfirmation
            } catch {
                viewModel.message = error.localizedDescription
            }
        }
    }

    func endSession() {
        stopSession()
        saveSession()
    }

    func cancelMonitoring() {
        eventTask?.cancel()
        pollTask?.cancel()
        eventTask = nil
        pollTask = nil
    }

    private func liveSessionHandle() -> (foundryBaseUrl: String, sessionId: String, liveToken: String)? {
        guard let foundryBaseUrl = viewModel.foundryBaseUrl,
              let sessionId = viewModel.liveSessionId,
              let liveToken = viewModel.liveToken
        else { return nil }
        return (foundryBaseUrl, sessionId, liveToken)
    }

    // MARK: - Live monitoring

    func startMonitoring() {
        // Start audio capture if the backend enabled it.
        if let pending = pendingAudioStart {
            pendingAudioStart = nil
            onAudioStart?(pending.foundryBaseUrl, pending.sessionId, pending.liveToken)
        }
        cancelMonitoring()
        lastSSEEventTime = Date()

        guard let live = liveSessionHandle() else { return }

        eventTask = Task { [weak self] in
            await self?.runEventLoop(
                foundryBaseUrl: live.foundryBaseUrl, sessionId: live.sessionId, liveToken: live.liveToken
            )
        }
        pollTask = Task { [weak self] in
            await self?.runPollLoop(
                foundryBaseUrl: live.foundryBaseUrl, sessionId: live.sessionId, liveToken: live.liveToken
            )
        }
    }

    private func runEventLoop(foundryBaseUrl: String, sessionId: String, liveToken: String) async {
        var reconnectDelay: TimeInterval = 1
        while !Task.isCancelled {
            do {
                let request = try liveAPI.events(
                    foundryBaseUrl: foundryBaseUrl, sessionId: sessionId, liveToken: liveToken
                )
                let (bytes, response) = try await sseSession.bytes(for: request)
                // bytes(for:) does not throw for HTTP error statuses — an
                // ended/unknown session would otherwise parse as an empty
                // stream and reconnect in a tight loop.
                if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                    throw DesktopAPIError.httpStatus(http.statusCode, "Live event stream returned status \(http.statusCode).")
                }
                // Assemble events from raw bytes — AsyncLineSequence drops the
                // blank lines that delimit SSE events, so `bytes.lines` never
                // yields a complete event.
                var assembler = SSEStreamAssembler()
                for try await byte in bytes {
                    if byte == UInt8(ascii: "\n") {
                        lastSSEEventTime = Date()
                        reconnectDelay = 1
                    }
                    if let event = assembler.feed(byte) {
                        apply(event, sessionId: sessionId)
                    }
                }
            } catch is CancellationError {
                return
            } catch {
                if (error as? URLError)?.code == .cancelled { return }
                // Only report errors for the session this task was created for.
                if viewModel.liveSessionId == sessionId {
                    viewModel.realtimeError = error.localizedDescription
                }
            }
            // Back off before reconnecting — even after a clean close, so an
            // ended or missing session cannot produce a tight reconnect loop.
            try? await Task.sleep(nanoseconds: UInt64(reconnectDelay * 1_000_000_000))
            reconnectDelay = min(reconnectDelay * 2, 30)
        }
    }

    private func runPollLoop(foundryBaseUrl: String, sessionId: String, liveToken: String) async {
        while !Task.isCancelled {
            let sseSilence = Date().timeIntervalSince(lastSSEEventTime)
            if sseSilence > 10 {
                do {
                    let snapshot = try await liveAPI.snapshot(
                        foundryBaseUrl: foundryBaseUrl, sessionId: sessionId, liveToken: liveToken
                    )
                    // The session may have changed while the request was in flight.
                    guard viewModel.liveSessionId == sessionId else { return }
                    viewModel.applySnapshot(snapshot)
                } catch {
                    // Only report errors for the session this task was created for.
                    if viewModel.liveSessionId == sessionId {
                        viewModel.realtimeError = error.localizedDescription
                    }
                }
            }
            try? await Task.sleep(nanoseconds: 3_000_000_000)
        }
    }

    private func apply(_ event: LiveSessionEvent, sessionId: String) {
        // Never apply events from a superseded session's stream.
        guard viewModel.liveSessionId == sessionId else { return }
        lastSSEEventTime = Date()

        if event.type == "heartbeat" { return }
        guard let envelope = EventDecoder.decode(event) else { return }

        switch event.type {
        case "session_snapshot":
            if let topics = envelope.topics {
                let snapshot = LiveSessionResponse(
                    sessionId: envelope.sessionId ?? viewModel.liveSessionId ?? "",
                    personId: viewModel.selectedPersonId ?? "",
                    personName: viewModel.selectedPersonName,
                    status: "active",
                    captureProvider: viewModel.captureProvider,
                    audioCaptureEnabled: false,
                    zoomMeetingIdentifier: nil,
                    liveToken: viewModel.liveToken,
                    foundryBaseUrl: viewModel.foundryBaseUrl,
                    topics: topics,
                    startedAt: viewModel.sessionStartedAt ?? "",
                    endedAt: nil,
                    realtimeStatus: envelope.realtimeStatus,
                    realtimeError: envelope.realtimeError,
                    transcriptTurns: nil,
                    transcriptRaw: envelope.transcriptRaw
                )
                viewModel.applySnapshot(snapshot)
            }
        case "topic_checked", "topic_updated":
            if let topic = envelope.topic {
                viewModel.applyTopic(topic)
            }
        case "transcript_turn":
            if let transcriptRaw = envelope.transcriptRaw {
                viewModel.liveTranscriptRaw = transcriptRaw
            }
        case "realtime_status":
            viewModel.realtimeStatus = envelope.status ?? envelope.message ?? viewModel.realtimeStatus
        case "realtime_error":
            viewModel.realtimeError = envelope.message ?? envelope.realtimeError
        case "session_closed":
            // The server ended the session (possibly from another surface).
            // Streaming and audio are pointless now, but keep local state so
            // the user can still review and save.
            cancelMonitoring()
            onAudioStop?()
            viewModel.realtimeStatus = "ended"
            viewModel.message = "Live session ended."
        default:
            break
        }
    }
}
