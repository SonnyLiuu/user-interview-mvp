import Foundation
import UserInterviewNotetakerCore

/// Manages the full lifecycle of desktop audio capture: WebSocket connection,
/// microphone input, and system audio loopback.  Call `start(...)` when a
/// live session begins and `stop()` when it ends.
@MainActor
final class AudioCaptureCoordinator {
    private let viewModel: AppViewModel
    private let audioCapture: AudioCaptureManager
    private let systemAudio: SystemAudioCapture

    private var audioTask: Task<Void, Never>?
    private var audioSocket: LiveAudioWebSocket?

    init(
        viewModel: AppViewModel,
        audioCapture: AudioCaptureManager = AudioCaptureManager(),
        systemAudio: SystemAudioCapture = SystemAudioCapture()
    ) {
        self.viewModel = viewModel
        self.audioCapture = audioCapture
        self.systemAudio = systemAudio
    }

    /// Opens a WebSocket to the FastAPI audio endpoint and starts both
    /// microphone and system-audio (loopback) capture.
    func start(foundryBaseUrl: String, sessionId: String, liveToken: String) {
        guard !foundryBaseUrl.isEmpty, !sessionId.isEmpty, !liveToken.isEmpty else {
            viewModel.audioCaptureError = "Missing session info for audio capture."
            return
        }

        stop()

        audioTask = Task { [weak self] in
            guard let self else { return }

            let wsBase = foundryBaseUrl
                .replacingOccurrences(of: "https://", with: "wss://")
                .replacingOccurrences(of: "http://", with: "ws://")
            let wsURLString = "\(wsBase)/v1/desktop/live-sessions/\(sessionId)/audio?token=\(liveToken)"

            guard let wsURL = URL(string: wsURLString) else {
                viewModel.audioCaptureError = "Invalid audio WebSocket URL."
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

            do {
                try await socket.connect()
            } catch {
                viewModel.audioCaptureError = "Could not connect audio stream: \(error.localizedDescription)"
                socket.disconnect()
                return
            }

            // Microphone → source 0x01.
            self.audioCapture.onAudioBuffer = { [weak socket] pcmData in
                socket?.sendAudio(pcmData: pcmData, source: 0x01)
            }

            // System audio (loopback) → source 0x02.
            self.systemAudio.onAudioBuffer = { [weak socket] pcmData in
                socket?.sendAudio(pcmData: pcmData, source: 0x02)
            }

            do {
                // Start mic capture (required).
                try await self.audioCapture.start()
            } catch {
                viewModel.audioCaptureError = error.localizedDescription
                socket.disconnect()
                return
            }

            // System audio loopback is best-effort — needs Screen Recording permission.
            do {
                try await self.systemAudio.start()
            } catch {
                print("[audio] system audio capture not available: \(error.localizedDescription)")
            }
        }
    }

    func stop() {
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
}
