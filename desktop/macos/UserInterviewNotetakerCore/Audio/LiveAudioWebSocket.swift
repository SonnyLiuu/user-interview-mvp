import Foundation

/// Streams tagged PCM16 audio frames to the FastAPI live-session audio endpoint.
///
/// Binary frame format (matches Windows desktop app):
///     [Magic: 4 bytes "FAC1"][Source: 1 byte][PCM16 data ...]
///        0x01 = microphone
///        0x02 = loopback / system audio
public final class LiveAudioWebSocket: @unchecked Sendable {
    private let request: URLRequest
    private let session: URLSession
    private let sendQueue = DispatchQueue(label: "com.userinterview.notetaker.audio-ws-send", qos: .userInitiated)
    private let lock = NSLock()

    private var _task: URLSessionWebSocketTask?
    private var _isConnected = false

    private var task: URLSessionWebSocketTask? {
        get { lock.withLock { _task } }
        set { lock.withLock { _task = newValue } }
    }

    private var isConnected: Bool {
        get { lock.withLock { _isConnected } }
        set { lock.withLock { _isConnected = newValue } }
    }

    /// Called on an arbitrary queue when the connection state changes.
    /// Set before calling `connect()`; not synchronized for later mutation.
    public var onStatusChange: (@Sendable (AudioSocketStatus) -> Void)?

    public enum AudioSocketStatus: Sendable {
        case connecting
        case connected
        case disconnected(Error?)
    }

    /// - Parameter request: A `ws(s)://` URLRequest, typically built by
    ///   `LiveSessionClient.audioStreamRequest`, carrying the live token in
    ///   the Authorization header.
    public init(request: URLRequest, session: URLSession = .shared) {
        self.request = request
        self.session = session
    }

    /// Opens the WebSocket connection and waits for the initial handshake.
    public func connect() async throws {
        guard !isConnected else { return }
        onStatusChange?(.connecting)

        let nextTask = session.webSocketTask(with: request)
        task = nextTask
        nextTask.resume()

        do {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                nextTask.sendPing { error in
                    if let error {
                        continuation.resume(throwing: error)
                    } else {
                        continuation.resume()
                    }
                }
            }
        } catch {
            task = nil
            isConnected = false
            onStatusChange?(.disconnected(error))
            throw error
        }

        isConnected = true
        onStatusChange?(.connected)

        // Start listening for incoming messages (server may send close/error frames).
        receiveNext()
    }

    /// Sends a tagged audio frame over the WebSocket. Frames are dropped
    /// while the socket is not connected.
    /// - Parameters:
    ///   - pcmData: Raw PCM16 mono 24 kHz audio bytes.
    ///   - source: `0x01` for microphone, `0x02` for loopback.
    public func sendAudio(pcmData: Data, source: UInt8) {
        sendQueue.async { [weak self] in
            guard let self else { return }
            // Capture task reference under lock to prevent race with disconnect.
            let currentTask = self.task
            guard let currentTask, self.isConnected else { return }

            var frame = Data(capacity: 5 + pcmData.count)
            // Magic header.
            frame.append(contentsOf: [0x46, 0x41, 0x43, 0x31]) // "FAC1"
            // Audio source tag.
            frame.append(source)
            // PCM16 data.
            frame.append(pcmData)

            let completion = DispatchSemaphore(value: 0)
            currentTask.send(.data(frame)) { [weak self] error in
                if let error {
                    self?.handleSendError(error)
                }
                completion.signal()
            }
            if completion.wait(timeout: .now() + 5) == .timedOut {
                print("[audio-ws] send timed out")
            }
        }
    }

    /// Gracefully closes the WebSocket.
    public func disconnect() {
        guard task != nil || isConnected else { return }
        isConnected = false
        task?.cancel(with: .normalClosure, reason: nil)
        task = nil
        onStatusChange?(.disconnected(nil))
    }

    // MARK: - Private

    private func receiveNext() {
        task?.receive { [weak self] result in
            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    print("[audio-ws] server message: \(text)")
                case .data:
                    break // Ignore binary responses.
                @unknown default:
                    break
                }
                self?.receiveNext()
            case .failure(let error):
                self?.handleDisconnect(error)
            }
        }
    }

    private func handleSendError(_ error: Error) {
        let nsError = error as NSError
        // NSURLErrorCancelled is expected on disconnect; don't log.
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled {
            return
        }
        print("[audio-ws] send error: \(error.localizedDescription)")
    }

    private func handleDisconnect(_ error: Error) {
        let nsError = error as NSError
        // Cancellation is the expected result of disconnect().
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled {
            return
        }
        // Server-initiated clean close produces POSIX ENOTCONN (57) or
        // ECONNRESET (54) rather than a real error.
        if nsError.domain == NSPOSIXErrorDomain && (nsError.code == 57 || nsError.code == 54) {
            isConnected = false
            task = nil
            onStatusChange?(.disconnected(nil))
            return
        }
        isConnected = false
        task = nil
        onStatusChange?(.disconnected(error))
    }
}
