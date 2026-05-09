#pragma once

#include <string>
#include <vector>

namespace foundry {

enum class SessionStatus {
    Idle,
    PickingPerson,
    Active,
};

enum class TopicCategory {
    Goal,
    Question,
    Signal,
};

struct Topic {
    std::wstring id;
    std::wstring label;
    TopicCategory category = TopicCategory::Goal;
    bool checked = false;
    std::wstring checkedBy;
    std::wstring checkedAt;
    std::wstring evidence;
    bool manualOverride = false;
};

struct DesktopSettings {
    std::wstring apiBaseUrl = L"http://localhost:3000";
    bool hasOverlayPosition = false;
    int overlayX = 0;
    int overlayY = 0;
};

struct AppState {
    SessionStatus sessionStatus = SessionStatus::Idle;
    DesktopSettings settings;
    std::wstring authToken;
    std::wstring selectedPersonId;
    std::wstring selectedPersonName;
    std::wstring sessionStartedAt;
    std::wstring liveSessionId;
    std::wstring liveToken;
    std::wstring foundryBaseUrl;
    std::vector<Topic> topics;
};

}  // namespace foundry
