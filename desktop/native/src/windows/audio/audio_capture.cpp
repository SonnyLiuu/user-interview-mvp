#include "audio_capture.h"

#include <windows.h>
#include <audioclient.h>
#include <mmdeviceapi.h>
#include <wrl/client.h>

#include <algorithm>
#include <cmath>

using Microsoft::WRL::ComPtr;

namespace foundry::windows::audio {
namespace {

constexpr int kOutputRate = 24000;
constexpr REFERENCE_TIME kBufferDuration = 1000000;  // 100 ms

std::wstring hrMessage(const wchar_t* prefix, HRESULT hr) {
    wchar_t buffer[96];
    swprintf_s(buffer, L"%s failed: 0x%08X", prefix, static_cast<unsigned int>(hr));
    return buffer;
}

bool isFloatFormat(const WAVEFORMATEX* fmt) {
    if (fmt->wFormatTag == WAVE_FORMAT_IEEE_FLOAT) return true;
    if (fmt->wFormatTag != WAVE_FORMAT_EXTENSIBLE) return false;
    auto* ext = reinterpret_cast<const WAVEFORMATEXTENSIBLE*>(fmt);
    return ext->SubFormat == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT;
}

bool isPcmFormat(const WAVEFORMATEX* fmt) {
    if (fmt->wFormatTag == WAVE_FORMAT_PCM) return true;
    if (fmt->wFormatTag != WAVE_FORMAT_EXTENSIBLE) return false;
    auto* ext = reinterpret_cast<const WAVEFORMATEXTENSIBLE*>(fmt);
    return ext->SubFormat == KSDATAFORMAT_SUBTYPE_PCM;
}

float readSample(const BYTE* data, UINT32 frame, UINT16 channel,
                 UINT16 channels, const WAVEFORMATEX* fmt) {
    const BYTE* sample = data + (frame * fmt->nBlockAlign)
                         + (channel * (fmt->wBitsPerSample / 8));
    if (isFloatFormat(fmt) && fmt->wBitsPerSample == 32) {
        return std::clamp(*reinterpret_cast<const float*>(sample), -1.0f, 1.0f);
    }
    if (isPcmFormat(fmt) && fmt->wBitsPerSample == 16) {
        return static_cast<float>(*reinterpret_cast<const int16_t*>(sample)) / 32768.0f;
    }
    if (isPcmFormat(fmt) && fmt->wBitsPerSample == 32) {
        return static_cast<float>(*reinterpret_cast<const int32_t*>(sample)) / 2147483648.0f;
    }
    (void)channels;
    return 0.0f;
}

std::vector<std::uint8_t> convertToMonoPcm24k(const BYTE* data,
                                              UINT32 frames,
                                              const WAVEFORMATEX* fmt,
                                              DWORD flags) {
    if (!data || frames == 0 || !fmt || fmt->nSamplesPerSec == 0 ||
        fmt->nChannels == 0) {
        return {};
    }

    UINT32 outFrames = std::max<UINT32>(
        1, static_cast<UINT32>(
               (static_cast<unsigned long long>(frames) * kOutputRate) /
               fmt->nSamplesPerSec));
    std::vector<std::uint8_t> out(outFrames * sizeof(int16_t));
    auto* outSamples = reinterpret_cast<int16_t*>(out.data());

    if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
        return {};
    }

    for (UINT32 i = 0; i < outFrames; ++i) {
        UINT32 srcFrame = std::min<UINT32>(
            frames - 1,
            static_cast<UINT32>(
                (static_cast<unsigned long long>(i) * fmt->nSamplesPerSec) /
                kOutputRate));
        float mixed = 0.0f;
        for (UINT16 ch = 0; ch < fmt->nChannels; ++ch) {
            mixed += readSample(data, srcFrame, ch, fmt->nChannels, fmt);
        }
        mixed /= static_cast<float>(fmt->nChannels);
        mixed = std::clamp(mixed, -1.0f, 1.0f);
        outSamples[i] = static_cast<int16_t>(std::lrintf(mixed * 32767.0f));
    }
    return out;
}

}  // namespace

