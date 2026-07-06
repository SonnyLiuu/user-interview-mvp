import Foundation
import UserInterviewNotetakerCore

private final class OneShotFlag: @unchecked Sendable {
    private let lock = NSLock()
    private var hasFired = false

    func take() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if hasFired {
            return false
        }
        hasFired = true
        return true
    }
}

/// Thread-safe holder for the current WebSocket so audio-capture callbacks
/// (which run on background queues) always send to the live socket, including
/// after a reconnect swaps it out.
private final class AudioSocketRef: @unchecked Sendable {
    private let lock = NSLock()
    private var _socket: LiveAudioWebSocket?

    var socket: LiveAudioWebSocket? {
        get { lock.withLock { _socket } }
        set { lock.withLock { _socket = newValue } }
    }
}

/// Manages the full lifecycle of desktop audio capture: WebSocket connection,
/// microphone input, and system audio loopback. Call `start(...)` when a
/// live session begins and `stop()` when it ends. A dropped connection is
/// retried with capped backoff until `stop()` — one network blip must not
/// kill audio for the rest of an interview.
@MainActor
final class AudioCaptureCoordinator {
    private let viewModel: AppViewModel
    private let audioCapture: AudioCaptureManager
    private let systemAudio: SystemAudioCapture
    private let liveAPI: LiveSessionClient

    private var startTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?
    private var reconnectAttempt = 0
    private let socketRef = AudioSocketRef()
    /// WebSocket request for the current session's audio endpoint; nil when stopped.
    private var activeRequest: URLRequest?

    init(
        viewModel: AppViewModel,
        audioCapture: AudioCaptureManager = AudioCaptureManager(),
        systemAudio: SystemAudioCapture = SystemAudioCapture(),
        liveAPI: LiveSessionClient = LiveSessionClient()
    ) {
        self.viewModel = viewModel
        self.audioCapture = audioCapture
        self.systemAudio = systemAudio
        self.liveAPI = liveAPI
    }

    /// Opens a WebSocket to the FastAPI audio endpoint and starts both
    /// microphone and system-audio (loopback) capture.
    func start(foundryBaseUrl: String, sessionId: String, liveToken: String) {
        guard !foundryBaseUrl.isEmpty, !sessionId.isEmpty, !liveToken.isEmpty else {
            viewModel.audioCaptureError = "Missing session info for audio capture."
            return
        }

        stop()
        viewModel.audioCaptureError = nil
        viewModel.systemAudioCaptureWarning = nil

        let request: URLRequest
        do {
            request = try liveAPI.audioStreamRequest(
                foundryBaseUrl: foundryBaseUrl, sessionId: sessionId, liveToken: liveToken
            )
        } catch {
            viewModel.audioCaptureError = "Invalid audio WebSocket URL."
            return
        }
        activeRequest = request

        startTask = Task { [weak self] in
            await self?.runStartSequence()
        }
    }

    func stop() {
        startTask?.cancel()
        startTask = nil
        reconnectTask?.cancel()
        reconnectTask = nil
        reconnectAttempt = 0
        activeRequest = nil

        audioCapture.onAudioBuffer = nil
        audioCapture.stop()
        systemAudio.onAudioBuffer = nil
        systemAudio.onStreamStopped = nil
        systemAudio.stop()

        let socket = socketRef.socket
        socketRef.socket = nil
        socket?.disconnect()

        viewModel.isCapturingAudio = false
        viewModel.systemAudioCaptureWarning = nil
    }

    // MARK: - Startup

    private func runStartSequence() async {
        // stop() may have raced in before this task body ran.
        guard !Task.isCancelled else { return }
        installCaptureHandlers()

        // Connect the socket. A failure here surfaces through the status
        // handler and enters the reconnect loop; capture still starts so
        // audio flows as soon as a connection is established.
        _ = await makeAndConnectSocket()
        guard !Task.isCancelled else {
            // stop() raced the connect; tear down whatever just came up.
            let socket = socketRef.socket
            socketRef.socket = nil
            socket?.disconnect()
            return
        }

        // Microphone capture is required.
        do {
            try await audioCapture.start()
        } catch {
            let message = error.localizedDescription
            if !Task.isCancelled {
                stop()
                viewModel.audioCaptureError = message
            }
            return
        }
        guard !Task.isCancelled else {
            // stop() raced the mic startup; the engine may have started after
            // stop() already ran.
            audioCapture.stop()
            return
        }

        // System audio loopback is best-effort — needs Screen Recording permission.
        do {
            try await systemAudio.start()
        } catch {
            if !Task.isCancelled {
                viewModel.systemAudioCaptureWarning = "Mic recording only. System audio is unavailable."
                print("[audio] system audio capture not available: \(error.localizedDescription)")
            }
            return
        }
        if Task.isCancelled {
            systemAudio.stop()
        }
    }

