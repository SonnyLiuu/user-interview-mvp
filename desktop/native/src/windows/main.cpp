// foundry_overlay.exe — Phase 2.
//
// Single native exe managing:
//   • Tray icon (Shell_NotifyIcon)
//   • Overlay window (Direct2D, hidden from screen capture)
//   • Settings window (WebView2)
//
// One thread, one COM apartment, one message pump dispatching for all windows.
// Render of the overlay is paced by Present(1, 0) on each idle iteration.

#include <windows.h>
#include <d3d11.h>
#include <dxgi.h>
#include <wrl/client.h>
#include <objbase.h>
#include <algorithm>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#include <memory>
#include <string>

#include "common/app_state.h"
#include "common/json_util.h"
#include "windows/app_paths.h"
#include "windows/http/http_client.h"
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

namespace {

using foundry::json::Json;

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
    if (!base.empty() && base.back() == L'/') base.pop_back();
    return base;
}

std::wstring authSelfTestJson(foundry::AppState& appState) {
    std::wstring url = apiBaseNoSlash(appState) + L"/api/desktop/auth-test";

    auto response = foundry::windows::http::get(url, appState.authToken);
    std::wstring message = response.error.empty()
                               ? foundry::json::fromUtf8(response.body.substr(0, 300))
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
                                   ? foundry::json::fromUtf8(response.body.substr(0, 300))
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

std::wstring loadCallBrief(foundry::AppState& appState,
                           const std::wstring& personId,
                           const std::wstring& personName) {
    std::wstring url = apiBaseNoSlash(appState) +
                       L"/api/desktop/people/" + personId + L"/call-brief";
    auto response = foundry::windows::http::get(url, appState.authToken);
    if (!response.ok) {
        std::wstring message = response.error.empty()
                                   ? foundry::json::fromUtf8(response.body.substr(0, 300))
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

std::wstring endSessionJson(const foundry::AppState& appState) {
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
              {"topics", topics}}},
    });
}

std::wstring buildNotesSummary(const foundry::AppState& appState);

