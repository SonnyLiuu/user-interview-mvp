import AppKit
import Foundation
import UserInterviewNotetakerCore

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let viewModel = AppViewModel()
    private let settingsStore = SettingsStore()
    private let tokenStore = KeychainTokenStore()
    private let desktopAPI = DesktopAPIClient()
    private let liveAPI = LiveSessionClient()
    private let sseParser = SSEParser()
    private let audioCapture = AudioCaptureManager()
    private let systemAudio = SystemAudioCapture()

    private var statusItem: NSStatusItem?
    private var overlayWindow: OverlayWindowController?
    private var eventTask: Task<Void, Never>?
    private var pollTask: Task<Void, Never>?
    private var audioTask: Task<Void, Never>?
    private var pendingDeepLink: String?
    private var authReturnMode: OverlayMode = .main
    private var lastSSEEventTime = Date.distantPast
    private var audioSocket: LiveAudioWebSocket?

    func applicationDidFinishLaunching(_ notification: Notification) {
        viewModel.settings = settingsStore.load()
        viewModel.authToken = tokenStore.load()
        registerURLHandler()
        setupStatusItem()
        setupOverlay()
        overlayWindow?.show()
    }

    func applicationWillTerminate(_ notification: Notification) {
        overlayWindow?.persistPosition()
        eventTask?.cancel()
        pollTask?.cancel()
        audioTask?.cancel()
        stopAudioCapture()
    }

    // MARK: URL Handling

    /// Registers for `foundry://` deep links while the app is already running.
    /// Uses the legacy Carbon Apple Event API (deprecated in macOS 14).
    /// Cold-launch URLs are handled by `application(_:open:)` below.
    /// TODO(v2): Drop `NSAppleEventManager` when the minimum target moves to macOS 14+.
    private func registerURLHandler() {
        NSAppleEventManager.shared().setEventHandler(
            self,
            andSelector: #selector(handleGetURLEvent(_:withReplyEvent:)),
            forEventClass: AEEventClass(kInternetEventClass),
            andEventID: AEEventID(kAEGetURL)
        )
    }

    private func setupStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.title = "UI"

        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Show Notetaker", action: #selector(showOverlay), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Start Session", action: #selector(startSessionFromMenu), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Paste Transcript...", action: #selector(openTranscriptFallback), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Settings...", action: #selector(openSettings), keyEquivalent: ","))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "Quit", action: #selector(quit), keyEquivalent: "q"))
        item.menu = menu
        statusItem = item
    }

    private func setupOverlay() {
        overlayWindow = OverlayWindowController(
            viewModel: viewModel,
            settingsStore: settingsStore,
            onStart: { [weak self] in self?.startSessionFromMenu() },
            onEnd: { [weak self] in self?.endSession() },
            onSettings: { [weak self] in self?.openSettings() },
            onSaveSettings: { [weak self] in self?.saveSettings() },
            onSignIn: { [weak self] in self?.openAuth() },
            onClearAuth: { [weak self] in self?.clearAuth() },
            onBackFromAuxiliary: { [weak self] in self?.closeAuxiliaryView() },
            onDevSignIn: { [weak self] email in self?.signInWithDevToken(email: email) },
            onAuthToken: { [weak self] token in self?.finishAuth(token) },
            onAuthError: { [weak self] message in self?.viewModel.message = message },
            onSubmitTranscript: { [weak self] text in self?.appendTranscriptText(text) },
            onToggleTopic: { [weak self] topic in self?.toggleTopic(topic) },
            onSelectPerson: { [weak self] person in self?.selectPerson(person) },
            onRefreshPeople: { [weak self] in self?.refreshPeople() },
            onBackFromPicker: { [weak self] in self?.dismissPicker() }
        )
    }

    @objc private func handleGetURLEvent(_ event: NSAppleEventDescriptor, withReplyEvent replyEvent: NSAppleEventDescriptor) {
        guard let raw = event.paramDescriptor(forKeyword: keyDirectObject)?.stringValue else {
            return
        }
        handleDeepLink(raw)
    }

    @objc private func showOverlay() {
        overlayWindow?.show()
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func startSessionFromMenu() {
        showOverlay()
        viewModel.overlayMode = .main
        guard viewModel.authToken != nil else {
            viewModel.message = "Sign in before starting a session."
            openAuth()
            return
        }
        openPicker()
    }

    private func openPicker() {
        viewModel.status = .pickingPerson
        viewModel.resetPicker()
        guard let authToken = viewModel.authToken else { return }
        Task {
            await viewModel.loadPeople(
                apiBaseUrl: viewModel.settings.normalizedApiBaseUrl,
                authToken: authToken
            )
        }
    }

    private func selectPerson(_ person: DesktopPerson) {
        viewModel.message = "Starting live checklist..."
        guard let authToken = viewModel.authToken else { return }
        Task {
            do {
                // Start live session with desktop audio capture.
                let response = try await desktopAPI.startLiveSession(
                    apiBaseUrl: viewModel.settings.normalizedApiBaseUrl,
                    authToken: authToken,
                    personId: person.id,
                    captureProvider: "desktop_audio",
                    zoomMeetingIdentifier: nil
                )
                viewModel.applyLiveSession(response)
                viewModel.overlayMode = .main
                startLiveMonitoring()

                // Start audio capture if the backend enabled it.
                if response.audioCaptureEnabled {
                    startAudioCapture(
                        foundryBaseUrl: viewModel.foundryBaseUrl,
                        sessionId: response.sessionId,
                        liveToken: response.liveToken
                    )
                }
            } catch {
                viewModel.message = error.localizedDescription
                if case DesktopAPIError.unauthorized = error {
                    clearAuth()
                    openAuth()
                }
            }
        }
    }

    private func refreshPeople() {
        guard let authToken = viewModel.authToken else { return }
        Task {
            await viewModel.loadPeople(
                apiBaseUrl: viewModel.settings.normalizedApiBaseUrl,
                authToken: authToken
            )
        }
    }

    private func dismissPicker() {
        viewModel.resetPicker()
        viewModel.status = .idle
        viewModel.message = "Ready."
    }

    @objc private func openSettings() {
        viewModel.overlayMode = .settings
        showOverlay()
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func openTranscriptFallback() {
        guard viewModel.isActive else {
            viewModel.message = "Start a live session before adding transcript text."
            showOverlay()
            return
        }
        viewModel.overlayMode = .transcript
        showOverlay()
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }

    private func openAuth() {
        authReturnMode = viewModel.overlayMode == .settings ? .settings : .main
        viewModel.overlayMode = .signIn
        showOverlay()
        NSApp.activate(ignoringOtherApps: true)
    }

    private func finishAuth(_ token: String) {
        do {
            try tokenStore.save(token)
            viewModel.authToken = token
            viewModel.message = "Signed in."
            if let pendingDeepLink {
                self.pendingDeepLink = nil
                viewModel.overlayMode = .main
                handleDeepLink(pendingDeepLink)
            } else {
                viewModel.overlayMode = authReturnMode
            }
        } catch {
            viewModel.message = "Could not save auth token."
        }
    }

    private func signInWithDevToken(email: String) {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            viewModel.message = "Email is required."
            return
        }
        viewModel.message = "Connecting to local backend..."
        Task {
            do {
                let response = try await desktopAPI.devAuthToken(
                    apiBaseUrl: viewModel.settings.normalizedApiBaseUrl,
                    email: trimmed
                )
                finishAuth(response.token)
            } catch {
                viewModel.message = error.localizedDescription
            }
        }
    }

    private func clearAuth() {
        tokenStore.clear()
        viewModel.authToken = nil
        viewModel.message = "Auth cleared."
    }

    private func saveSettings() {
        try? settingsStore.save(viewModel.settings)
        viewModel.message = "Settings saved."
    }

    private func closeAuxiliaryView() {
        viewModel.overlayMode = .main
    }

    private func handleDeepLink(_ raw: String) {
        showOverlay()
        guard let link = DeepLinkParser.parse(raw),
              link.action == "call/start",
              let personId = link.personId,
              link.token != nil
        else {
            viewModel.message = "Ignoring malformed foundry link."
            return
        }
        viewModel.overlayMode = .main

        guard let authToken = viewModel.authToken else {
            pendingDeepLink = raw
            viewModel.message = "Sign in to start the call."
            openAuth()
            return
        }

        Task {
            do {
                viewModel.message = "Starting live checklist..."
                let response = try await desktopAPI.startLiveSession(
                    apiBaseUrl: viewModel.settings.normalizedApiBaseUrl,
                    authToken: authToken,
                    personId: personId,
                    captureProvider: "zoom_rtms",
                    zoomMeetingIdentifier: link.zoomMeetingIdentifier
                )
                viewModel.applyLiveSession(response)
                viewModel.overlayMode = .main
                startLiveMonitoring()
            } catch {
                viewModel.message = error.localizedDescription
                if case DesktopAPIError.unauthorized = error {
                    clearAuth()
                    pendingDeepLink = raw
                    openAuth()
                }
            }
        }
    }

    private func startLiveMonitoring() {
        eventTask?.cancel()
        pollTask?.cancel()
        lastSSEEventTime = Date()

        guard let foundryBaseUrl = viewModel.foundryBaseUrl,
              let sessionId = viewModel.liveSessionId,
              let liveToken = viewModel.liveToken
        else {
            return
        }

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
                if !(error is CancellationError) {
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
                    let snapshot = try await liveAPI.snapshot(foundryBaseUrl: foundryBaseUrl, sessionId: sessionId, liveToken: liveToken)
                    viewModel.applySnapshot(snapshot)
                } catch {
                    viewModel.realtimeError = error.localizedDescription
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

    private func toggleTopic(_ topic: Topic) {
        viewModel.toggleTopic(topic)
        guard let foundryBaseUrl = viewModel.foundryBaseUrl,
              let sessionId = viewModel.liveSessionId,
              let liveToken = viewModel.liveToken,
              let updated = viewModel.topics.first(where: { $0.id == topic.id })
        else {
            return
        }
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

    private func appendTranscriptText(_ text: String) {
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

    // MARK: - Audio Capture (standalone desktop recording)

    private func startAudioCapture(
        foundryBaseUrl: String?,
        sessionId: String?,
        liveToken: String?
    ) {
        guard let foundryBaseUrl,
              let sessionId,
              let liveToken
        else {
            viewModel.audioCaptureError = "Missing session info for audio capture."
            return
        }

        audioTask?.cancel()
        stopAudioCapture()

        audioTask = Task { [weak self] in
            guard let self else { return }

            // Build WebSocket URL: wss://foundry-base/v1/desktop/live-sessions/{id}/audio?token=...
            let wsBase = foundryBaseUrl
                .replacingOccurrences(of: "https://", with: "wss://")
                .replacingOccurrences(of: "http://", with: "ws://")
            let wsURLString = "\(wsBase)/v1/desktop/live-sessions/\(sessionId)/audio?token=\(liveToken)"

            guard let wsURL = URL(string: wsURLString) else {
                await MainActor.run {
                    self.viewModel.audioCaptureError = "Invalid audio WebSocket URL."
                }
                return
            }

            let socket = LiveAudioWebSocket(url: wsURL)
            self.audioSocket = socket

            socket.onStatusChange = { [weak self] status in
                Task { @MainActor in
                    switch status {
                    case .connecting:
                        self?.viewModel.message = "Connecting audio..."
                    case .connected:
                        self?.viewModel.isCapturingAudio = true
                        self?.viewModel.message = "Audio streaming live."
                    case .disconnected(let error):
                        self?.viewModel.isCapturingAudio = false
                        if let error {
                            self?.viewModel.audioCaptureError = error.localizedDescription
                        }
                    }
                }
            }

            socket.connect()

            // Set up microphone capture callback (source 0x01).
            self.audioCapture.onAudioBuffer = { [weak socket] pcmData in
                socket?.sendAudio(pcmData: pcmData, source: 0x01)
            }

            // Set up system audio (loopback) capture callback (source 0x02).
            self.systemAudio.onAudioBuffer = { [weak socket] pcmData in
                socket?.sendAudio(pcmData: pcmData, source: 0x02)
            }

            do {
                // Start both captures in parallel.
                async let micResult: () = self.audioCapture.start()
                async let sysResult: () = self.systemAudio.start()
                try await micResult
                try await sysResult
            } catch {
                await MainActor.run {
                    self.viewModel.audioCaptureError = error.localizedDescription
                }
                socket.disconnect()
            }
        }
    }

    private func stopAudioCapture() {
        audioCapture.onAudioBuffer = nil
        audioCapture.stop()
        systemAudio.onAudioBuffer = nil
        systemAudio.stop()
        audioSocket?.disconnect()
        audioSocket = nil
        audioTask?.cancel()
        audioTask = nil
        viewModel.isCapturingAudio = false
    }

    private func endSession() {
        // Stop audio capture before saving.
        stopAudioCapture()

        // Capture pre-snapshot state as a safety-net fallback.
        guard let authToken = viewModel.authToken,
              let initialRequest = viewModel.endSessionRequest()
        else {
            viewModel.message = "No active session to save."
            return
        }

        eventTask?.cancel()
        pollTask?.cancel()

        Task {
            // 1. Tell the live-session service we're done.
            if let foundryBaseUrl = viewModel.foundryBaseUrl,
               let sessionId = viewModel.liveSessionId,
               let liveToken = viewModel.liveToken {
                try? await liveAPI.end(foundryBaseUrl: foundryBaseUrl, sessionId: sessionId, liveToken: liveToken)
                // 2. Pull the final server-side topic state so manual overrides merge in.
                if let snapshot = try? await liveAPI.snapshot(foundryBaseUrl: foundryBaseUrl, sessionId: sessionId, liveToken: liveToken) {
                    viewModel.applySnapshot(snapshot)
                }
            }

            // 3. Save the merged state.  viewModel.endSessionRequest() now reflects
            //    the latest snapshot; fall back to the pre-snapshot capture if the
            //    viewModel was somehow cleared.
            do {
                _ = try await desktopAPI.saveEndSession(
                    apiBaseUrl: viewModel.settings.normalizedApiBaseUrl,
                    authToken: authToken,
                    body: viewModel.endSessionRequest() ?? initialRequest
                )
                viewModel.resetSession()
                viewModel.overlayMode = .main
                viewModel.message = "Call saved."
            } catch {
                viewModel.message = error.localizedDescription
            }
        }
    }

    // Handle URLs when app is launched cold via a foundry:// link.
    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls {
            handleDeepLink(url.absoluteString)
        }
    }
}
