import Foundation
import AVFoundation
import ScreenCaptureKit
import CoreMedia
import CoreGraphics

/// Captures system audio output (loopback) via ScreenCaptureKit.
///
/// Mirrors the Windows WASAPI loopback capture: captures whatever the user hears
/// (e.g. the other side of a Zoom call) and delivers PCM16 mono @ 24 kHz.
public final class SystemAudioCapture: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
    private var stream: SCStream?
    private let lock = NSLock()
    private let targetSampleRate: Float64 = 24_000

    /// Serial queue for sample callbacks — keeps audio frames ordered (a
    /// concurrent queue does not) and makes the cached converter safe.
    private let sampleQueue = DispatchQueue(label: "com.userinterview.notetaker.system-audio", qos: .userInitiated)

    /// Converter reused across sample buffers — recreating it per buffer
    /// resets resampler state and causes artifacts at buffer boundaries.
    /// Only touched on `sampleQueue`.
    private var converter: AVAudioConverter?

    private var _onAudioBuffer: (@Sendable (Data) -> Void)?
    private var _onStreamStopped: (@Sendable (Error?) -> Void)?

    /// Called on an arbitrary background queue with PCM16 mono 24 kHz frames.
    /// Tag these as source `0x02` (loopback) before sending via WebSocket.
    public var onAudioBuffer: (@Sendable (Data) -> Void)? {
        get { lock.withLock { _onAudioBuffer } }
        set { lock.withLock { _onAudioBuffer = newValue } }
    }

    /// Called when the stream dies on its own (permission revoked, display
    /// disconnected, ...) rather than via `stop()`.
    public var onStreamStopped: (@Sendable (Error?) -> Void)? {
        get { lock.withLock { _onStreamStopped } }
        set { lock.withLock { _onStreamStopped = newValue } }
    }

    public override init() {
        super.init()
    }

    /// Starts capturing system audio from the default display.
    /// Requires Screen Recording permission (System Settings > Privacy & Security).
    public func start() async throws {
        guard Self.requestScreenCaptureAccessIfNeeded() else {
            throw SystemAudioCaptureError.permissionDenied(
                "Screen Recording was not granted for this process. If you are launching with `swift run`, grant Screen Recording to Terminal or your IDE, then restart it."
            )
        }

        // Get shareable content (requires screen recording permission).
        let content: SCShareableContent
        do {
            content = try await SCShareableContent.current
        } catch {
            throw SystemAudioCaptureError.permissionDenied(Self.describe(error))
        }
        guard let display = content.displays.first else {
            throw SystemAudioCaptureError.noDisplayAvailable
        }

        let filter = SCContentFilter(display: display, excludingWindows: [])
        let config = SCStreamConfiguration()
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = true
        // Use valid display dimensions even though only audio output is added.
        // Some macOS versions reject 1x1 ScreenCaptureKit streams at start.
        config.width = display.width
        config.height = display.height
        config.queueDepth = 3
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1)

        let stream = SCStream(filter: filter, configuration: config, delegate: self)
        do {
            try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: sampleQueue)
            try await stream.startCapture()
        } catch {
            throw SystemAudioCaptureError.startFailed(Self.describe(error))
        }

        lock.withLock {
            self.stream = stream
        }
    }

    public func stop() {
        let stream = lock.withLock { () -> SCStream? in
            let current = self.stream
            self.stream = nil
            return current
        }
        stream?.stopCapture { error in
            if let error {
                print("[audio] system audio stop error: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - SCStreamDelegate

    public func stream(_ stream: SCStream, didStopWithError error: Error) {
        // Ignore streams already detached by stop(); only surface deaths of
        // the active stream.
        let isCurrent = lock.withLock { () -> Bool in
            guard self.stream === stream else { return false }
            self.stream = nil
            return true
        }
        guard isCurrent else { return }
        onStreamStopped?(error)
    }

    // MARK: - SCStreamOutput

    public func stream(
        _ stream: SCStream,
        didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
        of type: SCStreamOutputType
    ) {
        guard type == .audio, let onAudioBuffer else { return }
        guard let pcmData = convertToTargetPCM(sampleBuffer), !pcmData.isEmpty else { return }
        onAudioBuffer(pcmData)
    }

    // MARK: - Private conversion

    /// Converts a CMSampleBuffer (system audio, any format) → PCM16 mono 24 kHz Data.
    private func convertToTargetPCM(_ sampleBuffer: CMSampleBuffer) -> Data? {
        guard CMSampleBufferGetNumSamples(sampleBuffer) > 0,
              let formatDesc = CMSampleBufferGetFormatDescription(sampleBuffer)
        else { return nil }
        let sourceFormat = AVAudioFormat(cmAudioFormatDescription: formatDesc)

        guard let targetFormat = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: targetSampleRate,
            channels: 1,
            interleaved: false
        ) else {
            return nil
        }

        if converter == nil || converter?.inputFormat != sourceFormat {
            converter = AVAudioConverter(from: sourceFormat, to: targetFormat)
        }
        guard let converter else { return nil }

        // Wrap the sample buffer's audio in an AVAudioPCMBuffer without
        // copying. CoreMedia sizes the buffer list for any channel layout
        // (interleaved or not) — a fixed-size stack AudioBufferList cannot
        // hold non-interleaved stereo and fails outright.
        let data = try? sampleBuffer.withAudioBufferList { audioBufferList, _ -> Data? in
            guard let input = AVAudioPCMBuffer(
                pcmFormat: sourceFormat,
                bufferListNoCopy: audioBufferList.unsafePointer
            ) else {
                return nil
            }
            return self.convert(input, using: converter, to: targetFormat)
        }
        return data ?? nil
    }

    private func convert(
        _ input: AVAudioPCMBuffer,
        using converter: AVAudioConverter,
        to targetFormat: AVAudioFormat
    ) -> Data? {
        let ratio = targetFormat.sampleRate / input.format.sampleRate
        let capacity = AVAudioFrameCount((Double(input.frameLength) * ratio).rounded(.up) + 16)
        guard let output = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: capacity) else {
            return nil
        }

        var conversionError: NSError?
        var didProvideInput = false
        let inputBlock: AVAudioConverterInputBlock = { _, outStatus in
            if didProvideInput {
                outStatus.pointee = .noDataNow
                return nil
            }
            didProvideInput = true
            outStatus.pointee = .haveData
            return input
        }

        converter.convert(to: output, error: &conversionError, withInputFrom: inputBlock)

        guard conversionError == nil,
              output.frameLength > 0,
              let channelData = output.int16ChannelData
        else { return nil }

        let byteCount = Int(output.frameLength) * MemoryLayout<Int16>.size
        return Data(bytes: channelData.pointee, count: byteCount)
    }

    private static func requestScreenCaptureAccessIfNeeded() -> Bool {
        guard !CGPreflightScreenCaptureAccess() else { return true }
        return CGRequestScreenCaptureAccess()
    }

    private static func describe(_ error: Error) -> String {
        let nsError = error as NSError
        var detail = nsError.localizedDescription
        if nsError.domain != NSCocoaErrorDomain || nsError.code != 0 {
            detail += " [domain=\(nsError.domain) code=\(nsError.code)]"
        }
        if !nsError.userInfo.isEmpty {
            detail += " userInfo=\(nsError.userInfo)"
        }
        return detail
    }
}

public enum SystemAudioCaptureError: Error, LocalizedError {
    case permissionDenied(String)
    case noDisplayAvailable
    case startFailed(String)

    public var errorDescription: String? {
        switch self {
        case .permissionDenied(let detail):
            return "Screen Recording permission is required for system audio capture. Enable it in System Settings > Privacy & Security > Screen Recording. (\(detail))"
        case .noDisplayAvailable:
            return "No display available for system audio capture."
        case .startFailed(let detail):
            return "System audio capture could not start. Check Screen Recording permission and try restarting the app. (\(detail))"
        }
    }
}