Json endSessionPayload(const foundry::AppState& appState,
                       const std::wstring& transcriptRaw) {
    Json topics = Json::array();
    for (const auto& topic : appState.topics) {
        topics.push_back(Json{
            {"id", foundry::json::toUtf8(topic.id)},
            {"label", foundry::json::toUtf8(topic.label)},
            {"checked", topic.checked},
        });
    }
    return Json{
        {"personId", foundry::json::toUtf8(appState.selectedPersonId)},
        {"startedAt", foundry::json::toUtf8(appState.sessionStartedAt)},
        {"endedAt", foundry::json::toUtf8(isoNowUtc())},
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
    std::wstring url = apiBaseNoSlash(appState) + L"/api/desktop/sessions/end";
    auto response = foundry::windows::http::postJson(
        url, foundry::json::dumpUtf8(endSessionPayload(appState, transcriptRaw)),
        appState.authToken);
    if (!response.ok) {
        std::wstring message = response.error.empty()
                                   ? foundry::json::fromUtf8(response.body.substr(0, 500))
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

OverlayRenderState overlayRenderState(const foundry::AppState& appState,
                                      unsigned int scrollOffset,
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
    state.apiBaseUrl = appState.settings.apiBaseUrl;
    state.settingsStatus = settingsStatus;
    state.pickerStatus = pickerStatus;
    state.endSessionStatus = endSessionStatus;
    state.selectedPersonName = appState.selectedPersonName;
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

}  // namespace

int main() {
    enableDpiAwareness();

    HRESULT hr = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    if (FAILED(hr)) {
        std::cerr << "CoInitializeEx failed: 0x" << std::hex << hr << "\n";
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
    int overlayHeightDip = 0;
    std::wstring overlaySettingsStatus = L"Ready.";
    std::wstring overlayPickerStatus = L"Pick person for call.";
    std::wstring overlayEndStatus = L"Ready to save.";
    std::vector<OverlayPersonRow> overlayPeople;

    foundry::AppState appState;
    appState.settings = readDesktopSettings();
    appState.authToken = readPersistedToken();

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
        overlayDirty = true;
    };
    overlayActions.onSelectPerson = [&](int visibleIndex) {
        overlaySelectPersonRequested = visibleIndex;
    };
    overlayActions.onScroll = [&](int rowDelta) {
        if (rowDelta == 0) return;
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
        return static_cast<unsigned int>(
            std::min<size_t>(overlayPeople.size(), 4));
    };
    overlayActions.onMoved = [&] {
        overlayMovedRequested = true;
    };

    OverlayWindow overlay = createOverlayWindow(std::move(overlayActions));
    if (!overlay.hwnd) {
        CoUninitialize();
        return 1;
    }
    overlayHeightDip = overlay.height;
    std::cout << "Overlay: "
              << (overlay.excludedFromCapture
                  ? "excluded from capture"
                  : "WARNING: NOT excluded")
              << "\n";
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
        return 1;
    }

    // Browser-backed window is still needed for Clerk auth.
    std::unique_ptr<WebViewWindow> authWindow;
    bool authClosed = false;

    TrayActions actions;
    auto openAuthWindow = [&] {
        if (focusIfOpen(authWindow)) return;
        authClosed = false;
        authWindow = std::make_unique<WebViewWindow>(
            L"Foundry Sign In", 720, 760, authUrl(appState),
            [&](const std::wstring& json) {
                std::wcout << L"[auth -> native] " << json << L"\n";
                Json msg = foundry::json::parseWide(json);
                std::string type = msg.value("type", "");
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
            overlayEndStatus = L"Ready to save.";
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
        overlayPickerStatus = L"Loading people...";
        overlayDirty = true;
        loadPeopleIntoPicker();
    };

    actions.onStartSession = startSession;
    actions.onSettings = [&] { overlaySettingsRequested = true; };
    actions.onQuit = [] {
        PostQuitMessage(0);
    };

    TrayIcon tray(std::move(actions));
    if (!tray.valid()) {
        CoUninitialize();
        return 1;
    }

    std::cout << "Tray icon active. Right-click for menu.\n";

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
            if (index < overlayPeople.size()) {
                overlayPickerStatus = L"Loading brief...";
                overlayDirty = true;
                const OverlayPersonRow person = overlayPeople[index];
                Json result = foundry::json::parseWide(
                    loadCallBrief(appState, person.id, person.name));
                std::string type = result.value("type", "");
                if (type == "sessionSelected") {
                    appState.sessionStatus = foundry::SessionStatus::Active;
                    appState.sessionStartedAt = isoNowUtc();
                    overlayPickerOpen = false;
                    overlayHoverTarget = OverlayHoverTarget::None;
                    overlayHoverIndex = -1;
                    overlayPersonDropdownOpen = false;
                    overlayGoalsCollapsed = false;
                    overlayQuestionsCollapsed = false;
                    overlayScrollOffset = 0;
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
                overlayEndOpen = true;
                overlayPersonDropdownOpen = false;
                overlayEndStatus = L"Ready to save.";
                overlayHoverTarget = OverlayHoverTarget::None;
                overlayHoverIndex = -1;
                overlayDirty = true;
            }
            overlayEndRequested = false;
        }
        if (overlayCancelEndRequested) {
            overlayEndOpen = false;
            overlayPersonDropdownOpen = false;
            overlayHoverTarget = OverlayHoverTarget::None;
            overlayHoverIndex = -1;
            overlayDirty = true;
            overlayCancelEndRequested = false;
        }
        if (overlaySaveEndRequested) {
            overlayEndStatus = L"Saving call...";
            overlayDirty = true;
            Json result = saveEndSession(appState, L"");
            std::string type = result.value("type", "");
            if (type == "saveSucceeded") {
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
        if (overlayDirty) {
            renderOverlay(swapChain.Get(),
                          overlayRenderState(
                              appState, overlayScrollOffset,
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
        MsgWaitForMultipleObjectsEx(0, nullptr, INFINITE, QS_ALLINPUT,
                                    MWMO_INPUTAVAILABLE);
    }

exit:
    authWindow.reset();
    releaseRendererResources();
    CoUninitialize();
    return 0;
}
