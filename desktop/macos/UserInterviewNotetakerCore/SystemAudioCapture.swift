import Foundation
import AVFoundation
import ScreenCaptureKit
import CoreMedia

/// Captures system audio output (loopback) via ScreenCaptureKit.
///
/// Mirrors the Windows WASAPI loopback capture: captures whatever the user hears
/// (e.g. the other side of a Zoom call) and delivers PCM16 mono @ 24 kHz.
public final class SystemAudioCapture: NSObject, SCStreamOutput, @unchecked Sendable {
    private var stream: SCStream?
    private let lock = NSLock()
    private let targetSampleRate: Float64 = 24_000

    /// Called on an arbitrary background queue with PCM16 mono 24 kHz frames.
    /// Tag these as source `0x02` (loopback) before sending via WebSocket.
    public var onAudioBuffer: (@Sendable (Data) -> Void)?

    public override init() {
        super.init()
    }

    /// Starts capturing system audio from the default display.
    /// Requires Screen Recording permission (System Settings > Privacy & Security).
    public func start() async throws {
        // Get shareable content (requires screen recording permission).
        let content: SCShareableContent
        do {
            content = try await SCShareableContent.current
        } catch {
            throw SystemAudioCaptureError.permissionDenied(error.localizedDescription)
        }
        guard let display = content.displays.first else {
            throw SystemAudioCaptureError.noDisplayAvailable
        }

        let filter = SCContentFilter(display: display, excludingWindows: [])
        let config = SCStreamConfiguration()
        config.capturesAudio = true
        // Minimise video capture — we only want audio.
        config.width = 1
        config.height = 1
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1)

        let stream = SCStream(filter: filter, configuration: config, delegate: nil)
        try stream.addStreamOutput(
            self,
            type: .audio,
            sampleHandlerQueue: DispatchQueue.global(qos: .userInitiated)
        )
        try await stream.startCapture()

