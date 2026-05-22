#pragma once

#include <atomic>
#include <cstdint>
#include <functional>
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
class MeetingAudioCapture {
public:
    MeetingAudioCapture();
    ~MeetingAudioCapture();

    MeetingAudioCapture(const MeetingAudioCapture&) = delete;
    MeetingAudioCapture& operator=(const MeetingAudioCapture&) = delete;

    bool start(PcmChunkCallback callback, std::wstring& error);
    void stop();
    bool running() const;

private:
    void captureLoop(bool loopback);

    std::atomic<bool> running_{false};
    PcmChunkCallback callback_;
    std::thread renderThread_;
    std::thread micThread_;
};

}  // namespace foundry::windows::audio
