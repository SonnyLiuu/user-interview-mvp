#pragma once

#include <atomic>
#include <cstdint>
#include <functional>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace foundry::windows::audio {

enum class AudioSource {
    Loopback,
    Microphone,
};

using PcmChunkCallback =
    std::function<void(AudioSource, const std::vector<std::uint8_t>&)>;

// Captures the default communications microphone and default render device
// loopback as small mono PCM16 chunks at 24 kHz. This stays deliberately
// device-level: no Zoom SDK, window inspection, screen capture, or injection.
//
// Option A (whisper.cpp): Also accumulates all audio into a ring buffer so a
// full-meeting WAV file can be written at session end for offline transcription.
class MeetingAudioCapture {
public:
    MeetingAudioCapture();
    ~MeetingAudioCapture();

    MeetingAudioCapture(const MeetingAudioCapture&) = delete;
    MeetingAudioCapture& operator=(const MeetingAudioCapture&) = delete;

    bool start(PcmChunkCallback callback, std::wstring& error);
    void stop();
    bool running() const;

    // --- Option A: offline transcription support ---

    // Whether to accumulate all captured audio for later WAV export.
    void setAccumulateAudio(bool accumulate);

    // Returns a copy of all accumulated mono PCM16 @ 24kHz samples.
    std::vector<std::uint8_t> getAccumulatedAudio() const;

    // Clears the accumulation buffer.
    void clearAccumulatedAudio();

    // Writes accumulated audio as a 16kHz mono PCM16 WAV file
    // (resampled from 24kHz). Returns the file path on success, empty on failure.
    std::wstring writeWavFile(const std::wstring& dirPath,
                              const std::wstring& fileName) const;

private:
    void captureLoop(bool loopback);
    void accumulate(const std::vector<std::uint8_t>& chunk);

    std::atomic<bool> running_{false};
    std::atomic<bool> accumulate_{false};
    PcmChunkCallback callback_;
    std::thread renderThread_;
    std::thread micThread_;

    mutable std::mutex bufferMutex_;
    std::vector<std::uint8_t> accumulatedPcm_;
};

}  // namespace foundry::windows::audio
