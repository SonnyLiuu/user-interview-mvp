// foundry_overlay.exe — Phase 2.
//
// Single native exe managing:
//   • Tray icon (Shell_NotifyIcon)
//   • Overlay window (Direct2D, visible notepad checklist)
//   • Settings window (WebView2)
//
// One thread, one COM apartment, one message pump dispatching for all windows.
// Render of the overlay is paced by Present(1, 0) on each idle iteration.

#include <windows.h>
#include <d3d11.h>
#include <dxgi.h>
#include <shellapi.h>
#include <wrl/client.h>
#include <objbase.h>
#include <algorithm>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#include <mutex>
#include <memory>
#include <optional>
#include <sstream>
#include <string>
#include <string_view>
#include <atomic>
#include <thread>

#include "common/app_state.h"
#include "common/json_util.h"
#include "windows/app_paths.h"
#include "windows/audio/audio_capture.h"
#include "windows/http/http_client.h"
#include "windows/http/sse_client.h"
#include "windows/http/websocket_client.h"
#include "overlay/renderer.h"
#include "overlay/window.h"
#include "tray/tray.h"
#include "webview/webview_window.h"

using Microsoft::WRL::ComPtr;
using foundry::overlay::OverlayWindow;
using foundry::overlay::OverlayActions;
using foundry::overlay::OverlayPage;
using foundry::overlay::OverlayPersonRow;
using foundry::overlay::OverlayHoverTarget;
using foundry::overlay::OverlayRenderState;
using foundry::overlay::OverlayTopicRow;
using foundry::overlay::createOverlayWindow;
using foundry::overlay::renderOverlay;
using foundry::overlay::releaseRendererResources;
using foundry::tray::TrayIcon;
using foundry::tray::TrayActions;
using foundry::webview::WebViewWindow;
using foundry::windows::audio::AudioSource;
using foundry::windows::audio::MeetingAudioCapture;
using foundry::windows::http::BinaryWebSocketClient;
using foundry::windows::http::SseClient;

