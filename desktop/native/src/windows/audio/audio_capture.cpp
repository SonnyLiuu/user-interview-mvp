#include "audio_capture.h"

#include <windows.h>
#include <audioclient.h>
#include <mmdeviceapi.h>
#include <wrl/client.h>

#include <algorithm>
#include <cmath>
#include <fstream>
#include <filesystem>

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
            if (accumulate_) {
                accumulate(chunk);
            }
        }
    }

    audioClient->Stop();
    CoTaskMemFree(rawFormat);
    if (didCoInit) CoUninitialize();
}

// --- Option A: ring buffer accumulation ---

void MeetingAudioCapture::setAccumulateAudio(bool accumulate) {
    accumulate_ = accumulate;
}

void MeetingAudioCapture::accumulate(const std::vector<std::uint8_t>& chunk) {
    std::lock_guard<std::mutex> lock(bufferMutex_);
    accumulatedPcm_.insert(accumulatedPcm_.end(), chunk.begin(), chunk.end());
}

std::vector<std::uint8_t> MeetingAudioCapture::getAccumulatedAudio() const {
    std::lock_guard<std::mutex> lock(bufferMutex_);
    return accumulatedPcm_;
}

void MeetingAudioCapture::clearAccumulatedAudio() {
    std::lock_guard<std::mutex> lock(bufferMutex_);
    accumulatedPcm_.clear();
}

std::wstring MeetingAudioCapture::writeWavFile(
    const std::wstring& dirPath,
    const std::wstring& fileName) const {

    std::vector<std::uint8_t> pcm24k;
    {
        std::lock_guard<std::mutex> lock(bufferMutex_);
        pcm24k = accumulatedPcm_;
    }

    if (pcm24k.empty()) return L"";

    // Resample from 24kHz → 16kHz (simple integer-ratio: skip every 3rd sample)
    // 24000 / 16000 = 3/2 → drop 1 out of every 3 samples
    size_t sampleCount24k = pcm24k.size() / sizeof(int16_t);
    size_t sampleCount16k = (sampleCount24k * 2) / 3;
    std::vector<int16_t> samples16k(sampleCount16k);

    const auto* src = reinterpret_cast<const int16_t*>(pcm24k.data());
    for (size_t i = 0, j = 0; i < sampleCount24k && j < sampleCount16k; ++i) {
        // Keep 2, skip 1
        if (i % 3 != 2) {
            samples16k[j++] = src[i];
        }
    }

    // Ensure directory exists
    std::filesystem::create_directories(dirPath);

    std::filesystem::path filePath = std::filesystem::path(dirPath) / fileName;
    std::ofstream file(filePath, std::ios::binary);
    if (!file) return L"";

    uint32_t dataSize = static_cast<uint32_t>(samples16k.size() * sizeof(int16_t));
    uint32_t fileSize = 36 + dataSize;  // header minus 8 + fmt chunk + data chunk

    // RIFF header
    file.write("RIFF", 4);
    file.write(reinterpret_cast<const char*>(&fileSize), 4);
    file.write("WAVE", 4);

    // fmt subchunk
    file.write("fmt ", 4);
    uint32_t fmtSize = 16;
    uint16_t audioFormat = 1;  // PCM
    uint16_t numChannels = 1;  // mono
    uint32_t sampleRate = 16000;
    uint32_t byteRate = sampleRate * numChannels * sizeof(int16_t);
    uint16_t blockAlign = numChannels * sizeof(int16_t);
    uint16_t bitsPerSample = 16;

    file.write(reinterpret_cast<const char*>(&fmtSize), 4);
    file.write(reinterpret_cast<const char*>(&audioFormat), 2);
    file.write(reinterpret_cast<const char*>(&numChannels), 2);
    file.write(reinterpret_cast<const char*>(&sampleRate), 4);
    file.write(reinterpret_cast<const char*>(&byteRate), 4);
    file.write(reinterpret_cast<const char*>(&blockAlign), 2);
    file.write(reinterpret_cast<const char*>(&bitsPerSample), 2);

    // data subchunk
    file.write("data", 4);
    file.write(reinterpret_cast<const char*>(&dataSize), 4);
    file.write(reinterpret_cast<const char*>(samples16k.data()), dataSize);

    file.close();
    return filePath.wstring();
}

}  // namespace foundry::windows::audio
