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
    private let sseParser: SSEParser

    private var eventTask: Task<Void, Never>?
    private var pollTask: Task<Void, Never>?
    private var lastSSEEventTime = Date.distantPast

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
        liveAPI: LiveSessionClient = LiveSessionClient(),
        sseParser: SSEParser = SSEParser()
    ) {
        self.viewModel = viewModel
        self.desktopAPI = desktopAPI
        self.liveAPI = liveAPI
        self.sseParser = sseParser
    }

    // MARK: - Public API

    func selectPerson(_ person: DesktopPerson) {
        // Kill any stale session before starting a new one.
        onAudioStop?()
        cancelMonitoring()
        pendingAudioStart = nil
        viewModel.realtimeError = nil
        viewModel.audioCaptureError = nil
        viewModel.hasStartedSession = false

        viewModel.message = "Starting live checklist..."
        guard let authToken = viewModel.authToken else { return }
        Task {
            do {
                let response = try await desktopAPI.startLiveSession(
                    apiBaseUrl: viewModel.settings.normalizedApiBaseUrl,
                    authToken: authToken,
                    personId: person.id,
                    captureProvider: "desktop_audio",
                    zoomMeetingIdentifier: nil
                )
                viewModel.applyLiveSession(response)
                viewModel.overlayMode = .main

                // Defer audio until user clicks "Start Session".
                if response.audioCaptureEnabled,
                   let foundryBaseUrl = viewModel.foundryBaseUrl,
                   let sessionId = viewModel.liveSessionId,
                   let liveToken = viewModel.liveToken
                {
                    pendingAudioStart = (foundryBaseUrl, sessionId, liveToken)
                }
            } catch {
                viewModel.message = error.localizedDescription
                if case DesktopAPIError.unauthorized = error {
                    onUnauthorized?()
                }
            }
        }
    }

    /// Starts a session from a `foundry://` deep link (Zoom RTMS path).
    func startFromDeepLink(personId: String, zoomMeetingIdentifier: String?) {
        guard let authToken = viewModel.authToken else { return }
        viewModel.message = "Starting live checklist..."
        Task {
            do {
                let response = try await desktopAPI.startLiveSession(
                    apiBaseUrl: viewModel.settings.normalizedApiBaseUrl,
                    authToken: authToken,
                    personId: personId,
                    captureProvider: "zoom_rtms",
                    zoomMeetingIdentifier: zoomMeetingIdentifier
                )
                viewModel.applyLiveSession(response)
                viewModel.overlayMode = .main
                startMonitoring()  // deep links auto-start
            } catch {
                viewModel.message = error.localizedDescription
                if case DesktopAPIError.unauthorized = error {
                    onUnauthorized?()
                }
            }
        }
    }

    func refreshPeople() {
        guard let authToken = viewModel.authToken else { return }
        Task {
            await viewModel.loadPeople(
                apiBaseUrl: viewModel.settings.normalizedApiBaseUrl,
                authToken: authToken
            )
        }
    }

    func toggleTopic(_ topic: Topic) {
        viewModel.toggleTopic(topic)
        guard let foundryBaseUrl = viewModel.foundryBaseUrl,
              let sessionId = viewModel.liveSessionId,
              let liveToken = viewModel.liveToken,
              let updated = viewModel.topics.first(where: { $0.id == topic.id })
        else { return }
        Task {
            try? await liveAPI.overrideTopic(
                foundryBaseUrl: foundryBaseUrl,
                sessionId: sessionId,
                liveToken: liveToken,
                topicId: updated.id,
                checked: updated.checked
            )
        }
    }

    func submitTranscript(_ text: String) {
        guard let foundryBaseUrl = viewModel.foundryBaseUrl,
              let sessionId = viewModel.liveSessionId,
              let liveToken = viewModel.liveToken
        else {
            viewModel.message = "No active live session."
            return
        }
        Task {
            do {
                try await liveAPI.appendTranscriptTurn(
                    foundryBaseUrl: foundryBaseUrl,
                    sessionId: sessionId,
                    liveToken: liveToken,
                    text: text
                )
                if viewModel.liveTranscriptRaw.isEmpty {
                    viewModel.liveTranscriptRaw = "Speaker: \(text)"
                } else {
                    viewModel.liveTranscriptRaw += "\nSpeaker: \(text)"
                }
                viewModel.message = "Transcript text sent."
            } catch {
                viewModel.message = error.localizedDescription
            }
        }
    }

    /// Stops audio + monitoring but keeps session alive for review.
    func stopSession() {
        onAudioStop?()
        cancelMonitoring()
        viewModel.hasStartedSession = false
    }

    /// Saves the session with the current transcript (potentially edited in review).
    func saveSession() {
        guard let authToken = viewModel.authToken,
              let request = viewModel.endSessionRequest()
        else {
            viewModel.message = "No active session to save."
            return
        }

        Task {
            // 1. Tell live-session service we're done.
            if let foundryBaseUrl = viewModel.foundryBaseUrl,
               let sessionId = viewModel.liveSessionId,
               let liveToken = viewModel.liveToken
            {
                try? await liveAPI.end(foundryBaseUrl: foundryBaseUrl, sessionId: sessionId, liveToken: liveToken)
                if let snapshot = try? await liveAPI.snapshot(
                    foundryBaseUrl: foundryBaseUrl, sessionId: sessionId, liveToken: liveToken
                ) {
                    viewModel.applySnapshot(snapshot)
                }
            }

            do {
                _ = try await desktopAPI.saveEndSession(
                    apiBaseUrl: viewModel.settings.normalizedApiBaseUrl,
                    authToken: authToken,
                    body: viewModel.endSessionRequest() ?? request
                )
                viewModel.resetSession()
                viewModel.overlayMode = .main
                viewModel.message = "Call saved."
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

    // MARK: - Private: live monitoring

    func startMonitoring() {
        // Start audio capture if the backend enabled it.
        if let pending = pendingAudioStart {
            pendingAudioStart = nil
            onAudioStart?(pending.foundryBaseUrl, pending.sessionId, pending.liveToken)
        }
        cancelMonitoring()
        lastSSEEventTime = Date()

        guard let foundryBaseUrl = viewModel.foundryBaseUrl,
              let sessionId = viewModel.liveSessionId,
              let liveToken = viewModel.liveToken
        else { return }

        eventTask = Task { [weak self] in
            await self?.runEventLoop(foundryBaseUrl: foundryBaseUrl, sessionId: sessionId, liveToken: liveToken)
        }
        pollTask = Task { [weak self] in
            await self?.runPollLoop(foundryBaseUrl: foundryBaseUrl, sessionId: sessionId, liveToken: liveToken)
        }
    }

    private func runEventLoop(foundryBaseUrl: String, sessionId: String, liveToken: String) async {
        let sseSession = URLSession(configuration: {
            let cfg = URLSessionConfiguration.default
            cfg.timeoutIntervalForRequest = 10
            cfg.timeoutIntervalForResource = 120
            return cfg
        }())

        while !Task.isCancelled {
            do {
                let request = try liveAPI.events(foundryBaseUrl: foundryBaseUrl, sessionId: sessionId, liveToken: liveToken)
                let (bytes, _) = try await sseSession.bytes(for: request)
                var block = ""
                let streamTask = Task { [weak self] in
                    for try await line in bytes.lines {
                        self?.lastSSEEventTime = Date()
                        if line.isEmpty {
                            if let event = self?.sseParser.parse(block) {
                                self?.apply(event)
                            }
                            block = ""
                        } else {
                            block += line + "\n"
                        }
                    }
                }
                await withTaskCancellationHandler {
                    _ = await streamTask.result
                } onCancel: {
                    streamTask.cancel()
                }
            } catch {
                // Only report errors for the session this task was created for.
                if !(error is CancellationError), viewModel.liveSessionId == sessionId {
                    viewModel.realtimeError = error.localizedDescription
                }
                try? await Task.sleep(nanoseconds: 2_000_000_000)
            }
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

    private func apply(_ event: LiveSessionEvent) {
        lastSSEEventTime = Date()
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
        case "realtime_status":
            viewModel.realtimeStatus = envelope.status ?? envelope.message ?? viewModel.realtimeStatus
        case "realtime_error":
            viewModel.realtimeError = envelope.message ?? envelope.realtimeError
        default:
            break
        }
    }
}