namespace {

using foundry::json::Json;

std::atomic_bool g_liveRealtimeConnected{false};

bool createDeviceAndSwapChain(const OverlayWindow& win,
                              ComPtr<ID3D11Device>& device,
                              ComPtr<ID3D11DeviceContext>& context,
                              ComPtr<IDXGISwapChain>& swapChain) {
    DXGI_SWAP_CHAIN_DESC desc{};
    desc.BufferCount = 2;
    desc.BufferDesc.Width = win.width;
    desc.BufferDesc.Height = win.height;
    desc.BufferDesc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    desc.BufferDesc.RefreshRate.Numerator = 60;
    desc.BufferDesc.RefreshRate.Denominator = 1;
    desc.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT;
    desc.OutputWindow = win.hwnd;
    desc.SampleDesc.Count = 1;
    desc.Windowed = TRUE;
    desc.SwapEffect = DXGI_SWAP_EFFECT_FLIP_DISCARD;

    UINT flags = D3D11_CREATE_DEVICE_BGRA_SUPPORT;
    D3D_FEATURE_LEVEL fls[] = {D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_10_1};

    HRESULT hr = D3D11CreateDeviceAndSwapChain(
        nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, flags,
        fls, ARRAYSIZE(fls), D3D11_SDK_VERSION,
        &desc, swapChain.GetAddressOf(), device.GetAddressOf(),
        nullptr, context.GetAddressOf());
    if (FAILED(hr)) {
        std::cerr << "D3D11CreateDeviceAndSwapChain failed: 0x"
                  << std::hex << hr << "\n";
        return false;
    }
    return true;
}

std::wstring assetUrl(const wchar_t* filename) {
    wchar_t exe[MAX_PATH];
    GetModuleFileNameW(nullptr, exe, MAX_PATH);
    std::filesystem::path p = std::filesystem::path(exe).parent_path()
                              / L"assets" / filename;
    // file URL: forward slashes, "file:///"
    std::wstring s = p.wstring();
    for (auto& c : s) if (c == L'\\') c = L'/';
    return L"file:///" + s;
}

std::wstring authUrl(const foundry::AppState& appState) {
    std::wstring url = appState.settings.apiBaseUrl.empty()
                           ? L"http://localhost:3000"
                           : appState.settings.apiBaseUrl;
    if (!url.empty() && url.back() == L'/') url.pop_back();
    return url + L"/desktop-auth";
}

Json readJsonFile(const std::filesystem::path& path, Json fallback = Json::object()) {
    std::wifstream in(path);
    if (!in) return fallback;
    std::wstring text((std::istreambuf_iterator<wchar_t>(in)),
                      std::istreambuf_iterator<wchar_t>());
    return foundry::json::parseWide(text, fallback);
}

void writeJsonFile(const std::filesystem::path& path, const Json& json) {
    std::wofstream out(path, std::ios::trunc);
    if (!out) {
        std::wcerr << L"Unable to write JSON file: " << path.wstring()
                   << L"\n";
        return;
    }
    out << foundry::json::dumpWide(json);
}

void writeToken(const std::wstring& token) {
    writeJsonFile(foundry::windows::tokenPath(),
                  Json{{"token", foundry::json::toUtf8(token)}});
}

void clearToken() {
    std::error_code ec;
    std::filesystem::remove(foundry::windows::tokenPath(), ec);
}

std::wstring readApiBaseUrl() {
    Json root = readJsonFile(foundry::windows::settingsPath());
    Json settings = root.contains("settings") && root["settings"].is_object()
        ? root["settings"]
        : root;
    return foundry::json::wideValue(settings, "apiBaseUrl",
                                    L"http://localhost:3000");
}

foundry::DesktopSettings readDesktopSettings() {
    foundry::DesktopSettings settings;
    Json root = readJsonFile(foundry::windows::settingsPath());
    Json json = root.contains("settings") && root["settings"].is_object()
        ? root["settings"]
        : root;
    settings.apiBaseUrl = foundry::json::wideValue(
        json, "apiBaseUrl", L"http://localhost:3000");
    settings.hasOverlayPosition =
        json.value("hasOverlayPosition", false);
    settings.overlayX = json.value("overlayX", 0);
    settings.overlayY = json.value("overlayY", 0);
    return settings;
}

Json desktopSettingsJson(const foundry::DesktopSettings& settings) {
    return Json{{"settings",
                 Json{{"apiBaseUrl", foundry::json::toUtf8(settings.apiBaseUrl)},
                      {"hasOverlayPosition", settings.hasOverlayPosition},
                      {"overlayX", settings.overlayX},
                      {"overlayY", settings.overlayY}}}};
}

void writeDesktopSettings(const foundry::DesktopSettings& settings) {
    writeJsonFile(foundry::windows::settingsPath(),
                  desktopSettingsJson(settings));
}

std::wstring readPersistedToken() {
    Json json = readJsonFile(foundry::windows::tokenPath());
    return foundry::json::wideValue(json, "token", L"");
}

// foundry://call/start?personId=<id>&token=<short-lived-launch-token>
//
// We accept only this shape for v1 — anything else returns nullopt and the
// overlay falls back to the picker. Hosts (Windows shell, browsers) always
// hand us one full URL as argv[1] / WM_COPYDATA payload.
struct DeepLink {
    std::wstring action;    // e.g. L"call/start"
    std::wstring personId;  // empty unless present in query string
    std::wstring token;     // short-lived web-issued launch token
    std::wstring zoomMeetingIdentifier;
};

std::wstring percentDecode(const std::wstring& input) {
    std::wstring out;
    out.reserve(input.size());
    for (size_t i = 0; i < input.size(); ++i) {
        wchar_t c = input[i];
        if (c == L'+') {
            out.push_back(L' ');
        } else if (c == L'%' && i + 2 < input.size()) {
            auto hex = [](wchar_t ch) -> int {
                if (ch >= L'0' && ch <= L'9') return ch - L'0';
                if (ch >= L'a' && ch <= L'f') return 10 + (ch - L'a');
                if (ch >= L'A' && ch <= L'F') return 10 + (ch - L'A');
                return -1;
            };
            int hi = hex(input[i + 1]);
            int lo = hex(input[i + 2]);
            if (hi >= 0 && lo >= 0) {
                out.push_back(static_cast<wchar_t>((hi << 4) | lo));
                i += 2;
            } else {
                out.push_back(c);
            }
        } else {
            out.push_back(c);
        }
    }
    return out;
}

std::optional<DeepLink> parseFoundryUrl(const std::wstring& raw) {
    constexpr std::wstring_view kPrefix = L"foundry://";
    if (raw.size() <= kPrefix.size() ||
        raw.compare(0, kPrefix.size(), kPrefix) != 0) {
        return std::nullopt;
    }
    std::wstring rest = raw.substr(kPrefix.size());
    // Some shells append a trailing slash to a bare protocol invocation.
    while (!rest.empty() && (rest.back() == L'/' || rest.back() == L'\\')) {
        rest.pop_back();
    }
    size_t queryStart = rest.find(L'?');
    DeepLink link;
    link.action = queryStart == std::wstring::npos ? rest : rest.substr(0, queryStart);
    if (queryStart == std::wstring::npos) {
        return link;
    }
    std::wstring query = rest.substr(queryStart + 1);
    size_t pos = 0;
    while (pos < query.size()) {
        size_t amp = query.find(L'&', pos);
        std::wstring pair = query.substr(
            pos, amp == std::wstring::npos ? std::wstring::npos : amp - pos);
        size_t eq = pair.find(L'=');
        if (eq != std::wstring::npos) {
            std::wstring key = pair.substr(0, eq);
            std::wstring value = percentDecode(pair.substr(eq + 1));
            if (key == L"personId") link.personId = value;
            if (key == L"token") link.token = value;
            if (key == L"zoomMeetingIdentifier") link.zoomMeetingIdentifier = value;
        }
        if (amp == std::wstring::npos) break;
        pos = amp + 1;
    }
    return link;
}

std::wstring extractDeepLinkFromCommandLine() {
    int wargc = 0;
    LPWSTR* wargv = CommandLineToArgvW(GetCommandLineW(), &wargc);
    std::wstring url;
    if (wargv && wargc >= 2) {
        std::wstring arg(wargv[1]);
        if (arg.rfind(L"foundry://", 0) == 0) {
            url = std::move(arg);
        }
    }
    if (wargv) LocalFree(wargv);
    return url;
}

void sendDeepLinkToExistingInstance(const std::wstring& url) {
    HWND existing = nullptr;
    for (int attempt = 0; attempt < 30 && !existing; ++attempt) {
        existing = FindWindowW(foundry::overlay::kOverlayWindowClass, nullptr);
        if (!existing) Sleep(100);
    }
    if (!existing) return;

    // Let the receiver process steal foreground after we send.
    DWORD targetPid = 0;
    GetWindowThreadProcessId(existing, &targetPid);
    if (targetPid != 0) AllowSetForegroundWindow(targetPid);

    if (!url.empty()) {
        COPYDATASTRUCT cds{};
        cds.dwData = foundry::overlay::kDeepLinkCopyDataId;
        cds.cbData = static_cast<DWORD>((url.size() + 1) * sizeof(wchar_t));
        cds.lpData = const_cast<wchar_t*>(url.c_str());
        SendMessageW(existing, WM_COPYDATA, 0,
                     reinterpret_cast<LPARAM>(&cds));
    }
    // Best-effort focus; topmost no-activate windows can be stubborn.
    ShowWindow(existing, SW_SHOWNOACTIVATE);
    SetForegroundWindow(existing);
}

std::wstring isoNowUtc() {
    SYSTEMTIME st{};
    GetSystemTime(&st);
    wchar_t buffer[32];
    swprintf_s(buffer, L"%04u-%02u-%02uT%02u:%02u:%02uZ",
               st.wYear, st.wMonth, st.wDay, st.wHour, st.wMinute,
               st.wSecond);
    return buffer;
}

std::wstring apiBaseNoSlash(foundry::AppState& appState) {
    appState.settings.apiBaseUrl = readApiBaseUrl();
    std::wstring base = appState.settings.apiBaseUrl.empty()
                            ? L"http://localhost:3000"
                            : appState.settings.apiBaseUrl;
    if (base.rfind(L"http://", 0) != 0 &&
        base.rfind(L"https://", 0) != 0) {
        base = L"http://" + base;
    }
    if (!base.empty() && base.back() == L'/') base.pop_back();
    return base;
}

std::wstring httpBaseNoSlash(std::wstring base) {
    if (base.empty()) return L"";
    if (base.rfind(L"http://", 0) != 0 &&
        base.rfind(L"https://", 0) != 0) {
        base = L"http://" + base;
    }
    if (!base.empty() && base.back() == L'/') base.pop_back();
    return base;
}

std::vector<std::uint8_t> taggedAudioFrame(
    AudioSource source,
    const std::vector<std::uint8_t>& pcm) {
    constexpr std::uint8_t kMagic[] = {'F', 'A', 'C', '1'};
    constexpr std::uint8_t kMicSource = 1;
    constexpr std::uint8_t kLoopbackSource = 2;

    std::vector<std::uint8_t> frame;
    frame.reserve(sizeof(kMagic) + 1 + pcm.size());
    frame.insert(frame.end(), std::begin(kMagic), std::end(kMagic));
    frame.push_back(source == AudioSource::Microphone
                        ? kMicSource
                        : kLoopbackSource);
    frame.insert(frame.end(), pcm.begin(), pcm.end());
    return frame;
}

std::wstring authSelfTestJson(foundry::AppState& appState) {
    std::wstring url = apiBaseNoSlash(appState) + L"/api/desktop/auth-test";

    auto response = foundry::windows::http::get(url, appState.authToken);
    std::wstring message = response.error.empty()
                               ? foundry::json::extractErrorMessage(response.body)
                               : response.error;
    return foundry::json::dumpWide(Json{
        {"type", "authSelfTestResult"},
        {"ok", response.ok},
        {"status", response.status},
        {"url", foundry::json::toUtf8(url)},
        {"message", foundry::json::toUtf8(message)},
    });
}

std::wstring peopleJson(foundry::AppState& appState) {
    std::wstring url = apiBaseNoSlash(appState) + L"/api/desktop/people";
    auto response = foundry::windows::http::get(url, appState.authToken);
    if (!response.ok) {
        std::wstring message = response.error.empty()
                                   ? foundry::json::extractErrorMessage(response.body)
                                   : response.error;
        return foundry::json::dumpWide(Json{
            {"type", "pickerError"},
            {"message", foundry::json::toUtf8(message)},
            {"status", response.status},
        });
    }
    return foundry::json::dumpWide(Json{
        {"type", "loadPeople"},
        {"people", foundry::json::parseUtf8(response.body, Json::array())},
    });
}

std::wstring joinPersonMeta(const Json& person) {
    std::wstring meta;
    const char* keys[] = {"title", "company", "projectName"};
    for (const char* key : keys) {
        std::wstring value = foundry::json::wideValue(person, key, L"");
        if (value.empty()) continue;
        if (!meta.empty()) meta += L" - ";
        meta += value;
    }
    return meta;
}

std::vector<OverlayPersonRow> peopleRowsFromJson(const Json& people) {
    std::vector<OverlayPersonRow> rows;
    if (!people.is_array()) return rows;
    for (const auto& person : people) {
        if (!person.is_object()) continue;
        OverlayPersonRow row;
        row.id = foundry::json::wideValue(person, "id", L"");
        row.name = foundry::json::wideValue(person, "name", L"Unnamed person");
        row.meta = joinPersonMeta(person);
        if (!row.id.empty()) rows.push_back(row);
    }
    return rows;
}

foundry::TopicCategory categoryFromString(const std::wstring& category) {
    if (category == L"question") return foundry::TopicCategory::Question;
    if (category == L"signal") return foundry::TopicCategory::Signal;
    return foundry::TopicCategory::Goal;
}

void loadTopicsFromJson(foundry::AppState& appState,
                        const Json& topics,
                        bool preserveManualOverrides = false) {
    std::vector<foundry::Topic> previousTopics = appState.topics;
    appState.topics.clear();
    if (!topics.is_array()) return;
    for (const auto& item : topics) {
        if (!item.is_object()) continue;
        foundry::Topic topic;
        topic.id = foundry::json::wideValue(item, "id");
        topic.label = foundry::json::wideValue(item, "label");
        topic.category =
            categoryFromString(foundry::json::wideValue(item, "category"));
        topic.checked = item.value("checked", false);
        topic.checkedBy = foundry::json::wideValue(item, "checkedBy");
        topic.checkedAt = foundry::json::wideValue(item, "checkedAt");
        topic.evidence = foundry::json::wideValue(item, "evidence");
        topic.manualOverride = item.value("manualOverride", false);
        if (preserveManualOverrides && topic.checkedBy == L"gpt_realtime" &&
            !topic.manualOverride) {
            auto previous = std::find_if(
                previousTopics.begin(), previousTopics.end(),
                [&](const foundry::Topic& candidate) {
                    return candidate.id == topic.id && candidate.manualOverride;
                });
            if (previous != previousTopics.end()) {
                topic.checked = previous->checked;
                topic.checkedBy = previous->checkedBy;
                topic.checkedAt = previous->checkedAt;
                topic.evidence = previous->evidence;
                topic.manualOverride = previous->manualOverride;
            }
        }
        if (!topic.id.empty() && !topic.label.empty()) {
            appState.topics.push_back(topic);
        }
    }
}

void addFallbackCallBriefTopics(foundry::AppState& appState) {
    struct FallbackItem {
        const wchar_t* label;
        foundry::TopicCategory category;
    };
    const FallbackItem items[] = {
        {L"Validate how often this pain happens and when it becomes urgent.",
         foundry::TopicCategory::Goal},
        {L"Learn what workaround they use today and why it is not good enough.",
         foundry::TopicCategory::Goal},
        {L"Clarify whether this person is the user, buyer, influencer, or connector.",
         foundry::TopicCategory::Goal},
        {L"When did you last run into this problem?",
         foundry::TopicCategory::Question},
        {L"What do you do today when it happens?",
         foundry::TopicCategory::Question},
        {L"What makes the current workaround frustrating or expensive?",
         foundry::TopicCategory::Question},
        {L"Who else is involved when this problem needs to be solved?",
         foundry::TopicCategory::Question},
        {L"What would make this worth paying attention to now?",
         foundry::TopicCategory::Question},
        {L"Who else should I talk to who sees this problem up close?",
         foundry::TopicCategory::Question},
        {L"They describe a recent, repeated, or expensive workaround.",
         foundry::TopicCategory::Signal},
        {L"They can name other people who share or own the problem.",
         foundry::TopicCategory::Signal},
        {L"They ask to see the solution or offer a relevant introduction.",
         foundry::TopicCategory::Signal},
    };
    for (const auto& item : items) {
        foundry::Topic topic;
        topic.id = std::to_wstring(appState.topics.size() + 1);
        topic.label = item.label;
        topic.category = item.category;
        appState.topics.push_back(topic);
    }
}

std::wstring startLiveSession(foundry::AppState& appState,
                              const std::wstring& personId,
                              const std::wstring& personName,
                              const std::wstring& launchToken,
                              const std::wstring& zoomMeetingIdentifier) {
    std::wstring token = launchToken;
    if (token.empty()) {
        std::wstring tokenUrl = apiBaseNoSlash(appState) +
                                L"/api/desktop/launch-token";
        Json tokenPayload{{"personId", foundry::json::toUtf8(personId)}};
        if (!zoomMeetingIdentifier.empty()) {
            tokenPayload["zoomMeetingIdentifier"] =
                foundry::json::toUtf8(zoomMeetingIdentifier);
        }
        auto tokenResponse = foundry::windows::http::postJson(
            tokenUrl, foundry::json::dumpUtf8(tokenPayload),
            appState.authToken);
        if (!tokenResponse.ok) {
            std::wstring message =
                tokenResponse.error.empty()
                    ? foundry::json::extractErrorMessage(tokenResponse.body)
                    : tokenResponse.error;
            return foundry::json::dumpWide(Json{
                {"type", "pickerError"},
                {"message", foundry::json::toUtf8(message)},
                {"status", tokenResponse.status},
            });
        }
        Json tokenRoot = foundry::json::parseUtf8(
            tokenResponse.body, Json::object());
        token = foundry::json::wideValue(tokenRoot, "token");
        if (token.empty()) {
            return foundry::json::dumpWide(Json{
                {"type", "pickerError"},
                {"message", "Could not prepare secure launch token."},
                {"status", 0},
            });
        }
    }

    std::wstring url = apiBaseNoSlash(appState) +
                       L"/api/desktop/sessions/live/start";
    Json payload{
        {"personId", foundry::json::toUtf8(personId)},
        {"launchToken", foundry::json::toUtf8(token)},
        {"captureProvider", "desktop_audio"},
    };
    if (!zoomMeetingIdentifier.empty()) {
        payload["zoomMeetingIdentifier"] =
            foundry::json::toUtf8(zoomMeetingIdentifier);
    }
    auto response = foundry::windows::http::postJson(
        url, foundry::json::dumpUtf8(payload), appState.authToken);
    if (!response.ok) {
        std::wstring message = response.error.empty()
                                   ? foundry::json::extractErrorMessage(response.body)
                                   : response.error;
        return foundry::json::dumpWide(Json{
            {"type", "pickerError"},
            {"message", foundry::json::toUtf8(message)},
            {"status", response.status},
        });
    }

    Json root = foundry::json::parseUtf8(response.body);
    appState.selectedPersonId = personId;
    appState.selectedPersonName = personName;
    appState.liveSessionId = foundry::json::wideValue(root, "sessionId");
    appState.liveToken = foundry::json::wideValue(root, "liveToken");
    appState.foundryBaseUrl = httpBaseNoSlash(
        foundry::json::wideValue(root, "foundryBaseUrl"));
    appState.captureProvider = foundry::json::wideValue(
        root, "captureProvider", L"zoom_rtms");
    appState.audioCaptureEnabled = root.value("audioCaptureEnabled", false);
    appState.liveTranscriptRaw.clear();
    appState.realtimeStatus.clear();
    appState.realtimeError.clear();
    loadTopicsFromJson(appState, root["topics"]);
    if (appState.topics.empty()) {
        addFallbackCallBriefTopics(appState);
    }

    std::wcout << L"[session] live session " << appState.liveSessionId
               << L"; loaded " << appState.topics.size() << L" topics"
               << L"; capture=" << appState.captureProvider
               << L"; audio=" << (appState.audioCaptureEnabled ? L"on" : L"off")
               << L"\n";
    return foundry::json::dumpWide(Json{
        {"type", "sessionSelected"},
        {"personId", foundry::json::toUtf8(personId)},
        {"topicCount", appState.topics.size()},
    });
}

std::wstring loadCallBrief(foundry::AppState& appState,
                           const std::wstring& personId,
                           const std::wstring& personName) {
    std::wstring url = apiBaseNoSlash(appState) +
                       L"/api/desktop/people/" + personId + L"/call-brief";
    auto response = foundry::windows::http::get(url, appState.authToken);
    if (!response.ok) {
        std::wstring message = response.error.empty()
                                   ? foundry::json::extractErrorMessage(response.body)
                                   : response.error;
        return foundry::json::dumpWide(Json{
            {"type", "pickerError"},
            {"message", foundry::json::toUtf8(message)},
            {"status", response.status},
        });
    }

    appState.selectedPersonId = personId;
    appState.selectedPersonName = personName;
    appState.topics.clear();
    Json root = foundry::json::parseUtf8(response.body);
    Json content = root.contains("content") && root["content"].is_object()
        ? root["content"]
        : root;
    struct CategoryKey {
        const char* key;
        const char* legacyKey;
        foundry::TopicCategory category;
    };
    const CategoryKey categories[] = {
        {"goals",     "learning_goals",     foundry::TopicCategory::Goal},
        {"questions", "question_sequence",  foundry::TopicCategory::Question},
        {"signals",   "signals_to_watch",   foundry::TopicCategory::Signal},
    };
    for (const auto& spec : categories) {
        const Json* values = nullptr;
        if (content.contains(spec.key) && content[spec.key].is_array()) {
            values = &content[spec.key];
        } else if (content.contains(spec.legacyKey) &&
                   content[spec.legacyKey].is_array()) {
            values = &content[spec.legacyKey];
        }
        if (!values) continue;

        for (const auto& item : *values) {
            std::wstring label;
            if (item.is_string()) {
                label = foundry::json::fromUtf8(item.get<std::string>());
            } else if (item.is_object()) {
                label = foundry::json::wideValue(item, "question");
                if (label.empty()) label = foundry::json::wideValue(item, "text");
                if (label.empty()) label = foundry::json::wideValue(item, "goal");
                if (label.empty()) label = foundry::json::wideValue(item, "signal");
            }
            if (label.empty()) continue;

            foundry::Topic topic;
            topic.id = std::to_wstring(appState.topics.size() + 1);
            topic.label = label;
            topic.category = spec.category;
            appState.topics.push_back(topic);
        }
    }

    bool hasChecklistContent = false;
    for (const auto& topic : appState.topics) {
        if (topic.category == foundry::TopicCategory::Goal ||
            topic.category == foundry::TopicCategory::Question) {
            hasChecklistContent = true;
            break;
        }
    }
    bool usedFallback = false;
    if (!hasChecklistContent) {
        addFallbackCallBriefTopics(appState);
        usedFallback = true;
    }

    std::wcout << L"[session] selected person " << personId
               << L"; loaded " << appState.topics.size() << L" topics\n";
    return foundry::json::dumpWide(Json{
        {"type", "sessionSelected"},
        {"personId", foundry::json::toUtf8(personId)},
        {"topicCount", appState.topics.size()},
        {"fallbackUsed", usedFallback},
    });
}

void endLiveSession(foundry::AppState& appState) {
    if (appState.liveSessionId.empty() || appState.liveToken.empty() ||
        appState.foundryBaseUrl.empty()) {
        return;
    }
    std::wstring base = appState.foundryBaseUrl;
    if (!base.empty() && base.back() == L'/') base.pop_back();
    std::wstring url = base + L"/v1/desktop/live-sessions/" +
                       appState.liveSessionId + L"/end";
    foundry::windows::http::postJson(url, "{}", appState.liveToken);
}

void syncLiveTopicOverride(const foundry::AppState& appState,
                           const foundry::Topic& topic) {
    if (appState.liveSessionId.empty() || appState.liveToken.empty() ||
        appState.foundryBaseUrl.empty() || topic.id.empty()) {
        return;
    }

    std::wstring base = appState.foundryBaseUrl;
    if (!base.empty() && base.back() == L'/') base.pop_back();
    std::wstring url = base + L"/v1/desktop/live-sessions/" +
                       appState.liveSessionId + L"/topics/" +
                       topic.id + L"/override";
    std::wstring token = appState.liveToken;
    std::wstring topicId = topic.id;
    std::string body = foundry::json::dumpUtf8(Json{
        {"checked", topic.checked},
    });

    std::thread([url, token, topicId, body] {
        auto response = foundry::windows::http::postJson(url, body, token);
        if (!response.ok) {
            std::wstring message =
                response.error.empty()
                    ? foundry::json::extractErrorMessage(response.body)
                    : response.error;
            std::wcout << L"[live] manual topic override sync failed id="
                       << topicId << L" status=" << response.status
                       << L" message=" << message << L"\n";
        }
    }).detach();
}

std::wstring endSessionJson(const foundry::AppState& appState,
                              const std::wstring& transcriptSource,
                              const std::wstring& transcriptStatus) {
    Json topics = Json::array();
    for (const auto& topic : appState.topics) {
        topics.push_back(Json{
            {"id", foundry::json::toUtf8(topic.id)},
            {"label", foundry::json::toUtf8(topic.label)},
            {"checked", topic.checked},
        });
    }
    return foundry::json::dumpWide(Json{
        {"type", "loadEndSession"},
        {"session",
         Json{{"personId", foundry::json::toUtf8(appState.selectedPersonId)},
              {"personName", foundry::json::toUtf8(appState.selectedPersonName)},
              {"topics", topics},
              {"transcriptRaw", foundry::json::toUtf8(appState.liveTranscriptRaw)},
              {"transcriptSource", foundry::json::toUtf8(transcriptSource)},
              {"transcriptStatus", foundry::json::toUtf8(transcriptStatus)}}},
    });
}

std::wstring endSessionHtmlPath() {
    wchar_t exePath[MAX_PATH] = {0};
    GetModuleFileNameW(nullptr, exePath, MAX_PATH);
    std::filesystem::path dir = std::filesystem::path(exePath).parent_path();
    std::filesystem::path html = dir / L"assets" / L"end_session.html";
    return L"file:///" + html.wstring();
}

// --- Option A: whisper.cpp local transcription ---

// Returns the directory containing the running exe.
std::wstring exeDir() {
    wchar_t path[MAX_PATH] = {0};
    GetModuleFileNameW(nullptr, path, MAX_PATH);
    return std::filesystem::path(path).parent_path().wstring();
}

// Runs whisper.cpp as a subprocess and captures stdout.
// whisper-cli.exe and the model file (ggml-base.en.bin) must be in the exe directory.
// Returns the transcript text, or empty on failure.
std::wstring runWhisperTranscription(const std::wstring& wavPath) {
    std::wstring exeDirPath = exeDir();
    std::wstring whisperExe = exeDirPath + L"\\whisper-cli.exe";
    std::wstring modelPath = exeDirPath + L"\\ggml-base.en.bin";

    if (!std::filesystem::exists(whisperExe)) {
        std::wcerr << L"[whisper] whisper-cli.exe not found at " << whisperExe << L"\n";
        return L"";
    }
    if (!std::filesystem::exists(modelPath)) {
        std::wcerr << L"[whisper] model not found at " << modelPath
                   << L" — download from https://huggingface.co/ggerganov/whisper.cpp\n";
        return L"";
    }

    // Build command line: whisper-cli.exe -m model.bin -f audio.wav -l en -otxt -of output
    std::wstring outputPrefix = wavPath + L".whisper";
    std::wstring cmdLine = L"\"" + whisperExe + L"\""
        L" -m \"" + modelPath + L"\""
        L" -f \"" + wavPath + L"\""
        L" -l en"
        L" -otxt"
        L" -of \"" + outputPrefix + L"\"";

    std::wcout << L"[whisper] running: " << cmdLine << L"\n";

    // Create pipe for stdout
    SECURITY_ATTRIBUTES sa{sizeof(sa), nullptr, TRUE};
    HANDLE stdoutRead = nullptr;
    HANDLE stdoutWrite = nullptr;
    if (!CreatePipe(&stdoutRead, &stdoutWrite, &sa, 0)) {
        return L"";
    }
    SetHandleInformation(stdoutRead, HANDLE_FLAG_INHERIT, 0);

    STARTUPINFOW si{sizeof(si)};
    si.dwFlags = STARTF_USESTDHANDLES;
    si.hStdOutput = stdoutWrite;
    si.hStdError = stdoutWrite;

    PROCESS_INFORMATION pi{};
    if (!CreateProcessW(nullptr, cmdLine.data(), nullptr, nullptr,
                        TRUE, CREATE_NO_WINDOW, nullptr,
                        exeDirPath.c_str(), &si, &pi)) {
        CloseHandle(stdoutRead);
        CloseHandle(stdoutWrite);
        std::wcerr << L"[whisper] CreateProcess failed: " << GetLastError() << L"\n";
        return L"";
    }

    CloseHandle(stdoutWrite);
    CloseHandle(pi.hThread);

    // Read stdout while process runs
    std::string output;
    char buffer[4096];
    DWORD bytesRead = 0;
    while (ReadFile(stdoutRead, buffer, sizeof(buffer) - 1, &bytesRead, nullptr) &&
           bytesRead > 0) {
        buffer[bytesRead] = '\0';
        output += buffer;
    }
    CloseHandle(stdoutRead);

    WaitForSingleObject(pi.hProcess, 60000);  // 60s timeout
    CloseHandle(pi.hProcess);

    std::wcout << L"[whisper] stdout (" << output.size() << L" bytes)\n";

    // Also try reading the .txt output file
    std::wstring txtPath = outputPrefix + L".txt";
    std::wstring transcript;
    if (std::filesystem::exists(txtPath)) {
        std::ifstream txtFile(txtPath);
        if (txtFile) {
            std::stringstream ss;
            ss << txtFile.rdbuf();
            std::string txtContent = ss.str();
            // Convert to wide
            int len = MultiByteToWideChar(CP_UTF8, 0, txtContent.c_str(),
                                          static_cast<int>(txtContent.size()),
                                          nullptr, 0);
            if (len > 0) {
                transcript.resize(len);
                MultiByteToWideChar(CP_UTF8, 0, txtContent.c_str(),
                                    static_cast<int>(txtContent.size()),
                                    transcript.data(), len);
            }
        }
    }

    // Clean up temp files
    std::filesystem::remove(wavPath);
    std::filesystem::remove(txtPath);

    return transcript;
}

std::wstring buildNotesSummary(const foundry::AppState& appState);
bool refreshLiveSessionSnapshot(foundry::AppState& appState,
                                bool replaceTopics = false);

Json endSessionPayload(const foundry::AppState& appState,
                       const std::wstring& transcriptRaw) {
    Json topics = Json::array();
    for (const auto& topic : appState.topics) {
        topics.push_back(Json{
            {"id", foundry::json::toUtf8(topic.id)},
            {"label", foundry::json::toUtf8(topic.label)},
            {"checked", topic.checked},
            {"checkedBy", foundry::json::toUtf8(topic.checkedBy)},
            {"checkedAt", foundry::json::toUtf8(topic.checkedAt)},
            {"evidence", foundry::json::toUtf8(topic.evidence)},
            {"manualOverride", topic.manualOverride},
        });
    }
    return Json{
        {"personId", foundry::json::toUtf8(appState.selectedPersonId)},
        {"startedAt", foundry::json::toUtf8(appState.sessionStartedAt)},
        {"endedAt", foundry::json::toUtf8(isoNowUtc())},
        {"liveSessionId", foundry::json::toUtf8(appState.liveSessionId)},
        {"liveToken", foundry::json::toUtf8(appState.liveToken)},
        {"topics", topics},
        {"notesRaw", foundry::json::toUtf8(buildNotesSummary(appState))},
        {"transcriptRaw", foundry::json::toUtf8(transcriptRaw)},
    };
}

std::wstring buildNotesSummary(const foundry::AppState& appState) {
    std::wstring notes = L"Checked topics:\n";
    bool anyChecked = false;
    for (const auto& topic : appState.topics) {
        if (topic.category == foundry::TopicCategory::Signal) continue;
        if (topic.checked) {
            notes += L"- " + topic.label + L"\n";
            anyChecked = true;
        }
    }
    if (!anyChecked) notes += L"- None\n";
    notes += L"\nUnchecked topics:\n";
    bool anyUnchecked = false;
    for (const auto& topic : appState.topics) {
        if (topic.category == foundry::TopicCategory::Signal) continue;
        if (!topic.checked) {
            notes += L"- " + topic.label + L"\n";
            anyUnchecked = true;
        }
    }
    if (!anyUnchecked) notes += L"- None\n";
    return notes;
}

Json saveEndSession(foundry::AppState& appState,
                    const std::wstring& transcriptRaw) {
    if (!appState.liveSessionId.empty()) {
        refreshLiveSessionSnapshot(appState, true);
        endLiveSession(appState);
        refreshLiveSessionSnapshot(appState, true);
    }

    std::wstring finalTranscriptRaw = transcriptRaw;
    std::wstring url = apiBaseNoSlash(appState) + L"/api/desktop/sessions/end";
    auto response = foundry::windows::http::postJson(
        url,
        foundry::json::dumpUtf8(
            endSessionPayload(appState, finalTranscriptRaw)),
        appState.authToken);
    if (!response.ok) {
        std::wstring message = response.error.empty()
                                   ? foundry::json::extractErrorMessage(response.body)
                                   : response.error;
        return Json{
            {"type", "saveFailed"},
            {"status", response.status},
            {"message", foundry::json::toUtf8(message)},
        };
    }
    appState.sessionStatus = foundry::SessionStatus::Idle;
    appState.selectedPersonId.clear();
    appState.selectedPersonName.clear();
    appState.sessionStartedAt.clear();
    appState.liveSessionId.clear();
    appState.liveToken.clear();
    appState.foundryBaseUrl.clear();
    appState.captureProvider.clear();
    appState.audioCaptureEnabled = false;
    appState.liveTranscriptRaw.clear();
    appState.realtimeStatus.clear();
    appState.realtimeError.clear();
    appState.topics.clear();
    return Json{{"type", "saveSucceeded"}};
}

bool focusIfOpen(const std::unique_ptr<WebViewWindow>& window) {
    if (!window || !IsWindow(window->hwnd())) return false;
    ShowWindow(window->hwnd(), SW_SHOWNORMAL);
    SetForegroundWindow(window->hwnd());
    return true;
}

POINT defaultOverlayPoint(int width, int height) {
    const POINT anchor{0, 0};
    HMONITOR monitor = MonitorFromPoint(anchor, MONITOR_DEFAULTTOPRIMARY);
    MONITORINFO mi{};
    mi.cbSize = sizeof(mi);
    if (!GetMonitorInfoW(monitor, &mi)) return POINT{24, 24};
    const int margin = MulDiv(24, GetDpiForSystem(), 96);
    return POINT{mi.rcWork.right - width - margin, mi.rcWork.top + margin};
}

void enableDpiAwareness() {
    if (SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)) {
        return;
    }
    SetProcessDPIAware();
}

