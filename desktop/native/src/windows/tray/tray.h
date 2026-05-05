#pragma once
#include <windows.h>
#include <shellapi.h>
#include <functional>

namespace foundry::tray {

struct TrayActions {
    std::function<void()> onStartSession;
    std::function<void()> onSettings;
    std::function<void()> onQuit;
};

// Owns a hidden message-only window that hosts the tray icon and routes
// the right-click context menu commands to the supplied callbacks.
//
// Construct once at app startup. Destruction removes the icon.
class TrayIcon {
public:
    explicit TrayIcon(TrayActions actions);
    ~TrayIcon();

    TrayIcon(const TrayIcon&) = delete;
    TrayIcon& operator=(const TrayIcon&) = delete;

    bool valid() const { return hwnd_ != nullptr; }

private:
    static LRESULT CALLBACK wndProc(HWND, UINT, WPARAM, LPARAM);
    LRESULT handleMessage(HWND, UINT, WPARAM, LPARAM);
    void showContextMenu();

    HWND hwnd_ = nullptr;
    HICON icon_ = nullptr;
    bool ownsIcon_ = false;
    NOTIFYICONDATAW nid_{};
    TrayActions actions_;
};

}  // namespace foundry::tray