    private func installCaptureHandlers() {
        // Route frames through socketRef so reconnects swap sockets without
        // touching the capture pipeline. Frames are dropped while disconnected.
        let socketRef = self.socketRef

        let loggedFirstMicBuffer = OneShotFlag()
        audioCapture.onAudioBuffer = { pcmData in
            if loggedFirstMicBuffer.take() {
                print("[audio] first mic buffer bytes=\(pcmData.count)")
            }
            socketRef.socket?.sendAudio(pcmData: pcmData, source: 0x01)
        }

        let loggedFirstSystemBuffer = OneShotFlag()
        systemAudio.onAudioBuffer = { pcmData in
            if loggedFirstSystemBuffer.take() {
                print("[audio] first system buffer bytes=\(pcmData.count)")
            }
            socketRef.socket?.sendAudio(pcmData: pcmData, source: 0x02)
        }

        systemAudio.onStreamStopped = { [weak self] error in
            Task { @MainActor in
                guard let self, self.activeRequest != nil else { return }
                self.viewModel.systemAudioCaptureWarning = "System audio stopped. Mic recording only."
                if let error {
                    print("[audio] system audio stream stopped: \(error.localizedDescription)")
                }
            }
        }
    }

    // MARK: - Socket lifecycle

    /// Creates a fresh socket for the active session and connects it.
    /// Failures surface via the status handler. Returns whether the
    /// connection was established.
    private func makeAndConnectSocket() async -> Bool {
        guard let request = activeRequest else { return false }
        let socket = LiveAudioWebSocket(request: request)
        socket.onStatusChange = { [weak self, weak socket] status in
            Task { @MainActor in
                guard let self, let socket else { return }
                self.handleSocketStatus(status, from: socket)
            }
        }
        socketRef.socket = socket
        do {
            try await socket.connect()
            return true
        } catch {
            return false
        }
    }

    private func handleSocketStatus(_ status: LiveAudioWebSocket.AudioSocketStatus, from socket: LiveAudioWebSocket) {
        // Ignore callbacks from sockets that have been replaced or stopped.
        guard socketRef.socket === socket else { return }
        switch status {
        case .connecting:
            viewModel.message = "Connecting audio..."
        case .connected:
            reconnectAttempt = 0
            viewModel.isCapturingAudio = true
            viewModel.audioCaptureError = nil
            viewModel.message = "Audio streaming live."
        case .disconnected(let error):
            viewModel.isCapturingAudio = false
            if let error {
                viewModel.audioCaptureError = error.localizedDescription
            }
            // Any disconnect we did not initiate (stop() detaches the socket
            // before disconnecting it) is unexpected — reconnect.
            scheduleReconnect()
        }
    }

    private func scheduleReconnect() {
        guard activeRequest != nil, reconnectTask == nil else { return }
        reconnectTask = Task { [weak self] in
            await self?.runReconnectLoop()
        }
    }

    private func runReconnectLoop() async {
        defer {
            // On cancellation, stop() already cleared (or replaced) the task
            // reference — only a naturally finished loop may clear it.
            if !Task.isCancelled { reconnectTask = nil }
        }
        while !Task.isCancelled, activeRequest != nil {
            reconnectAttempt += 1
            let delay = min(pow(2.0, Double(reconnectAttempt)), 30) // 2s, 4s, ... capped at 30s
            viewModel.message = "Audio disconnected — reconnecting..."
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled, activeRequest != nil else { return }
            if await makeAndConnectSocket() {
                return // Success; a future disconnect schedules a fresh loop.
            }
        }
    }
}