MeetingAudioCapture::MeetingAudioCapture() = default;

MeetingAudioCapture::~MeetingAudioCapture() {
    stop();
}

bool MeetingAudioCapture::start(PcmChunkCallback callback, std::wstring& error) {
    if (running_) return true;
    if (!callback) {
        error = L"Audio callback is required.";
        return false;
    }
    callback_ = std::move(callback);
    running_ = true;
    renderThread_ = std::thread([this] { captureLoop(true); });
    micThread_ = std::thread([this] { captureLoop(false); });
    return true;
}

void MeetingAudioCapture::stop() {
    if (!running_) return;
    running_ = false;
    if (renderThread_.joinable()) renderThread_.join();
    if (micThread_.joinable()) micThread_.join();
}

bool MeetingAudioCapture::running() const {
    return running_;
}

void MeetingAudioCapture::captureLoop(bool loopback) {
    HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    bool didCoInit = SUCCEEDED(hr);

    ComPtr<IMMDeviceEnumerator> enumerator;
    hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
                          IID_PPV_ARGS(&enumerator));
    if (FAILED(hr)) {
        if (didCoInit) CoUninitialize();
        return;
    }

    ComPtr<IMMDevice> device;
    hr = enumerator->GetDefaultAudioEndpoint(
        loopback ? eRender : eCapture,
        loopback ? eConsole : eCommunications,
        &device);
    if (FAILED(hr)) {
        if (didCoInit) CoUninitialize();
        return;
    }

    ComPtr<IAudioClient> audioClient;
    hr = device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr,
                          reinterpret_cast<void**>(audioClient.GetAddressOf()));
    if (FAILED(hr)) {
        if (didCoInit) CoUninitialize();
        return;
    }

    WAVEFORMATEX* rawFormat = nullptr;
    hr = audioClient->GetMixFormat(&rawFormat);
    if (FAILED(hr) || !rawFormat) {
        if (didCoInit) CoUninitialize();
        return;
    }

    DWORD streamFlags = loopback ? AUDCLNT_STREAMFLAGS_LOOPBACK : 0;
    hr = audioClient->Initialize(AUDCLNT_SHAREMODE_SHARED, streamFlags,
                                 kBufferDuration, 0, rawFormat, nullptr);
    if (FAILED(hr)) {
        CoTaskMemFree(rawFormat);
        if (didCoInit) CoUninitialize();
        return;
    }

    ComPtr<IAudioCaptureClient> captureClient;
    hr = audioClient->GetService(IID_PPV_ARGS(&captureClient));
    if (FAILED(hr)) {
        CoTaskMemFree(rawFormat);
        if (didCoInit) CoUninitialize();
        return;
    }

    hr = audioClient->Start();
    if (FAILED(hr)) {
        CoTaskMemFree(rawFormat);
        if (didCoInit) CoUninitialize();
        return;
    }

    while (running_) {
        UINT32 packetFrames = 0;
        hr = captureClient->GetNextPacketSize(&packetFrames);
        if (FAILED(hr)) break;

        if (packetFrames == 0) {
            Sleep(10);
            continue;
        }

        BYTE* data = nullptr;
        UINT32 frames = 0;
        DWORD flags = 0;
        hr = captureClient->GetBuffer(&data, &frames, &flags, nullptr, nullptr);
        if (FAILED(hr)) break;

        std::vector<std::uint8_t> chunk =
            convertToMonoPcm24k(data, frames, rawFormat, flags);
        captureClient->ReleaseBuffer(frames);

        if (!chunk.empty() && callback_) {
            callback_(loopback ? AudioSource::Loopback : AudioSource::Microphone,
                      chunk);
        }
    }

    audioClient->Stop();
    CoTaskMemFree(rawFormat);
    if (didCoInit) CoUninitialize();
}

}  // namespace foundry::windows::audio
