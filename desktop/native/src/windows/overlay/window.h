#pragma once
#include <windows.h>
#include <functional>

#include "renderer.h"

namespace foundry::overlay {

struct OverlayActions {
    std::function<void()> onSettings;
    std::function<void()> onBackFromSettings;
    std::function<void()> onBackFromPicker;
    std::function<void()> onSignIn;
    std::function<void()> onAuthSelfTest;
    std::function<void()> onClearAuth;
    std::function<void()> onResetOverlayPosition;
    std::function<void()> onSaveEndSession;
    std::function<void()> onCancelEndSession;
    std::function<void()> onTogglePersonDropdown;
    std::function<void()> onRefreshPeople;
    std::function<void(int)> onToggleSection;
    std::function<void(OverlayHoverTarget, int)> onHoverChanged;
    std::function<void()> onStartSession;
    std::function<void()> onEndSession;
    std::function<void()> onMoved;
    // Toggle a topic row by its visible-window index (0..visibleTopicCount-1).
    // The host is responsible for adding the current scroll offset to map back
    // to the underlying topic.
    std::function<void(int)> onToggleTopic;
    std::function<void(int)> onSelectPerson;
    // Scroll the topic list. Positive rowDelta scrolls down (later rows).
    std::function<void(int)> onScroll;
    std::function<bool()> sessionActive;
    std::function<bool()> settingsOpen;
    std::function<bool()> pickerOpen;
    std::function<bool()> endSessionOpen;
    std::function<bool()> personDropdownOpen;
    std::function<unsigned int()> goalCount;
    std::function<unsigned int()> questionCount;
    std::function<bool()> goalsCollapsed;
    std::function<bool()> questionsCollapsed;
    std::function<unsigned int()> checklistScrollOffset;
    std::function<unsigned int()> visiblePersonCount;
};

struct OverlayWindow {
    HWND hwnd = nullptr;
    int  width = 0;
    int  height = 0;
    bool excludedFromCapture = false;
};

// Creates a borderless, topmost notepad overlay positioned in the top-right of
// the primary monitor. Applies WDA_EXCLUDEFROMCAPTURE so the window is omitted
// from screen-capture APIs (Zoom share, Teams, Meet, PrintWindow, BitBlt of
// the desktop).
//
// Returns OverlayWindow with hwnd == nullptr on failure.
OverlayWindow createOverlayWindow(OverlayActions actions = {});

}  // namespace foundry::overlay
