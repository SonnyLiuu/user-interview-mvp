import Foundation
@preconcurrency import AVFoundation

/// Captures microphone audio via AVAudioEngine and delivers PCM16 @ 24 kHz mono buffers.
public final class AudioCaptureManager: @unchecked Sendable {
    private let engine = AVAudioEngine()
    private let captureQueue = DispatchQueue(label: "com.foundry.audio-capture", qos: .userInitiated)
    private let lock = NSLock()
    private var _isRunning = false

    private var isRunning: Bool {
        get { lock.withLock { _isRunning } }
        set { lock.withLock { _isRunning = newValue } }
    }

    /// Called on an arbitrary background queue with PCM16 mono 24 kHz frames.
    public var onAudioBuffer: (@Sendable (Data) -> Void)?

    public init() {}

    /// Requests microphone permission and starts capturing.
    public func start() async throws {
        let granted = await requestPermission()
        guard granted else {
            throw AudioCaptureError.permissionDenied
        }

        guard !isRunning else { return }

        // Configure the input node's tap with the hardware format.
        let inputNode = engine.inputNode
        let hardwareFormat = inputNode.outputFormat(forBus: 0)

        // We'll convert to 24 kHz mono PCM16 in the tap callback.
        guard let targetFormat = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: 24_000,
            channels: 1,
            interleaved: true
        ) else {
            throw AudioCaptureError.formatNotSupported
        }

        // Install a tap on the input node (mono mix if hardware is stereo).
        inputNode.installTap(
            onBus: 0,
            bufferSize: 2048,
            format: hardwareFormat
        ) { [weak self] buffer, _ in
            self?.handleBuffer(buffer, targetFormat: targetFormat)
        }

        engine.prepare()
        try engine.start()
        isRunning = true
    }

    public func stop() {
        guard isRunning else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        isRunning = false
    }

    // MARK: - Private

    private func requestPermission() async -> Bool {
        #if os(macOS)
        return await withCheckedContinuation { continuation in
            // On macOS, microphone access also requires the app to be authorized
            // in System Settings > Privacy & Security > Microphone.
            switch AVCaptureDevice.authorizationStatus(for: .audio) {
            case .authorized:
                continuation.resume(returning: true)
            case .notDetermined:
                AVCaptureDevice.requestAccess(for: .audio) { granted in
                    continuation.resume(returning: granted)
                }
            default:
                continuation.resume(returning: false)
            }
        }
        #else
        return false
        #endif
    }

    private func handleBuffer(_ buffer: AVAudioPCMBuffer, targetFormat: AVAudioFormat) {
        guard let onAudioBuffer else { return }

        // Convert to target format (24 kHz mono PCM16).
        guard let converter = AVAudioConverter(from: buffer.format, to: targetFormat) else {
            return
        }

        // Calculate output capacity.
        let inputFrames = buffer.frameLength
        let outputFrames = AVAudioFrameCount(
            Double(inputFrames) * targetFormat.sampleRate / buffer.format.sampleRate + 1
        )

        guard let outputBuffer = AVAudioPCMBuffer(
            pcmFormat: targetFormat,
            frameCapacity: outputFrames
        ) else {
            return
        }

        var error: NSError?
        let inputBlock: AVAudioConverterInputBlock = { _, outStatus in
            outStatus.pointee = .haveData
            return buffer
        }

        converter.convert(to: outputBuffer, error: &error, withInputFrom: inputBlock)

        if let error {
            print("[audio] conversion error: \(error.localizedDescription)")
            return
        }

        guard let channelData = outputBuffer.int16ChannelData else { return }
        let frameCount = Int(outputBuffer.frameLength)
        let byteCount = frameCount * MemoryLayout<Int16>.size
        let data = Data(bytes: channelData.pointee, count: byteCount)
        onAudioBuffer(data)
    }
}

public enum AudioCaptureError: Error, LocalizedError {
    case permissionDenied
    case formatNotSupported

    public var errorDescription: String? {
        switch self {
        case .permissionDenied:
            return "Microphone access was denied. Enable it in System Settings > Privacy & Security > Microphone."
        case .formatNotSupported:
            return "PCM16 24 kHz mono format is not available on this device."
        }
    }
}
