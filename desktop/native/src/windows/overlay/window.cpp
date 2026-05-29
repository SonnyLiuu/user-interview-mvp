#include "window.h"

#include "renderer.h"

#include <windowsx.h>
#include <iostream>
#include <utility>

namespace foundry::overlay {

namespace {

constexpr int kSettingsButton = 1001;
constexpr int kEndButton = 1002;
constexpr int kStartButton = 1003;

struct OverlayWindowState {
    OverlayActions actions;
    bool dragging = false;
    bool trackingMouse = false;
    OverlayHoverTarget hoverTarget = OverlayHoverTarget::None;
    int hoverIndex = -1;
    POINT dragStart{};
    RECT startRect{};
};

int scale(int value) {
    return MulDiv(value, GetDpiForSystem(), 96);
}

RECT settingsButtonRect(HWND hwnd) {
    RECT rc{};
    GetClientRect(hwnd, &rc);
    int size = 34;
    int margin = 10;
    return RECT{rc.right - size - margin, rc.bottom - size - margin,
                rc.right - margin, rc.bottom - margin};
}

RECT endButtonRect(HWND hwnd) {
    RECT rc{};
    GetClientRect(hwnd, &rc);
    int w = 72;
    int h = 30;
    int margin = 10;
    return RECT{margin, rc.bottom - h - margin, margin + w, rc.bottom - margin};
}

RECT startButtonRect(HWND hwnd) {
    return endButtonRect(hwnd);
}

RECT backButtonRect(HWND hwnd) {
    (void)hwnd;
    int left = 10;
    int top = 7;
    return RECT{left, top, left + 42, top + 32};
}

RECT signInButtonRect(HWND hwnd) {
    (void)hwnd;
    int left = 16;
    int top = 168;
    return RECT{left, top, left + 138, top + 34};
}

RECT authSelfTestButtonRect(HWND hwnd) {
    (void)hwnd;
    int left = 166;
    int top = 168;
    return RECT{left, top, left + 158, top + 34};
}

RECT clearAuthButtonRect(HWND hwnd) {
    (void)hwnd;
    int left = 16;
    int top = 214;
    return RECT{left, top, left + 138, top + 34};
}

RECT resetOverlayButtonRect(HWND hwnd) {
    (void)hwnd;
    int left = 166;
    int top = 214;
    return RECT{left, top, left + 158, top + 34};
}

RECT saveEndButtonRect(HWND hwnd) {
    RECT rc{};
    GetClientRect(hwnd, &rc);
    int w = 138;
    int h = 34;
    int left = rc.right - w - 16;
    int top = rc.bottom - h - 16;
    return RECT{left, top, left + w, top + h};
}

RECT cancelEndButtonRect(HWND hwnd) {
    RECT rc{};
    GetClientRect(hwnd, &rc);
    int w = 118;
    int h = 34;
    int left = rc.right - w - 166;
    int top = rc.bottom - h - 16;
    return RECT{left, top, left + w, top + h};
}

RECT personDropdownButtonRect(HWND hwnd) {
    RECT rc{};
    GetClientRect(hwnd, &rc);
    int w = 146;
    int h = 30;
    int left = rc.right - w - 12;
    int top = 8;
    return RECT{left, top, left + w, top + h};
}

RECT personDropdownRowRect(HWND hwnd, int index) {
    RECT button = personDropdownButtonRect(hwnd);
    int top = button.bottom + 6 + index * 42;
    return RECT{button.left, top, button.right, top + 38};
}

RECT refreshPeopleButtonRect(HWND hwnd) {
    RECT rc{};
    GetClientRect(hwnd, &rc);
    int w = 86;
    int h = 30;
    int left = rc.right - w - 16;
    int top = 64;
    return RECT{left, top, left + w, top + h};
}

bool pointInRect(POINT pt, const RECT& rc) {
    return pt.x >= rc.left && pt.x < rc.right &&
           pt.y >= rc.top && pt.y < rc.bottom;
}

OverlayWindowState* stateFor(HWND hwnd) {
    return reinterpret_cast<OverlayWindowState*>(
        GetWindowLongPtrW(hwnd, GWLP_USERDATA));
}

void setHover(OverlayWindowState* state, OverlayHoverTarget target, int index) {
    if (!state) return;
    if (state->hoverTarget == target && state->hoverIndex == index) return;
    state->hoverTarget = target;
    state->hoverIndex = index;
    if (state->actions.onHoverChanged) {
        state->actions.onHoverChanged(target, index);
    }
}

void updateHover(HWND hwnd, OverlayWindowState* state, POINT pt) {
    if (!state) return;
    bool settingsOpen = state->actions.settingsOpen
        ? state->actions.settingsOpen()
        : false;
    bool pickerOpen = state->actions.pickerOpen
        ? state->actions.pickerOpen()
        : false;
    bool endSessionOpen = state->actions.endSessionOpen
        ? state->actions.endSessionOpen()
        : false;
    bool dropdownOpen = state->actions.personDropdownOpen
        ? state->actions.personDropdownOpen()
        : false;
    if (settingsOpen) {
        if (pointInRect(pt, backButtonRect(hwnd))) {
            setHover(state, OverlayHoverTarget::Back, -1);
        } else if (pointInRect(pt, signInButtonRect(hwnd))) {
            setHover(state, OverlayHoverTarget::SignIn, -1);
        } else if (pointInRect(pt, authSelfTestButtonRect(hwnd))) {
            setHover(state, OverlayHoverTarget::AuthSelfTest, -1);
        } else if (pointInRect(pt, clearAuthButtonRect(hwnd))) {
            setHover(state, OverlayHoverTarget::ClearAuth, -1);
        } else if (pointInRect(pt, resetOverlayButtonRect(hwnd))) {
            setHover(state, OverlayHoverTarget::ResetOverlay, -1);
        } else {
            setHover(state, OverlayHoverTarget::None, -1);
        }
        return;
    }
    if (pickerOpen) {
        if (pointInRect(pt, backButtonRect(hwnd))) {
            setHover(state, OverlayHoverTarget::Back, -1);
            return;
        }
        if (pointInRect(pt, refreshPeopleButtonRect(hwnd))) {
            setHover(state, OverlayHoverTarget::RefreshPeople, -1);
            return;
        }
        unsigned int visibleCount = state->actions.visiblePersonCount
            ? state->actions.visiblePersonCount()
            : 0;
        int personIndex = personIndexAtPoint(pt.x, pt.y, visibleCount);
        if (personIndex >= 0) {
            setHover(state, OverlayHoverTarget::PersonRow, personIndex);
        } else {
            setHover(state, OverlayHoverTarget::None, -1);
        }
        return;
    }
    if (endSessionOpen) {
        if (pointInRect(pt, backButtonRect(hwnd)) ||
            pointInRect(pt, cancelEndButtonRect(hwnd))) {
            setHover(state, OverlayHoverTarget::CancelEndSession, -1);
        } else if (pointInRect(pt, saveEndButtonRect(hwnd))) {
            setHover(state, OverlayHoverTarget::SaveEndSession, -1);
        } else {
            setHover(state, OverlayHoverTarget::None, -1);
        }
        return;
    }
    if (pointInRect(pt, settingsButtonRect(hwnd))) {
        setHover(state, OverlayHoverTarget::Settings, -1);
        return;
    }
    if (state->actions.sessionActive && state->actions.sessionActive()) {
        if (pointInRect(pt, personDropdownButtonRect(hwnd))) {
            setHover(state, OverlayHoverTarget::PersonDropdown, -1);
            return;
        }
        if (dropdownOpen) {
            unsigned int visibleCount = state->actions.visiblePersonCount
                ? state->actions.visiblePersonCount()
                : 0;
            for (unsigned int i = 0; i < visibleCount; ++i) {
                if (pointInRect(pt, personDropdownRowRect(hwnd,
                                                          static_cast<int>(i)))) {
                    setHover(state, OverlayHoverTarget::PersonRow,
                             static_cast<int>(i));
                    return;
                }
            }
        }
    }
    if (pointInRect(pt, endButtonRect(hwnd))) {
        setHover(state, OverlayHoverTarget::StartEnd, -1);
        return;
    }
    unsigned int goals = state->actions.goalCount ? state->actions.goalCount() : 0;
    unsigned int questions =
        state->actions.questionCount ? state->actions.questionCount() : 0;
    bool goalsCollapsed = state->actions.goalsCollapsed
        ? state->actions.goalsCollapsed()
        : false;
    bool questionsCollapsed = state->actions.questionsCollapsed
        ? state->actions.questionsCollapsed()
        : false;
    unsigned int scrollOffset = state->actions.checklistScrollOffset
        ? state->actions.checklistScrollOffset()
        : 0;
    int sectionIndex = topicSectionAtPoint(pt.x, pt.y, goals, questions,
                                           goalsCollapsed, questionsCollapsed,
                                           scrollOffset);
    if (sectionIndex == 0) {
        setHover(state, OverlayHoverTarget::GoalSection, -1);
        return;
    }
    if (sectionIndex == 1) {
        setHover(state, OverlayHoverTarget::QuestionSection, -1);
        return;
    }
    int topicIndex = topicIndexAtPoint(pt.x, pt.y, goals, questions,
                                       goalsCollapsed, questionsCollapsed,
                                       scrollOffset);
    if (topicIndex >= 0) {
        setHover(state, OverlayHoverTarget::TopicRow, topicIndex);
    } else {
        setHover(state, OverlayHoverTarget::None, -1);
    }
}

LRESULT CALLBACK overlayWndProc(HWND hwnd, UINT msg, WPARAM w, LPARAM l) {
    OverlayWindowState* state = stateFor(hwnd);

    switch (msg) {
        case WM_NCCREATE: {
            auto* cs = reinterpret_cast<CREATESTRUCTW*>(l);
            SetWindowLongPtrW(hwnd, GWLP_USERDATA,
                              reinterpret_cast<LONG_PTR>(cs->lpCreateParams));
            return TRUE;
        }
        case WM_DESTROY:
            delete state;
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
            PostQuitMessage(0);
            return 0;
        case WM_NCHITTEST:
            return HTCLIENT;
        case WM_LBUTTONDOWN: {
            if (!state) return 0;
            POINT pt{GET_X_LPARAM(l), GET_Y_LPARAM(l)};
            bool settingsOpen = state->actions.settingsOpen
                ? state->actions.settingsOpen()
                : false;
            bool pickerOpen = state->actions.pickerOpen
                ? state->actions.pickerOpen()
                : false;
            bool endSessionOpen = state->actions.endSessionOpen
                ? state->actions.endSessionOpen()
                : false;
            if (settingsOpen) {
                if (pointInRect(pt, backButtonRect(hwnd))) {
                    if (state->actions.onBackFromSettings) {
                        state->actions.onBackFromSettings();
                    }
                    return 0;
                }
                if (pointInRect(pt, signInButtonRect(hwnd))) {
                    if (state->actions.onSignIn) state->actions.onSignIn();
                    return 0;
                }
                if (pointInRect(pt, authSelfTestButtonRect(hwnd))) {
                    if (state->actions.onAuthSelfTest) {
                        state->actions.onAuthSelfTest();
                    }
                    return 0;
                }
                if (pointInRect(pt, clearAuthButtonRect(hwnd))) {
                    if (state->actions.onClearAuth) state->actions.onClearAuth();
                    return 0;
                }
                if (pointInRect(pt, resetOverlayButtonRect(hwnd))) {
                    if (state->actions.onResetOverlayPosition) {
                        state->actions.onResetOverlayPosition();
                    }
                    return 0;
                }
                if (pt.y <= 46) {
                    state->dragging = true;
                    SetCapture(hwnd);
                    GetCursorPos(&state->dragStart);
                    GetWindowRect(hwnd, &state->startRect);
                }
                return 0;
            }
            if (endSessionOpen) {
                if (pointInRect(pt, backButtonRect(hwnd)) ||
                    pointInRect(pt, cancelEndButtonRect(hwnd))) {
                    if (state->actions.onCancelEndSession) {
                        state->actions.onCancelEndSession();
                    }
                    return 0;
                }
                if (pointInRect(pt, saveEndButtonRect(hwnd))) {
                    if (state->actions.onSaveEndSession) {
                        state->actions.onSaveEndSession();
                    }
                    return 0;
                }
                if (pt.y <= 46) {
                    state->dragging = true;
                    SetCapture(hwnd);
                    GetCursorPos(&state->dragStart);
                    GetWindowRect(hwnd, &state->startRect);
                }
                return 0;
            }
            if (pickerOpen) {
                if (pointInRect(pt, backButtonRect(hwnd))) {
                    if (state->actions.onBackFromPicker) {
                        state->actions.onBackFromPicker();
                    }
                    return 0;
                }
                if (pointInRect(pt, refreshPeopleButtonRect(hwnd))) {
                    if (state->actions.onRefreshPeople) {
                        state->actions.onRefreshPeople();
                    }
                    return 0;
                }
                unsigned int visibleCount = state->actions.visiblePersonCount
                    ? state->actions.visiblePersonCount()
                    : 0;
                int personIndex = personIndexAtPoint(pt.x, pt.y, visibleCount);
                if (personIndex >= 0) {
                    if (state->actions.onSelectPerson) {
                        state->actions.onSelectPerson(personIndex);
                    }
                    return 0;
                }
                if (pt.y <= 46) {
                    state->dragging = true;
                    SetCapture(hwnd);
                    GetCursorPos(&state->dragStart);
                    GetWindowRect(hwnd, &state->startRect);
                }
                return 0;
            }

            if (pointInRect(pt, settingsButtonRect(hwnd))) {
                if (state->actions.onSettings) state->actions.onSettings();
                return 0;
            }

            bool sessionActive = state->actions.sessionActive
                ? state->actions.sessionActive()
                : false;
            if (sessionActive && pointInRect(pt, personDropdownButtonRect(hwnd))) {
                if (state->actions.onTogglePersonDropdown) {
                    state->actions.onTogglePersonDropdown();
                }
                return 0;
            }
            bool dropdownOpen = state->actions.personDropdownOpen
                ? state->actions.personDropdownOpen()
                : false;
            if (sessionActive && dropdownOpen) {
                unsigned int visibleCount = state->actions.visiblePersonCount
                    ? state->actions.visiblePersonCount()
                    : 0;
                for (unsigned int i = 0; i < visibleCount; ++i) {
                    if (pointInRect(pt, personDropdownRowRect(
                                            hwnd, static_cast<int>(i)))) {
                        if (state->actions.onSelectPerson) {
                            state->actions.onSelectPerson(static_cast<int>(i));
                        }
                        return 0;
                    }
                }
                if (state->actions.onTogglePersonDropdown) {
                    state->actions.onTogglePersonDropdown();
                }
                return 0;
            }
            if (pointInRect(pt, endButtonRect(hwnd))) {
                if (sessionActive || !state->actions.onStartSession) {
                    if (state->actions.onEndSession) state->actions.onEndSession();
                } else {
                    state->actions.onStartSession();
                }
                return 0;
            }

            unsigned int goals =
                state->actions.goalCount ? state->actions.goalCount() : 0;
            unsigned int questions = state->actions.questionCount
                ? state->actions.questionCount()
                : 0;
            bool goalsCollapsed = state->actions.goalsCollapsed
                ? state->actions.goalsCollapsed()
                : false;
            bool questionsCollapsed = state->actions.questionsCollapsed
                ? state->actions.questionsCollapsed()
                : false;
            unsigned int scrollOffset = state->actions.checklistScrollOffset
                ? state->actions.checklistScrollOffset()
                : 0;
            int sectionIndex = topicSectionAtPoint(
                pt.x, pt.y, goals, questions, goalsCollapsed,
                questionsCollapsed, scrollOffset);
            if (sectionIndex >= 0) {
                if (state->actions.onToggleSection) {
                    state->actions.onToggleSection(sectionIndex);
                }
                return 0;
            }
            int topicIndex = topicIndexAtPoint(pt.x, pt.y, goals, questions,
                                               goalsCollapsed,
                                               questionsCollapsed,
                                               scrollOffset);
            if (topicIndex >= 0) {
                if (state->actions.onToggleTopic) {
                    state->actions.onToggleTopic(topicIndex);
                }
                return 0;
            }

            if (pt.y <= 46) {
                state->dragging = true;
                SetCapture(hwnd);
                GetCursorPos(&state->dragStart);
                GetWindowRect(hwnd, &state->startRect);
            }
            return 0;
        }
        case WM_MOUSEMOVE:
            if (state && !state->trackingMouse) {
                TRACKMOUSEEVENT tme{};
                tme.cbSize = sizeof(tme);
                tme.dwFlags = TME_LEAVE;
                tme.hwndTrack = hwnd;
                state->trackingMouse = TrackMouseEvent(&tme) == TRUE;
            }
            if (state && !state->dragging) {
                POINT pt{GET_X_LPARAM(l), GET_Y_LPARAM(l)};
                updateHover(hwnd, state, pt);
            }
            if (state && state->dragging) {
                POINT now{};
                GetCursorPos(&now);
                int dx = now.x - state->dragStart.x;
                int dy = now.y - state->dragStart.y;
                SetWindowPos(hwnd, HWND_TOPMOST,
                             state->startRect.left + dx,
                             state->startRect.top + dy,
                             0, 0, SWP_NOSIZE | SWP_NOACTIVATE);
            }
            return 0;
        case WM_MOUSELEAVE:
            if (state) {
                state->trackingMouse = false;
                setHover(state, OverlayHoverTarget::None, -1);
            }
            return 0;
        case WM_LBUTTONUP:
            if (state && state->dragging) {
                state->dragging = false;
                ReleaseCapture();
                if (state->actions.onMoved) state->actions.onMoved();
            }
            return 0;
        case WM_MOUSEWHEEL: {
            if (!state || !state->actions.onScroll) return 0;
            bool settingsOpen = state->actions.settingsOpen
                ? state->actions.settingsOpen()
                : false;
            bool endSessionOpen = state->actions.endSessionOpen
                ? state->actions.endSessionOpen()
                : false;
            if (settingsOpen || endSessionOpen) return 0;
            int delta = GET_WHEEL_DELTA_WPARAM(w);
            if (delta == 0) return 0;
            // Wheel forward (positive) → show earlier rows → negative rowDelta.
            int rowDelta = -delta / WHEEL_DELTA;
            if (rowDelta == 0) rowDelta = delta > 0 ? -1 : 1;
            state->actions.onScroll(rowDelta);
            return 0;
        }
        case WM_SETCURSOR:
            SetCursor(LoadCursor(
                nullptr,
                state && state->hoverTarget != OverlayHoverTarget::None
                    ? IDC_HAND
                    : IDC_ARROW));
            return TRUE;
        case WM_COPYDATA: {
            auto* cds = reinterpret_cast<COPYDATASTRUCT*>(l);
            if (!cds || cds->dwData != kDeepLinkCopyDataId) break;
            if (cds->cbData == 0 || cds->cbData % sizeof(wchar_t) != 0) {
                return TRUE;
            }
            const auto* data = reinterpret_cast<const wchar_t*>(cds->lpData);
            std::wstring url(data, cds->cbData / sizeof(wchar_t));
            while (!url.empty() && url.back() == L'\0') url.pop_back();
            if (state && state->actions.onDeepLink && !url.empty()) {
                state->actions.onDeepLink(url);
            }
            return TRUE;
        }
    }
    return DefWindowProcW(hwnd, msg, w, l);
}

}  // namespace

OverlayWindow createOverlayWindow(OverlayActions actions) {
    OverlayWindow result;
    HINSTANCE hinst = GetModuleHandleW(nullptr);

    WNDCLASSEXW wc{};
    wc.cbSize = sizeof(wc);
    wc.style = CS_HREDRAW | CS_VREDRAW;
    wc.lpfnWndProc = overlayWndProc;
    wc.hInstance = hinst;
    wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
    wc.lpszClassName = kOverlayWindowClass;

    if (!RegisterClassExW(&wc) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) {
        std::cerr << "RegisterClassExW failed: " << GetLastError() << "\n";
        return result;
    }

    const POINT anchor{0, 0};
    HMONITOR monitor = MonitorFromPoint(anchor, MONITOR_DEFAULTTOPRIMARY);
    MONITORINFO mi{};
    mi.cbSize = sizeof(mi);
    if (!GetMonitorInfoW(monitor, &mi)) {
        std::cerr << "GetMonitorInfoW failed: " << GetLastError() << "\n";
        return result;
    }

    const UINT dpi = GetDpiForSystem();
    const int width  = MulDiv(340, dpi, 96);
    const int height = MulDiv(420, dpi, 96);
    const int margin = MulDiv(24, dpi, 96);

    // Position top-right of the primary monitor work area, so taskbars and
    // common high-DPI laptop setups do not push the overlay somewhere odd.
    int x = mi.rcWork.right - width - margin;
    int y = mi.rcWork.top + margin;

    auto* state = new OverlayWindowState{};
    state->actions = std::move(actions);

    HWND hwnd = CreateWindowExW(
        WS_EX_TOPMOST | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW,
        kOverlayWindowClass,
        L"Foundry Overlay",
        WS_POPUP,
        x, y, width, height,
        nullptr, nullptr, hinst, state);

    if (!hwnd) {
        std::cerr << "CreateWindowExW failed: " << GetLastError() << "\n";
        delete state;
        return result;
    }

    // Core of the pivot: tell DWM to omit this window from screen capture.
    // Requires Windows 10 version 2004 (build 19041) or newer.
    if (SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)) {
        result.excludedFromCapture = true;
    } else {
        std::cerr << "SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE) failed: "
                  << GetLastError()
                  << " — overlay will be visible in screen shares.\n";
    }

    ShowWindow(hwnd, SW_SHOWNOACTIVATE);
    UpdateWindow(hwnd);

    result.hwnd = hwnd;
    result.width = width;
    result.height = height;
    return result;
}

}  // namespace foundry::overlay