foundry::overlay::TopicCategory toRenderCategory(foundry::TopicCategory c) {
    switch (c) {
        case foundry::TopicCategory::Goal:
            return foundry::overlay::TopicCategory::Goal;
        case foundry::TopicCategory::Question:
            return foundry::overlay::TopicCategory::Question;
        case foundry::TopicCategory::Signal:
            return foundry::overlay::TopicCategory::Signal;
    }
    return foundry::overlay::TopicCategory::Goal;
}

struct TranscriptSummary {
    bool hasTranscript = false;
    unsigned int turnCount = 0;
    std::wstring latestLine;
};

std::wstring trimTranscriptLine(const std::wstring& line) {
    const wchar_t* whitespace = L" \t\r\n";
    size_t first = line.find_first_not_of(whitespace);
    if (first == std::wstring::npos) return L"";
    size_t last = line.find_last_not_of(whitespace);
    return line.substr(first, last - first + 1);
}

TranscriptSummary summarizeTranscript(const std::wstring& raw) {
    TranscriptSummary summary;
    size_t start = 0;
    while (start <= raw.size()) {
        size_t end = raw.find(L'\n', start);
        std::wstring line = trimTranscriptLine(
            raw.substr(start, end == std::wstring::npos ? std::wstring::npos
                                                        : end - start));
        if (!line.empty()) {
            summary.hasTranscript = true;
            ++summary.turnCount;
            summary.latestLine = line;
        }
        if (end == std::wstring::npos) break;
        start = end + 1;
    }
    constexpr size_t kMaxPreviewChars = 150;
    if (summary.latestLine.size() > kMaxPreviewChars) {
        summary.latestLine =
            summary.latestLine.substr(0, kMaxPreviewChars - 3) + L"...";
    }
    return summary;
}

