import Foundation
@preconcurrency import AVFoundation

/// Captures microphone audio via AVAudioEngine and delivers PCM16 @ 24 kHz mono buffers.
public final class AudioCaptureManager: @unchecked Sendable {
    private let engine = AVAudioEngine()
    private let lock = NSLock()
    private var _isRunning = false
    private var _onAudioBuffer: (@Sendable (Data) -> Void)?

    /// Converter reused across buffers — recreating it per buffer resets
    /// resampler state and causes artifacts at buffer boundaries. Only
    /// touched on the tap callback queue (serial), plus `start()` before the
    /// tap is installed.
    private var converter: AVAudioConverter?

    /// Called on an arbitrary background queue with PCM16 mono 24 kHz frames.
    public var onAudioBuffer: (@Sendable (Data) -> Void)? {
        get { lock.withLock { _onAudioBuffer } }
        set { lock.withLock { _onAudioBuffer = newValue } }
    }

    public init() {}

    /// Requests microphone permission and starts capturing.
    public func start() async throws {
        let granted = await requestPermission()
        guard granted else {
            throw AudioCaptureError.permissionDenied
        }

        // Claim the running slot atomically so overlapping start() calls
        // cannot install a second tap (which would raise an NSException).
        let claimed = lock.withLock { () -> Bool in
            guard !_isRunning else { return false }
            _isRunning = true
            return true
        }
        guard claimed else { return }

        guard let targetFormat = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: 24_000,
            channels: 1,
            interleaved: false
        ) else {
            lock.withLock { _isRunning = false }
            throw AudioCaptureError.formatNotSupported
        }

        // Tap the input node with the hardware format; conversion to
        // 24 kHz mono PCM16 happens in the tap callback.
        let inputNode = engine.inputNode
        let hardwareFormat = inputNode.outputFormat(forBus: 0)
        converter = AVAudioConverter(from: hardwareFormat, to: targetFormat)

        inputNode.installTap(
            onBus: 0,
            bufferSize: 2048,
            format: hardwareFormat
        ) { [weak self] buffer, _ in
            self?.handleBuffer(buffer, targetFormat: targetFormat)
        }

        engine.prepare()
        do {
            try engine.start()
        } catch {
            inputNode.removeTap(onBus: 0)
            engine.stop()
            lock.withLock { _isRunning = false }
            throw error
        }
    }

    public func stop() {
        let wasRunning = lock.withLock { () -> Bool in
            let was = _isRunning
            _isRunning = false
            return was
        }
        guard wasRunning else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
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

        // Rebuild the converter only if the input device format changed.
        if converter == nil || converter?.inputFormat != buffer.format {
            converter = AVAudioConverter(from: buffer.format, to: targetFormat)
        }
        guard let converter else { return }

        // Calculate output capacity with safety margin for resampling.
        let inputFrames = buffer.frameLength
        let outputFrames = AVAudioFrameCount(
            (Double(inputFrames) * targetFormat.sampleRate / buffer.format.sampleRate).rounded(.up) + 4
        )

        guard let outputBuffer = AVAudioPCMBuffer(
            pcmFormat: targetFormat,
            frameCapacity: outputFrames
        ) else {
            return
        }

        var error: NSError?
        var didProvideInput = false
        let inputBlock: AVAudioConverterInputBlock = { _, outStatus in
            if didProvideInput {
                outStatus.pointee = .noDataNow
                return nil
            }
            didProvideInput = true
            outStatus.pointee = .haveData
            return buffer
        }

        converter.convert(to: outputBuffer, error: &error, withInputFrom: inputBlock)

        if let error {
            print("[audio] conversion error: \(error.localizedDescription)")
            return
        }

        // Validate conversion actually produced output.
        guard outputBuffer.frameLength > 0,
              let channelData = outputBuffer.int16ChannelData
        else { return }

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