        lock.withLock {
            self.stream = stream
        }
    }

    public func stop() {
        lock.lock()
        let stream = self.stream
        self.stream = nil
        lock.unlock()

        stream?.stopCapture()
    }

    // MARK: - SCStreamOutput

    public func stream(
        _ stream: SCStream,
        didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
        of type: SCStreamOutputType
    ) {
        guard type == .audio,
              let onAudioBuffer = lock.withLock({ self.onAudioBuffer })
        else {
            return
        }

        guard let pcmData = extractPCM16Mono24k(sampleBuffer) else { return }
        onAudioBuffer(pcmData)
    }

    // MARK: - Private conversion

    /// Converts a CMSampleBuffer (system audio, any format) → PCM16 mono 24 kHz Data.
    private func extractPCM16Mono24k(_ sampleBuffer: CMSampleBuffer) -> Data? {
        // --- 1. Get source format ---
        guard let formatDesc = CMSampleBufferGetFormatDescription(sampleBuffer) else {
            return nil
        }
        let sourceFormat = AVAudioFormat(cmAudioFormatDescription: formatDesc)

        // --- 2. Target format ---
        guard let targetFormat = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: targetSampleRate,
            channels: 1,
            interleaved: true
        ) else {
            return nil
        }

        guard let converter = AVAudioConverter(from: sourceFormat, to: targetFormat) else {
            return nil
        }

        // --- 3. Read raw audio buffer list from the sample buffer ---
        let inFrames = CMSampleBufferGetNumSamples(sampleBuffer)
        guard inFrames > 0 else { return nil }

        // --- 4. Create output buffer ---
        let outFrames = AVAudioFrameCount(
            (Double(inFrames) * targetSampleRate / sourceFormat.sampleRate).rounded(.up) + 1
        )
        guard let outBuffer = AVAudioPCMBuffer(
            pcmFormat: targetFormat,
            frameCapacity: outFrames
        ) else {
            return nil
        }

        // --- 5. Convert ---
        var conversionError: NSError?
        let inputBlock: AVAudioConverterInputBlock = { _, outStatus in
            // Create a source PCM buffer backed by the CMSampleBuffer's data
            // on each call (the converter may call us multiple times).
            guard let srcBuf = Self.pcmBuffer(from: sampleBuffer, format: sourceFormat) else {
                outStatus.pointee = .noDataNow
                return nil
            }
            outStatus.pointee = .haveData
            return srcBuf
        }

        converter.convert(to: outBuffer, error: &conversionError, withInputFrom: inputBlock)

        guard conversionError == nil, let channelData = outBuffer.int16ChannelData else {
            return nil
        }

        let byteCount = Int(outBuffer.frameLength) * MemoryLayout<Int16>.size
        return Data(bytes: channelData.pointee, count: byteCount)
    }

    /// Creates an AVAudioPCMBuffer from a CMSampleBuffer by copying the
    /// audio buffer list into the buffer's channel data.
    private static func pcmBuffer(
        from sampleBuffer: CMSampleBuffer,
        format: AVAudioFormat
    ) -> AVAudioPCMBuffer? {
        let frameCount = CMSampleBufferGetNumSamples(sampleBuffer)
        guard frameCount > 0,
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frameCount))
        else {
            return nil
        }

        buffer.frameLength = AVAudioFrameCount(frameCount)

        // Retrieve the audio buffer list, retaining the backing CMBlockBuffer.
        var blockBuffer: CMBlockBuffer?
        var audioBufferList = AudioBufferList()
        let status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            sampleBuffer,
            bufferListSizeNeededOut: nil,
            bufferListOut: &audioBufferList,
            bufferListSize: MemoryLayout<AudioBufferList>.size,
            blockBufferAllocator: nil,
            blockBufferMemoryAllocator: nil,
            flags: kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment,
            blockBufferOut: &blockBuffer
        )

        guard status == noErr else { return nil }

        let abl = UnsafeMutableAudioBufferListPointer(&audioBufferList)
        let srcChannels = min(abl.count, Int(format.channelCount))

        if (format.commonFormat == .pcmFormatFloat32) {
            // Float32 interleaved or deinterleaved
            for ch in 0..<srcChannels {
                guard let src = abl[ch].mData,
                      let dst = buffer.floatChannelData?[ch]
                else { continue }
                let count = min(Int(frameCount), Int(abl[ch].mDataByteSize) / MemoryLayout<Float>.size)
                src.withMemoryRebound(to: Float.self, capacity: count) { srcPtr in
                    dst.update(from: srcPtr, count: count)
                }
            }
        } else if (format.commonFormat == .pcmFormatInt16) {
            for ch in 0..<srcChannels {
                guard let src = abl[ch].mData,
                      let dst = buffer.int16ChannelData?[ch]
                else { continue }
                let count = min(Int(frameCount), Int(abl[ch].mDataByteSize) / MemoryLayout<Int16>.size)
                src.withMemoryRebound(to: Int16.self, capacity: count) { srcPtr in
                    dst.update(from: srcPtr, count: count)
                }
            }
        } else if (format.commonFormat == .pcmFormatInt32) {
            for ch in 0..<srcChannels {
                guard let src = abl[ch].mData,
                      let dst = buffer.int32ChannelData?[ch]
                else { continue }
                let count = min(Int(frameCount), Int(abl[ch].mDataByteSize) / MemoryLayout<Int32>.size)
                src.withMemoryRebound(to: Int32.self, capacity: count) { srcPtr in
                    dst.update(from: srcPtr, count: count)
                }
            }
        }

        // Retain the block buffer so the audio data stays alive.
        _ = blockBuffer
        return buffer
    }
}

public enum SystemAudioCaptureError: Error, LocalizedError {
    case permissionDenied(String)
    case noDisplayAvailable

    public var errorDescription: String? {
        switch self {
        case .permissionDenied(let detail):
            return "Screen Recording permission is required for system audio capture. Enable it in System Settings > Privacy & Security > Screen Recording. (\(detail))"
        case .noDisplayAvailable:
            return "No display available for system audio capture."
        }
    }
}