OverlayRenderState overlayRenderState(const foundry::AppState& appState,
                                      unsigned int scrollOffset,
                                      unsigned int personScrollOffset,
                                      OverlayPage page,
                                      OverlayHoverTarget hoverTarget,
                                      int hoverIndex,
                                      bool personDropdownOpen,
                                      bool goalsCollapsed,
                                      bool questionsCollapsed,
                                      const std::wstring& settingsStatus,
                                      const std::wstring& pickerStatus,
                                      const std::wstring& endSessionStatus,
                                      const std::vector<OverlayPersonRow>& people) {
    OverlayRenderState state;
    state.page = page;
    state.hoverTarget = hoverTarget;
    state.hoverIndex = hoverIndex;
    state.personDropdownOpen = personDropdownOpen;
    state.goalsCollapsed = goalsCollapsed;
    state.questionsCollapsed = questionsCollapsed;
    state.sessionActive =
        appState.sessionStatus == foundry::SessionStatus::Active;
    state.hasAuthToken = !appState.authToken.empty();
    state.scrollOffset = scrollOffset;
    state.personScrollOffset = personScrollOffset;
    state.apiBaseUrl = appState.settings.apiBaseUrl;
    state.settingsStatus = settingsStatus;
    state.pickerStatus = pickerStatus;
    state.endSessionStatus = endSessionStatus;
    state.selectedPersonName = appState.selectedPersonName;
    state.realtimeStatus = appState.realtimeStatus;
    state.realtimeError = appState.realtimeError;
    TranscriptSummary transcript = summarizeTranscript(appState.liveTranscriptRaw);
    state.hasTranscript = transcript.hasTranscript;
    state.transcriptTurnCount = transcript.turnCount;
    state.transcriptPreview = transcript.latestLine;
    state.people = people;
    for (const auto& topic : appState.topics) {
        if (topic.category == foundry::TopicCategory::Signal) continue;
        ++state.topicCount;
        if (topic.checked) ++state.checkedCount;
        if (topic.category == foundry::TopicCategory::Goal) ++state.goalCount;
        OverlayTopicRow row;
        row.label = topic.label;
        row.category = toRenderCategory(topic.category);
        row.checked = topic.checked;
        state.topics.push_back(row);
    }
    return state;
}

unsigned int topicCountByCategory(const foundry::AppState& appState,
                                  foundry::TopicCategory category) {
    unsigned int count = 0;
    for (const auto& topic : appState.topics) {
        if (topic.category == category) ++count;
    }
    return count;
}

std::vector<size_t> visibleChecklistTopicIndices(
    const foundry::AppState& appState,
    bool goalsCollapsed,
    bool questionsCollapsed) {
    std::vector<size_t> indices;
    if (!goalsCollapsed) {
        for (size_t i = 0; i < appState.topics.size(); ++i) {
            if (appState.topics[i].category == foundry::TopicCategory::Goal) {
                indices.push_back(i);
            }
        }
    }
    if (!questionsCollapsed) {
        for (size_t i = 0; i < appState.topics.size(); ++i) {
            if (appState.topics[i].category ==
                foundry::TopicCategory::Question) {
                indices.push_back(i);
            }
        }
    }
    return indices;
}

bool applyTopicUpdate(foundry::AppState& appState, const Json& topicJson) {
    std::wstring id = foundry::json::wideValue(topicJson, "id");
    if (id.empty()) return false;
    for (auto& topic : appState.topics) {
        if (topic.id != id) continue;
        std::wstring incomingCheckedBy = foundry::json::wideValue(topicJson, "checkedBy");
        bool incomingManualOverride =
            topicJson.value("manualOverride", topic.manualOverride);
        if (topic.manualOverride && incomingCheckedBy == L"gpt_realtime" &&
            !incomingManualOverride) {
            return false;
        }
        bool changed = false;
        bool checked = topicJson.value("checked", topic.checked);
        if (topic.checked != checked) {
            topic.checked = checked;
            changed = true;
        }
        std::wstring label = foundry::json::wideValue(topicJson, "label");
        if (!label.empty() && topic.label != label) {
            topic.label = label;
            changed = true;
        }
        std::wstring checkedBy = incomingCheckedBy.empty()
                                     ? topic.checkedBy
                                     : incomingCheckedBy;
        if (topic.checkedBy != checkedBy) {
            topic.checkedBy = checkedBy;
            changed = true;
        }
        std::wstring checkedAt = foundry::json::wideValue(
            topicJson, "checkedAt", topic.checkedAt);
        if (topic.checkedAt != checkedAt) {
            topic.checkedAt = checkedAt;
            changed = true;
        }
        std::wstring evidence = foundry::json::wideValue(
            topicJson, "evidence", topic.evidence);
        if (topic.evidence != evidence) {
            topic.evidence = evidence;
            changed = true;
        }
        if (topic.manualOverride != incomingManualOverride) {
            topic.manualOverride = incomingManualOverride;
            changed = true;
        }
        return changed;
    }
    return false;
}

bool applyRealtimeTopicSnapshot(foundry::AppState& appState, const Json& topics) {
    if (!topics.is_array()) return false;
    bool changed = false;
    for (const auto& topic : topics) {
        if (!topic.is_object()) continue;
        bool checked = topic.value("checked", false);
        std::wstring checkedBy = foundry::json::wideValue(topic, "checkedBy");
        if (!checked || checkedBy != L"gpt_realtime") continue;
        if (applyTopicUpdate(appState, topic)) {
            std::wstring topicId = foundry::json::wideValue(topic, "id");
            std::wcout << L"[live] topic checked snapshot"
                       << (topicId.empty() ? L"" : L" id=" + topicId)
                       << L"\n";
            changed = true;
        }
    }
    return changed;
}

bool applyTranscriptRaw(foundry::AppState& appState, const Json& json) {
    std::wstring transcriptRaw =
        foundry::json::wideValue(json, "transcriptRaw", appState.liveTranscriptRaw);
    if (transcriptRaw == appState.liveTranscriptRaw) return false;
    appState.liveTranscriptRaw = transcriptRaw;
    return true;
}

bool refreshLiveSessionSnapshot(foundry::AppState& appState,
                                bool replaceTopics) {
    if (appState.foundryBaseUrl.empty() ||
        appState.liveSessionId.empty() ||
        appState.liveToken.empty()) {
        return false;
    }
    std::wstring base = appState.foundryBaseUrl;
    if (!base.empty() && base.back() == L'/') base.pop_back();
    std::wstring url = base + L"/v1/desktop/live-sessions/" +
                       appState.liveSessionId;
    auto response = foundry::windows::http::get(url, appState.liveToken);
    if (!response.ok) return false;
    Json root = foundry::json::parseUtf8(response.body, Json::object());
    bool changed = false;
    if (replaceTopics && root.contains("topics")) {
        loadTopicsFromJson(appState, root["topics"], true);
        applyRealtimeTopicSnapshot(appState, root["topics"]);
        changed = true;
    } else if (root.contains("topics")) {
        changed = applyRealtimeTopicSnapshot(appState, root["topics"]);
    }
    changed = applyTranscriptRaw(appState, root) || changed;
    return changed;
}

bool pollLiveSession(foundry::AppState& appState) {
    return refreshLiveSessionSnapshot(appState);
}

bool applyLiveEvent(foundry::AppState& appState, const Json& event) {
    if (!event.is_object()) return false;
    std::string type = event.value("type", "");
    Json data = event.contains("data") && event["data"].is_object()
        ? event["data"]
        : Json::object();

    if (type == "session_snapshot") {
        bool changed = false;
        std::wstring realtimeStatus =
            foundry::json::wideValue(data, "realtimeStatus");
        std::wstring realtimeError =
            foundry::json::wideValue(data, "realtimeError");
        if (!realtimeStatus.empty()) {
            if (appState.realtimeStatus != realtimeStatus) {
                appState.realtimeStatus = realtimeStatus;
                changed = true;
            }
            std::wcout << L"[live] realtime status: "
                       << realtimeStatus << L"\n";
            g_liveRealtimeConnected.store(realtimeStatus == L"connected");
        }
        if (!realtimeError.empty()) {
            if (appState.realtimeError != realtimeError) {
                appState.realtimeError = realtimeError;
                changed = true;
            }
            std::wcout << L"[live] realtime error: "
                       << realtimeError << L"\n";
        } else if (!realtimeStatus.empty() && realtimeStatus != L"error") {
            if (!appState.realtimeError.empty()) {
                appState.realtimeError.clear();
                changed = true;
            }
        }
        changed = applyTranscriptRaw(appState, data) || changed;
        if (data.contains("topics")) {
            loadTopicsFromJson(appState, data["topics"], true);
            applyRealtimeTopicSnapshot(appState, data["topics"]);
            return true;
        }
        return changed;
    }
    if (type == "topic_checked") {
        Json topic = data.contains("topic") && data["topic"].is_object()
            ? data["topic"]
            : Json::object();
        std::wstring topicId = foundry::json::wideValue(topic, "id");
        std::wcout << L"[live] topic checked event"
                   << (topicId.empty() ? L"" : L" id=" + topicId)
                   << L"\n";
        return applyTopicUpdate(appState, topic);
    }
    if (type == "topic_updated") {
        Json topic = data.contains("topic") && data["topic"].is_object()
            ? data["topic"]
            : Json::object();
        return applyTopicUpdate(appState, topic);
    }
    if (type == "realtime_error") {
        bool changed = false;
        std::wstring message = foundry::json::wideValue(data, "message");
        if (!message.empty()) {
            if (appState.realtimeError != message) {
                appState.realtimeError = message;
                changed = true;
            }
            std::wcout << L"[live] realtime error: " << message << L"\n";
        }
        return changed;
    }
    if (type == "realtime_status") {
        bool changed = false;
        std::wstring status = foundry::json::wideValue(data, "status");
        std::wstring message = foundry::json::wideValue(data, "message");
        if (!status.empty()) {
            if (appState.realtimeStatus != status) {
                appState.realtimeStatus = status;
                changed = true;
            }
            std::wcout << L"[live] realtime status: " << status << L"\n";
            g_liveRealtimeConnected.store(status == L"connected");
        }
        if (!message.empty()) {
            if (appState.realtimeError != message) {
                appState.realtimeError = message;
                changed = true;
            }
            std::wcout << L"[live] realtime error: " << message << L"\n";
        } else if (!status.empty() && status != L"error") {
            if (!appState.realtimeError.empty()) {
                appState.realtimeError.clear();
                changed = true;
            }
        }
        return changed;
    }
    if (type == "transcript_turn") {
        return applyTranscriptRaw(appState, data);
    }
    return false;
}

}  // namespace

int main() {
    // If a second instance launches with a foundry:// URL (typical when the
    // Windows shell dispatches the protocol), forward the URL to the running
    // overlay via WM_COPYDATA and exit. CreateMutexW returns the same handle
    // either way; ERROR_ALREADY_EXISTS tells us another live process owns it.
    std::wstring initialDeepLink = extractDeepLinkFromCommandLine();
    HANDLE singleInstanceMutex =
        CreateMutexW(nullptr, FALSE, L"Foundry.Overlay.SingleInstance");
    if (singleInstanceMutex && GetLastError() == ERROR_ALREADY_EXISTS) {
        sendDeepLinkToExistingInstance(initialDeepLink);
        CloseHandle(singleInstanceMutex);
        return 0;
    }

    enableDpiAwareness();

    HRESULT hr = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    if (FAILED(hr)) {
        std::cerr << "CoInitializeEx failed: 0x" << std::hex << hr << "\n";
        if (singleInstanceMutex) CloseHandle(singleInstanceMutex);
        return 1;
    }

    bool overlaySettingsRequested = false;
    bool overlayBackRequested = false;
    bool overlayPickerBackRequested = false;
    bool overlaySignInRequested = false;
    bool overlayAuthSelfTestRequested = false;
    bool overlayClearAuthRequested = false;
    bool overlayResetPositionRequested = false;
    bool overlayStartRequested = false;
    bool overlayRefreshPeopleRequested = false;
    bool overlayEndRequested = false;
    bool overlaySaveEndRequested = false;
    bool overlayCancelEndRequested = false;
    int overlaySelectPersonRequested = -1;
    bool overlayMovedRequested = false;
    std::wstring overlayDeepLinkRequested;
    std::wstring pendingDeepLink;
    bool overlayDirty = true;
    bool overlaySettingsOpen = false;
    bool overlayPickerOpen = false;
    bool overlayEndOpen = false;
    bool overlayPersonDropdownOpen = false;
    bool overlayGoalsCollapsed = false;
    bool overlayQuestionsCollapsed = false;
    OverlayHoverTarget overlayHoverTarget = OverlayHoverTarget::None;
    int overlayHoverIndex = -1;
    unsigned int overlayScrollOffset = 0;
    unsigned int overlayPersonScrollOffset = 0;
    int overlayHeightDip = 0;
    std::wstring overlaySettingsStatus = L"Ready.";
    std::wstring overlayPickerStatus = L"Pick person for call.";
    std::wstring overlayEndStatus = L"Ready to save.";
    std::vector<OverlayPersonRow> overlayPeople;
    ULONGLONG nextLivePollTick = 0;

    foundry::AppState appState;
    appState.settings = readDesktopSettings();
    appState.authToken = readPersistedToken();

    SseClient liveEvents;
    BinaryWebSocketClient liveAudioSocket;
    MeetingAudioCapture meetingAudio;
    std::mutex liveEventMutex;
    std::vector<Json> pendingLiveEvents;

    OverlayActions overlayActions;
    overlayActions.onSettings = [&] { overlaySettingsRequested = true; };
    overlayActions.onBackFromSettings = [&] { overlayBackRequested = true; };
    overlayActions.onBackFromPicker = [&] { overlayPickerBackRequested = true; };
    overlayActions.onSignIn = [&] { overlaySignInRequested = true; };
    overlayActions.onAuthSelfTest = [&] {
        overlayAuthSelfTestRequested = true;
    };
    overlayActions.onClearAuth = [&] { overlayClearAuthRequested = true; };
    overlayActions.onResetOverlayPosition = [&] {
        overlayResetPositionRequested = true;
    };
    overlayActions.onSaveEndSession = [&] { overlaySaveEndRequested = true; };
    overlayActions.onCancelEndSession = [&] {
        overlayCancelEndRequested = true;
    };
    overlayActions.onTogglePersonDropdown = [&] {
        bool opening = !overlayPersonDropdownOpen;
        overlayPersonDropdownOpen = opening;
        if (opening && overlayPeople.empty() &&
            appState.sessionStatus == foundry::SessionStatus::Active &&
            !appState.authToken.empty()) {
            Json result = foundry::json::parseWide(peopleJson(appState));
            if (result.value("type", "") == "loadPeople") {
                overlayPeople = peopleRowsFromJson(result["people"]);
                overlayPersonScrollOffset = 0;
            }
        }
        overlayHoverTarget = OverlayHoverTarget::None;
        overlayHoverIndex = -1;
        overlayDirty = true;
    };
    overlayActions.onRefreshPeople = [&] {
        overlayRefreshPeopleRequested = true;
    };
    overlayActions.onToggleSection = [&](int sectionIndex) {
        if (sectionIndex == 0) {
            overlayGoalsCollapsed = !overlayGoalsCollapsed;
        } else if (sectionIndex == 1) {
            overlayQuestionsCollapsed = !overlayQuestionsCollapsed;
        }
        overlayScrollOffset = std::min<unsigned int>(
            overlayScrollOffset,
            foundry::overlay::maxChecklistScrollOffset(
                topicCountByCategory(appState, foundry::TopicCategory::Goal),
                topicCountByCategory(appState,
                                     foundry::TopicCategory::Question),
                overlayGoalsCollapsed, overlayQuestionsCollapsed,
                overlayHeightDip));
        overlayHoverTarget = OverlayHoverTarget::None;
        overlayHoverIndex = -1;
        overlayDirty = true;
    };
    overlayActions.onHoverChanged = [&](OverlayHoverTarget target, int index) {
        overlayHoverTarget = target;
        overlayHoverIndex = index;
        overlayDirty = true;
    };
    overlayActions.onStartSession = [&] { overlayStartRequested = true; };
    overlayActions.onEndSession = [&] { overlayEndRequested = true; };
    overlayActions.sessionActive = [&] {
        return appState.sessionStatus == foundry::SessionStatus::Active;
    };
    overlayActions.settingsOpen = [&] { return overlaySettingsOpen; };
    overlayActions.pickerOpen = [&] { return overlayPickerOpen; };
    overlayActions.endSessionOpen = [&] { return overlayEndOpen; };
    overlayActions.personDropdownOpen = [&] {
        return overlayPersonDropdownOpen;
    };
    overlayActions.onToggleTopic = [&](int visibleIndex) {
        if (visibleIndex < 0) return;
        std::vector<size_t> indices = visibleChecklistTopicIndices(
            appState, overlayGoalsCollapsed, overlayQuestionsCollapsed);
        size_t visible = static_cast<size_t>(visibleIndex);
        if (visible >= indices.size()) return;
        size_t topicIndex = indices[visible];
        appState.topics[topicIndex].checked =
            !appState.topics[topicIndex].checked;
        appState.topics[topicIndex].checkedBy = L"manual";
        appState.topics[topicIndex].checkedAt = isoNowUtc();
        appState.topics[topicIndex].evidence.clear();
        appState.topics[topicIndex].manualOverride = true;
        syncLiveTopicOverride(appState, appState.topics[topicIndex]);
        overlayDirty = true;
    };
    overlayActions.onSelectPerson = [&](int visibleIndex) {
        overlaySelectPersonRequested = visibleIndex;
    };
    overlayActions.onScroll = [&](int rowDelta) {
        if (rowDelta == 0) return;
        if (overlayPickerOpen) {
            unsigned int maxOffset = foundry::overlay::maxPersonScrollOffset(
                static_cast<unsigned int>(overlayPeople.size()),
                overlayHeightDip);
            long long next =
                static_cast<long long>(overlayPersonScrollOffset) + rowDelta;
            if (next < 0) next = 0;
            if (next > static_cast<long long>(maxOffset)) next = maxOffset;
            unsigned int clamped = static_cast<unsigned int>(next);
            if (clamped != overlayPersonScrollOffset) {
                overlayPersonScrollOffset = clamped;
                overlayHoverTarget = OverlayHoverTarget::None;
                overlayHoverIndex = -1;
                overlayDirty = true;
            }
            return;
        }
        unsigned int maxOffset = foundry::overlay::maxChecklistScrollOffset(
            topicCountByCategory(appState, foundry::TopicCategory::Goal),
            topicCountByCategory(appState, foundry::TopicCategory::Question),
            overlayGoalsCollapsed, overlayQuestionsCollapsed,
            overlayHeightDip);
        long long next =
            static_cast<long long>(overlayScrollOffset) + rowDelta;
        if (next < 0) next = 0;
        if (next > static_cast<long long>(maxOffset)) next = maxOffset;
        unsigned int clamped = static_cast<unsigned int>(next);
        if (clamped != overlayScrollOffset) {
            overlayScrollOffset = clamped;
            overlayDirty = true;
        }
    };
    overlayActions.goalCount = [&] {
        return topicCountByCategory(appState, foundry::TopicCategory::Goal);
    };
    overlayActions.questionCount = [&] {
        return topicCountByCategory(appState, foundry::TopicCategory::Question);
    };
    overlayActions.goalsCollapsed = [&] { return overlayGoalsCollapsed; };
    overlayActions.questionsCollapsed = [&] {
        return overlayQuestionsCollapsed;
    };
    overlayActions.checklistScrollOffset = [&] {
        return overlayScrollOffset;
    };
    overlayActions.visiblePersonCount = [&] {
        if (overlayPickerOpen) {
            unsigned int start = std::min<unsigned int>(
                overlayPersonScrollOffset,
                static_cast<unsigned int>(overlayPeople.size()));
            unsigned int remaining =
                static_cast<unsigned int>(overlayPeople.size()) - start;
            return std::min<unsigned int>(
                remaining,
                foundry::overlay::maxVisiblePersonRows(overlayHeightDip));
        }
        return static_cast<unsigned int>(
            std::min<size_t>(overlayPeople.size(), 4));
    };
    overlayActions.onMoved = [&] {
        overlayMovedRequested = true;
    };
    overlayActions.onDeepLink = [&](const std::wstring& url) {
        overlayDeepLinkRequested = url;
    };

    OverlayWindow overlay = createOverlayWindow(std::move(overlayActions));
    if (!overlay.hwnd) {
        CoUninitialize();
        if (singleInstanceMutex) CloseHandle(singleInstanceMutex);
        return 1;
    }
    overlayHeightDip = overlay.height;
    std::cout << "Overlay: visible checklist mode\n";
    if (appState.settings.hasOverlayPosition) {
        SetWindowPos(overlay.hwnd, HWND_TOPMOST,
                     appState.settings.overlayX,
                     appState.settings.overlayY,
                     0, 0, SWP_NOSIZE | SWP_NOACTIVATE);
    }

    ComPtr<ID3D11Device>        device;
    ComPtr<ID3D11DeviceContext> context;
    ComPtr<IDXGISwapChain>      swapChain;
    if (!createDeviceAndSwapChain(overlay, device, context, swapChain)) {
        CoUninitialize();
        if (singleInstanceMutex) CloseHandle(singleInstanceMutex);
        return 1;
    }

    // Browser-backed window is still needed for Clerk auth.
    std::unique_ptr<WebViewWindow> authWindow;
    bool authClosed = false;

    // End-session WebView2 window for transcript review & editing.
    std::unique_ptr<WebViewWindow> endSessionWindow;
    bool endSessionClosed = false;
    std::wstring endSessionTranscriptSource = L"none";
    std::wstring endSessionTranscriptStatus;

    TrayActions actions;
    auto openAuthWindow = [&] {
        if (focusIfOpen(authWindow)) return;
        authClosed = false;
        authWindow = std::make_unique<WebViewWindow>(
            L"User Interview Sign In", 720, 760, authUrl(appState),
            [&](const std::wstring& json) {
                Json msg = foundry::json::parseWide(json);
                std::string type = msg.value("type", "");
                std::cout << "[auth -> native] type=" << type << "\n";
                if (type == "desktopAuthToken") {
                    appState.authToken =
                        foundry::json::wideValue(msg, "token", L"");
                    if (!appState.authToken.empty()) {
                        writeToken(appState.authToken);
                        auto test = foundry::windows::http::get(
                            appState.settings.apiBaseUrl +
                                L"/api/desktop/auth-test",
                            appState.authToken);
                        std::cout << "[auth] token saved; auth-test status "
                                  << test.status << "\n";
                        overlaySettingsStatus = L"Signed in.";
                        overlayDirty = true;
                        if (authWindow && IsWindow(authWindow->hwnd())) {
                            DestroyWindow(authWindow->hwnd());
                        }
                        if (!pendingDeepLink.empty()) {
                            overlayDeepLinkRequested =
                                std::move(pendingDeepLink);
                            pendingDeepLink.clear();
                        }
                    }
                } else if (type == "desktopAuthError") {
                    overlaySettingsStatus =
                        L"Sign-in failed. Please try again.";
                    overlayDirty = true;
                }
            },
            [&] { authClosed = true; });
        authWindow->show();
    };

    auto loadPeopleIntoPicker = [&] {
        overlayPeople.clear();
        overlayPersonScrollOffset = 0;
        overlayPickerStatus = L"Loading people...";
        overlayDirty = true;

        Json result = foundry::json::parseWide(peopleJson(appState));
        std::string type = result.value("type", "");
        if (type == "loadPeople") {
            overlayPeople = peopleRowsFromJson(result["people"]);
            overlayPickerStatus = overlayPeople.empty()
                ? L"No people found."
                : L"Pick person for call.";
        } else {
            int status = result.value("status", 0);
            std::wstring message =
                foundry::json::wideValue(result, "message", L"Could not load people.");
            if (status == 401) {
                appState.authToken.clear();
                clearToken();
                overlayPickerOpen = false;
                overlaySettingsOpen = true;
                overlayPersonDropdownOpen = false;
                overlayHoverTarget = OverlayHoverTarget::None;
                overlayHoverIndex = -1;
                overlaySettingsStatus =
                    L"Auth expired. Sign in again.";
            } else {
                overlayPickerStatus = L"Could not load people. " + message;
            }
        }
        overlayDirty = true;
    };

    auto startLiveEvents = [&] {
        liveEvents.stop();
        if (appState.foundryBaseUrl.empty() ||
            appState.liveSessionId.empty() ||
            appState.liveToken.empty()) {
            return;
        }
        std::wstring base = appState.foundryBaseUrl;
        if (!base.empty() && base.back() == L'/') base.pop_back();
        std::wstring url = base + L"/v1/desktop/live-sessions/" +
                           appState.liveSessionId + L"/events";
        liveEvents.start(
            url, appState.liveToken,
            [&](const std::string& eventType, const std::string& data) {
                Json event = Json{
                    {"type", eventType},
                    {"data", foundry::json::parseUtf8(data, Json::object())},
                };
                std::lock_guard<std::mutex> lock(liveEventMutex);
                pendingLiveEvents.push_back(std::move(event));
            });
    };

    auto stopLiveAudio = [&] {
        meetingAudio.stop();
        meetingAudio.clearAccumulatedAudio();
        liveAudioSocket.close();
        g_liveRealtimeConnected.store(false);
    };

    auto startLiveAudio = [&] {
        stopLiveAudio();
        if (!appState.audioCaptureEnabled) {
            std::wcout << L"[live] local audio disabled for capture provider "
                       << appState.captureProvider << L"\n";
            return;
        }
        if (appState.foundryBaseUrl.empty() ||
            appState.liveSessionId.empty() ||
            appState.liveToken.empty()) {
            return;
        }
        std::wstring path = L"/v1/desktop/live-sessions/" +
                            appState.liveSessionId + L"/audio";
        std::wstring url =
            foundry::windows::http::webSocketUrlFromHttpBase(
                appState.foundryBaseUrl, path);
        std::wstring error;
        if (!liveAudioSocket.connect(url, appState.liveToken, error)) {
            std::wcout << L"[live] audio websocket failed: " << error
                       << L" — starting local-only capture for offline transcription\n";
            // Fallback: capture audio locally even without backend for Option A
        }
        auto sentChunks = std::make_shared<std::atomic<unsigned long long>>(0);
        auto failedChunks = std::make_shared<std::atomic<unsigned long long>>(0);
        auto skippedChunks = std::make_shared<std::atomic<unsigned long long>>(0);

        // Option A: enable audio accumulation for offline whisper.cpp transcription
        meetingAudio.setAccumulateAudio(true);

        if (!meetingAudio.start(
                [&, sentChunks, failedChunks, skippedChunks](
                    AudioSource source,
                    const std::vector<std::uint8_t>& chunk) {
                    if (!g_liveRealtimeConnected.load()) {
                        unsigned long long count = ++(*skippedChunks);
                        if (count == 1 || count == 25 || count == 100 ||
                            count % 500 == 0) {
                            std::wcout << L"[live] audio waiting for realtime chunks="
                                       << count << L"\n";
                        }
                        return;
                    }
                    std::vector<std::uint8_t> frame =
                        taggedAudioFrame(source, chunk);
                    bool sent = liveAudioSocket.sendBinary(frame);
                    if (sent) {
                        unsigned long long count = ++(*sentChunks);
                        if (count == 1 || count == 25 || count == 100 ||
                            count % 500 == 0) {
                            std::wcout << L"[live] audio sent chunks="
                                       << count << L"\n";
                        }
                    } else {
                        unsigned long long count = ++(*failedChunks);
                        if (count == 1 || count == 25 || count == 100 ||
                            count % 500 == 0) {
                            std::wcout << L"[live] audio send failed chunks="
                                       << count << L"\n";
                        }
                    }
                },
                error)) {
            std::wcout << L"[live] audio capture failed: " << error << L"\n";
            liveAudioSocket.close();
            return;
        }
        std::wcout << L"[live] audio capture started\n";
    };

    auto startSession = [&] {
        appState.settings.apiBaseUrl = readApiBaseUrl();
        if (appState.authToken.empty()) {
            overlayPickerOpen = false;
            overlaySettingsOpen = true;
            overlayPersonDropdownOpen = false;
            overlayHoverTarget = OverlayHoverTarget::None;
            overlayHoverIndex = -1;
            overlaySettingsStatus = L"Sign in before starting a session.";
            overlayDirty = true;
            return;
        }
        if (appState.sessionStatus == foundry::SessionStatus::Active) {
            overlaySettingsOpen = false;
            overlayPickerOpen = false;
            overlayEndOpen = true;
            overlayPersonDropdownOpen = false;
            overlayEndStatus = L"Opening transcript review...";
            overlayHoverTarget = OverlayHoverTarget::None;
            overlayHoverIndex = -1;
            overlayDirty = true;
            return;
        }
        appState.sessionStatus = foundry::SessionStatus::PickingPerson;
        overlayPickerOpen = true;
        overlaySettingsOpen = false;
        overlayPersonDropdownOpen = false;
        overlayGoalsCollapsed = false;
        overlayQuestionsCollapsed = false;
        overlayHoverTarget = OverlayHoverTarget::None;
        overlayHoverIndex = -1;
        overlayPeople.clear();
        overlayPersonScrollOffset = 0;
        overlayPickerStatus = L"Loading people...";
        overlayDirty = true;
        loadPeopleIntoPicker();
    };

    // Apply a foundry://call/start?personId=...&token=... URL.
    // Mirrors the picker → startLiveSession path but skips the picker UI.
    // If auth is missing or expired, queues the URL into pendingDeepLink so
    // the auth window's success callback can retry once the token lands.
    auto applyDeepLink = [&](const std::wstring& url) {
        auto link = parseFoundryUrl(url);
        if (!link || link->action != L"call/start" ||
            link->personId.empty() || link->token.empty()) {
            std::wcout << L"[deeplink] ignoring malformed URL\n";
            return;
        }

        ShowWindow(overlay.hwnd, SW_SHOWNOACTIVATE);
        SetForegroundWindow(overlay.hwnd);

        if (appState.authToken.empty()) {
            pendingDeepLink = url;
            overlaySettingsOpen = true;
            overlayPickerOpen = false;
            overlayEndOpen = false;
            overlayPersonDropdownOpen = false;
            overlayHoverTarget = OverlayHoverTarget::None;
            overlayHoverIndex = -1;
            overlaySettingsStatus = L"Sign in to start the call.";
            overlayDirty = true;
            openAuthWindow();
            return;
        }

        if (appState.sessionStatus == foundry::SessionStatus::Active) {
            std::wcout << L"[deeplink] ignoring; session already active for "
                       << appState.selectedPersonId << L"\n";
            return;
        }

        Json result = foundry::json::parseWide(
            startLiveSession(
                appState,
                link->personId,
                L"",
                link->token,
                link->zoomMeetingIdentifier));
        std::string type = result.value("type", "");
        if (type == "sessionSelected") {
            appState.sessionStatus = foundry::SessionStatus::Active;
            appState.sessionStartedAt = isoNowUtc();
            nextLivePollTick = 0;
            startLiveEvents();
            startLiveAudio();
            overlayPickerOpen = false;
            overlaySettingsOpen = false;
            overlayEndOpen = false;
            overlayPersonDropdownOpen = false;
            overlayGoalsCollapsed = false;
            overlayQuestionsCollapsed = false;
            overlayScrollOffset = 0;
            overlayPersonScrollOffset = 0;
            overlayHoverTarget = OverlayHoverTarget::None;
            overlayHoverIndex = -1;
            overlayDirty = true;
        } else {
            int status = result.value("status", 0);
            std::wstring message = foundry::json::wideValue(
                result, "message", L"Could not load brief.");
            if (status == 401) {
                appState.authToken.clear();
                clearToken();
                pendingDeepLink = url;
                overlaySettingsOpen = true;
                overlayPickerOpen = false;
                overlayEndOpen = false;
                overlaySettingsStatus = L"Auth expired. Sign in again.";
                overlayDirty = true;
                openAuthWindow();
            } else {
                overlaySettingsOpen = true;
                overlayPickerOpen = false;
                overlayEndOpen = false;
                overlaySettingsStatus = message;
                overlayDirty = true;
            }
        }
    };

    // Open end-session WebView2 window for transcript review.
    // Option C (fastapi): transcript fetched from FastAPI backend.
    // Option A (whisper): transcript from local whisper.cpp (fallback).
    auto openEndSessionWindow = [&] {
        if (focusIfOpen(endSessionWindow)) return;
        endSessionClosed = false;
        overlayEndOpen = false;  // WebView replaces the Direct2D end-session page

        // --- Option C: fetch transcript from FastAPI ---
        endSessionTranscriptSource = L"none";
        endSessionTranscriptStatus.clear();
        if (!appState.liveSessionId.empty() && !appState.liveToken.empty() &&
            !appState.foundryBaseUrl.empty()) {
            refreshLiveSessionSnapshot(appState, true);
            if (!appState.liveTranscriptRaw.empty()) {
                endSessionTranscriptSource = L"fastapi";
            } else {
                endSessionTranscriptStatus = L"FastAPI transcript not available. "
                    L"You can paste or type notes below.";
            }
        }

        // --- Option A: try local whisper.cpp as fallback ---
        if (endSessionTranscriptSource == L"none") {
            meetingAudio.stop();
            std::vector<std::uint8_t> accumulated = meetingAudio.getAccumulatedAudio();
            if (!accumulated.empty()) {
                std::wstring sessionsDir = foundry::windows::appDataDir().wstring() +
                    L"\\sessions";
                std::wstring wavFile = L"session_" +
                    appState.sessionStartedAt.substr(0, 10) + L"_" +
                    appState.sessionStartedAt.substr(11, 8) + L".wav";
                // Replace colons for filename safety
                for (auto& ch : wavFile) {
                    if (ch == L':') ch = L'-';
                }
                std::wstring wavPath = meetingAudio.writeWavFile(sessionsDir, wavFile);
                if (!wavPath.empty()) {
                    std::wcout << L"[whisper] WAV written: " << wavPath << L"\n";
                    std::wstring whisperTranscript = runWhisperTranscription(wavPath);
                    if (!whisperTranscript.empty()) {
                        appState.liveTranscriptRaw = whisperTranscript;
                        endSessionTranscriptSource = L"whisper";
                        endSessionTranscriptStatus.clear();
                        std::wcout << L"[whisper] transcript generated ("
                                   << whisperTranscript.size() << L" chars)\n";
                    } else {
                        endSessionTranscriptStatus =
                            L"whisper.cpp not available or failed. "
                            L"Install whisper-cli.exe + ggml-base.en.bin next to the app.";
                    }
                }
            }
            meetingAudio.clearAccumulatedAudio();
        }

        std::wstring htmlUrl = endSessionHtmlPath();
        endSessionWindow = std::make_unique<WebViewWindow>(
            L"User Interview - End Session", 640, 700, htmlUrl,
            [&](const std::wstring& json) {
                Json msg = foundry::json::parseWide(json);
                std::string type = msg.value("type", "");
                std::cout << "[endsession -> native] type=" << type << "\n";

                if (type == "endSessionReady") {
                    endSessionWindow->postMessageToJs(
                        endSessionJson(appState,
                                       endSessionTranscriptSource,
                                       endSessionTranscriptStatus));
                } else if (type == "saveSession") {
                    std::wstring transcriptRaw =
                        foundry::json::wideValue(msg, "transcriptRaw", L"");
                    Json result = saveEndSession(appState, transcriptRaw);
                    endSessionWindow->postMessageToJs(
                        foundry::json::dumpWide(result));
                    std::string resultType = result.value("type", "");
                    if (resultType == "saveSucceeded") {
                        stopLiveAudio();
                        liveEvents.stop();
                        nextLivePollTick = 0;
                        overlayEndOpen = false;
                        overlayPersonDropdownOpen = false;
                        overlayScrollOffset = 0;
                        overlayEndStatus = L"Ready to save.";
                        overlayDirty = true;
                    }
                } else if (type == "cancelEndSession") {
                    if (endSessionWindow && IsWindow(endSessionWindow->hwnd())) {
                        DestroyWindow(endSessionWindow->hwnd());
                    }
                    overlayEndOpen = false;
                    overlayPersonDropdownOpen = false;
                    overlayHoverTarget = OverlayHoverTarget::None;
                    overlayHoverIndex = -1;
                    overlayDirty = true;
                }
            },
            [&] { endSessionClosed = true; });
        endSessionWindow->show();
    };

    actions.onStartSession = startSession;
    actions.onSettings = [&] { overlaySettingsRequested = true; };
    actions.onQuit = [] {
        PostQuitMessage(0);
    };

    TrayIcon tray(std::move(actions));
    if (!tray.valid()) {
        CoUninitialize();
        if (singleInstanceMutex) CloseHandle(singleInstanceMutex);
        return 1;
    }

    std::cout << "Tray icon active. Right-click for menu.\n";

    if (!initialDeepLink.empty()) {
        overlayDeepLinkRequested = std::move(initialDeepLink);
        initialDeepLink.clear();
    }

    MSG msg{};
    for (;;) {
        while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) {
            if (msg.message == WM_QUIT) goto exit;
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        if (authClosed) {
            authWindow.reset();
            authClosed = false;
        }
        if (endSessionClosed) {
            endSessionWindow.reset();
            endSessionClosed = false;
            overlayEndOpen = false;
            overlayDirty = true;
        }
        {
            std::vector<Json> events;
            {
                std::lock_guard<std::mutex> lock(liveEventMutex);
                events.swap(pendingLiveEvents);
            }
            for (const auto& event : events) {
                if (applyLiveEvent(appState, event)) {
                    overlayDirty = true;
                }
            }
        }
        if (appState.sessionStatus == foundry::SessionStatus::Active &&
            !appState.liveSessionId.empty()) {
            ULONGLONG now = GetTickCount64();
            if (nextLivePollTick == 0 || now >= nextLivePollTick) {
                if (pollLiveSession(appState)) {
                    overlayDirty = true;
                }
                nextLivePollTick = now + 1000;
            }
        } else {
            nextLivePollTick = 0;
        }
        if (overlaySettingsRequested) {
            overlaySettingsOpen = true;
            overlayPickerOpen = false;
            overlayEndOpen = false;
            overlayPersonDropdownOpen = false;
            overlayHoverTarget = OverlayHoverTarget::None;
            overlayHoverIndex = -1;
            overlaySettingsStatus = appState.authToken.empty()
                ? L"Sign in before starting a session."
                : L"Ready.";
            overlayDirty = true;
            overlaySettingsRequested = false;
        }
        if (overlayBackRequested) {
            overlaySettingsOpen = false;
            overlayPersonDropdownOpen = false;
            overlayHoverTarget = OverlayHoverTarget::None;
            overlayHoverIndex = -1;
            overlayDirty = true;
            overlayBackRequested = false;
        }
        if (overlayPickerBackRequested) {
            overlayPickerOpen = false;
            overlayPersonDropdownOpen = false;
            overlayPersonScrollOffset = 0;
            overlayHoverTarget = OverlayHoverTarget::None;
            overlayHoverIndex = -1;
            if (appState.sessionStatus == foundry::SessionStatus::PickingPerson) {
                appState.sessionStatus = foundry::SessionStatus::Idle;
            }
            overlayDirty = true;
            overlayPickerBackRequested = false;
        }
        if (overlaySignInRequested) {
            overlaySettingsStatus = L"Opening sign-in...";
            overlayDirty = true;
            openAuthWindow();
            overlaySignInRequested = false;
        }
        if (overlayAuthSelfTestRequested) {
            overlaySettingsStatus = L"Checking auth...";
            overlayDirty = true;
            Json result = foundry::json::parseWide(authSelfTestJson(appState));
            bool ok = result.value("ok", false);
            int status = result.value("status", 0);
            std::wstring message =
                foundry::json::wideValue(result, "message", L"");
            overlaySettingsStatus = ok
                ? (L"Auth OK (" + std::to_wstring(status) + L").")
                : (L"Auth failed (" + std::to_wstring(status) + L"): " +
                   message);
            overlayDirty = true;
            overlayAuthSelfTestRequested = false;
        }
        if (overlayClearAuthRequested) {
            appState.authToken.clear();
            clearToken();
            overlaySettingsStatus = L"Auth cleared.";
            overlayDirty = true;
            overlayClearAuthRequested = false;
        }
        if (overlayResetPositionRequested) {
            appState.settings.hasOverlayPosition = false;
            appState.settings.overlayX = 0;
            appState.settings.overlayY = 0;
            writeDesktopSettings(appState.settings);
            POINT pt = defaultOverlayPoint(overlay.width, overlay.height);
            SetWindowPos(overlay.hwnd, HWND_TOPMOST, pt.x, pt.y, 0, 0,
                         SWP_NOSIZE | SWP_NOACTIVATE);
            overlaySettingsStatus = L"Overlay position reset.";
            overlayDirty = true;
            overlayResetPositionRequested = false;
        }
        if (overlayStartRequested) {
            startSession();
            overlayStartRequested = false;
        }
        if (overlayRefreshPeopleRequested) {
            if (appState.authToken.empty()) {
                overlayPickerOpen = false;
                overlaySettingsOpen = true;
                overlaySettingsStatus = L"Sign in before starting a session.";
            } else {
                loadPeopleIntoPicker();
            }
            overlayHoverTarget = OverlayHoverTarget::None;
            overlayHoverIndex = -1;
            overlayDirty = true;
            overlayRefreshPeopleRequested = false;
        }
        if (overlaySelectPersonRequested >= 0) {
            size_t index = static_cast<size_t>(overlaySelectPersonRequested);
            if (overlayPickerOpen) {
                index += overlayPersonScrollOffset;
            }
            if (index < overlayPeople.size()) {
                overlayPickerStatus = L"Loading brief...";
                overlayDirty = true;
                const OverlayPersonRow person = overlayPeople[index];
                Json result = foundry::json::parseWide(
                    startLiveSession(appState, person.id, person.name, L"", L""));
                std::string type = result.value("type", "");
                if (type == "sessionSelected") {
                    appState.sessionStatus = foundry::SessionStatus::Active;
                    appState.sessionStartedAt = isoNowUtc();
                    nextLivePollTick = 0;
                    startLiveEvents();
                    startLiveAudio();
                    overlayPickerOpen = false;
                    overlayHoverTarget = OverlayHoverTarget::None;
                    overlayHoverIndex = -1;
                    overlayPersonDropdownOpen = false;
                    overlayGoalsCollapsed = false;
                    overlayQuestionsCollapsed = false;
                    overlayScrollOffset = 0;
                    overlayPersonScrollOffset = 0;
                } else {
                    int status = result.value("status", 0);
                    std::wstring message =
                        foundry::json::wideValue(result, "message",
                                                 L"Could not load brief.");
                    if (status == 401) {
                        appState.authToken.clear();
                        clearToken();
                        overlayPickerOpen = false;
                        overlaySettingsOpen = true;
                        overlayPersonDropdownOpen = false;
                        overlayHoverTarget = OverlayHoverTarget::None;
                        overlayHoverIndex = -1;
                        overlaySettingsStatus =
                            L"Auth expired. Sign in again.";
                    } else {
                        overlayPickerStatus = message;
                    }
                }
                overlayDirty = true;
            }
            overlaySelectPersonRequested = -1;
        }
        if (overlayEndRequested) {
            if (appState.sessionStatus == foundry::SessionStatus::Active) {
                overlaySettingsOpen = false;
                overlayPickerOpen = false;
                overlayEndOpen = false;  // WebView handles end session, not overlay
                overlayPersonDropdownOpen = false;
                overlayEndStatus = L"Opening transcript review...";
                overlayHoverTarget = OverlayHoverTarget::None;
                overlayHoverIndex = -1;
                overlayDirty = true;
                openEndSessionWindow();
            }
            overlayEndRequested = false;
        }
        if (overlayCancelEndRequested) {
            if (endSessionWindow && IsWindow(endSessionWindow->hwnd())) {
                DestroyWindow(endSessionWindow->hwnd());
            }
            overlayEndOpen = false;
            overlayPersonDropdownOpen = false;
            overlayHoverTarget = OverlayHoverTarget::None;
            overlayHoverIndex = -1;
            overlayDirty = true;
            overlayCancelEndRequested = false;
        }
        // If end session was triggered via tray without going through
        // overlayEndRequested, open the WebView now.
        if (overlayEndOpen &&
            appState.sessionStatus == foundry::SessionStatus::Active &&
            (!endSessionWindow || !IsWindow(endSessionWindow->hwnd()))) {
            openEndSessionWindow();
        }
        if (overlaySaveEndRequested) {
            overlayEndStatus = L"Saving call...";
            overlayDirty = true;
            Json result = saveEndSession(appState, appState.liveTranscriptRaw);
            std::string type = result.value("type", "");
            if (type == "saveSucceeded") {
                stopLiveAudio();
                liveEvents.stop();
                nextLivePollTick = 0;
                overlayEndOpen = false;
                overlayPersonDropdownOpen = false;
                overlayScrollOffset = 0;
                overlayEndStatus = L"Ready to save.";
            } else {
                std::wstring message =
                    foundry::json::wideValue(result, "message",
                                             L"Could not save call.");
                overlayEndStatus = message;
            }
            overlayHoverTarget = OverlayHoverTarget::None;
            overlayHoverIndex = -1;
            overlayDirty = true;
            overlaySaveEndRequested = false;
        }
        if (overlayMovedRequested) {
            RECT rc{};
            GetWindowRect(overlay.hwnd, &rc);
            appState.settings.hasOverlayPosition = true;
            appState.settings.overlayX = rc.left;
            appState.settings.overlayY = rc.top;
            writeDesktopSettings(appState.settings);
            std::cout << "[overlay] moved to " << rc.left << ","
                      << rc.top << "\n";
            overlayMovedRequested = false;
        }
        if (!overlayDeepLinkRequested.empty()) {
            std::wstring url = std::move(overlayDeepLinkRequested);
            overlayDeepLinkRequested.clear();
            std::wcout << L"[deeplink] applying URL\n";
            applyDeepLink(url);
        }
        if (overlayDirty) {
            renderOverlay(swapChain.Get(),
                          overlayRenderState(
                              appState, overlayScrollOffset,
                              overlayPersonScrollOffset,
                              overlaySettingsOpen
                                  ? OverlayPage::Settings
                                  : (overlayPickerOpen
                                         ? OverlayPage::PersonPicker
                                         : (overlayEndOpen
                                                ? OverlayPage::EndSession
                                                : OverlayPage::Notepad)),
                              overlayHoverTarget, overlayHoverIndex,
                              overlayPersonDropdownOpen,
                              overlayGoalsCollapsed,
                              overlayQuestionsCollapsed,
                              overlaySettingsStatus, overlayPickerStatus,
                              overlayEndStatus,
                              overlayPeople));
            swapChain->Present(1, 0);
            overlayDirty = false;
        }
        MsgWaitForMultipleObjectsEx(0, nullptr, 100, QS_ALLINPUT,
                                    MWMO_INPUTAVAILABLE);
    }

exit:
    stopLiveAudio();
    liveEvents.stop();
    authWindow.reset();
    endSessionWindow.reset();
    releaseRendererResources();
    CoUninitialize();
    if (singleInstanceMutex) CloseHandle(singleInstanceMutex);
    return 0;
}
