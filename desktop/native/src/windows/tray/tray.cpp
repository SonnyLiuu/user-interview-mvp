#include "tray.h"

#include <iostream>

namespace foundry::tray {

namespace {

constexpr UINT WM_TRAY_NOTIFY = WM_USER + 1;
constexpr UINT TRAY_ICON_ID   = 1;

constexpr UINT CMD_START_SESSION = 1001;
constexpr UINT CMD_SETTINGS      = 1002;
constexpr UINT CMD_QUIT          = 1003;

constexpr const wchar_t* kClassName = L"FoundryTrayMessageWindow";

HICON createFoundryIcon() {
    constexpr int size = 16;
    HDC screen = GetDC(nullptr);
    HDC dc = CreateCompatibleDC(screen);
    HBITMAP color = CreateCompatibleBitmap(screen, size, size);
    HBITMAP old = static_cast<HBITMAP>(SelectObject(dc, color));

    RECT rc{0, 0, size, size};
    HBRUSH bg = CreateSolidBrush(RGB(38, 38, 38));
    FillRect(dc, &rc, bg);
    DeleteObject(bg);

    HPEN pen = CreatePen(PS_SOLID, 1, RGB(220, 70, 55));
    HGDIOBJ oldPen = SelectObject(dc, pen);
    HGDIOBJ oldBrush = SelectObject(dc, GetStockObject(NULL_BRUSH));
    Rectangle(dc, 1, 1, size - 1, size - 1);
    SelectObject(dc, oldBrush);
    SelectObject(dc, oldPen);
    DeleteObject(pen);

    SetBkMode(dc, TRANSPARENT);
    SetTextColor(dc, RGB(245, 245, 245));
    HFONT font = CreateFontW(13, 0, 0, 0, FW_BOLD, FALSE, FALSE, FALSE,
                             DEFAULT_CHARSET, OUT_DEFAULT_PRECIS,
                             CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
                             DEFAULT_PITCH | FF_SWISS, L"Segoe UI");
    HGDIOBJ oldFont = SelectObject(dc, font);
    DrawTextW(dc, L"F", 1, &rc, DT_CENTER | DT_VCENTER | DT_SINGLELINE);
    SelectObject(dc, oldFont);
    DeleteObject(font);

    SelectObject(dc, old);

    HBITMAP mask = CreateBitmap(size, size, 1, 1, nullptr);
    ICONINFO ii{};
    ii.fIcon = TRUE;
    ii.hbmColor = color;
    ii.hbmMask = mask;
    HICON icon = CreateIconIndirect(&ii);

    DeleteObject(mask);
    DeleteObject(color);
    DeleteDC(dc);
    ReleaseDC(nullptr, screen);
    return icon;
}

}  // namespace

TrayIcon::TrayIcon(TrayActions actions) : actions_(std::move(actions)) {
    HINSTANCE hinst = GetModuleHandleW(nullptr);

    WNDCLASSEXW wc{};
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = wndProc;
    wc.hInstance = hinst;
    wc.lpszClassName = kClassName;

    if (!RegisterClassExW(&wc) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) {
        std::cerr << "Tray: RegisterClassExW failed: " << GetLastError() << "\n";
        return;
    }

    // Hidden top-level window — never shown, just a message recipient
    // for WM_TRAY_NOTIFY and WM_COMMAND from the popup menu.
    // (HWND_MESSAGE was rejected with ERROR_INVALID_WINDOW_HANDLE on this
    // configuration; an unshown WS_POPUP window works identically for our
    // purposes.)
    hwnd_ = CreateWindowExW(WS_EX_TOOLWINDOW, kClassName, L"FoundryTray",
                            WS_POPUP, 0, 0, 0, 0,
                            nullptr, nullptr, hinst, this);
    if (!hwnd_) {
        std::cerr << "Tray: CreateWindowExW failed: " << GetLastError() << "\n";
        return;
    }

    nid_.cbSize = sizeof(nid_);
    nid_.hWnd = hwnd_;
    nid_.uID = TRAY_ICON_ID;
    nid_.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
    nid_.uCallbackMessage = WM_TRAY_NOTIFY;
    icon_ = createFoundryIcon();
    ownsIcon_ = icon_ != nullptr;
    if (!icon_) icon_ = LoadIcon(nullptr, IDI_APPLICATION);
    nid_.hIcon = icon_;
    wcscpy_s(nid_.szTip, L"User Interview Notetaker");

    if (!Shell_NotifyIconW(NIM_ADD, &nid_)) {
        std::cerr << "Tray: Shell_NotifyIcon(NIM_ADD) failed: "
                  << GetLastError() << "\n";
    }
}

TrayIcon::~TrayIcon() {
    if (hwnd_) {
        Shell_NotifyIconW(NIM_DELETE, &nid_);
        DestroyWindow(hwnd_);
    }
    if (ownsIcon_ && icon_) DestroyIcon(icon_);
}

LRESULT CALLBACK TrayIcon::wndProc(HWND hwnd, UINT msg, WPARAM w, LPARAM l) {
    TrayIcon* self = nullptr;
    if (msg == WM_NCCREATE) {
        auto* cs = reinterpret_cast<CREATESTRUCTW*>(l);
        self = static_cast<TrayIcon*>(cs->lpCreateParams);
        SetWindowLongPtrW(hwnd, GWLP_USERDATA,
                          reinterpret_cast<LONG_PTR>(self));
    } else {
        self = reinterpret_cast<TrayIcon*>(
            GetWindowLongPtrW(hwnd, GWLP_USERDATA));
    }
    if (self) return self->handleMessage(hwnd, msg, w, l);
    return DefWindowProcW(hwnd, msg, w, l);
}

LRESULT TrayIcon::handleMessage(HWND hwnd, UINT msg, WPARAM w, LPARAM l) {
    switch (msg) {
        case WM_TRAY_NOTIFY: {
            UINT mouseEvent = LOWORD(l);
            if (mouseEvent == WM_RBUTTONUP || mouseEvent == WM_LBUTTONUP) {
                showContextMenu();
            }
            return 0;
        }
        case WM_COMMAND: {
            switch (LOWORD(w)) {
                case CMD_START_SESSION:
                    if (actions_.onStartSession) actions_.onStartSession();
                    break;
                case CMD_SETTINGS:
                    if (actions_.onSettings) actions_.onSettings();
                    break;
                case CMD_QUIT:
                    if (actions_.onQuit) actions_.onQuit();
                    break;
            }
            return 0;
        }
    }
    return DefWindowProcW(hwnd, msg, w, l);
}

void TrayIcon::showContextMenu() {
    POINT pt;
    GetCursorPos(&pt);

    HMENU menu = CreatePopupMenu();
    AppendMenuW(menu, MF_STRING, CMD_START_SESSION, L"Start Session");
    AppendMenuW(menu, MF_STRING, CMD_SETTINGS,      L"Settings");
    AppendMenuW(menu, MF_SEPARATOR, 0, nullptr);
    AppendMenuW(menu, MF_STRING, CMD_QUIT,          L"Quit");

    // Foreground window dance: required for popup menus from tray icons,
    // otherwise the menu doesn't dismiss on outside clicks.
    SetForegroundWindow(hwnd_);
    TrackPopupMenu(menu,
                   TPM_RIGHTBUTTON | TPM_BOTTOMALIGN | TPM_RIGHTALIGN,
                   pt.x, pt.y, 0, hwnd_, nullptr);
    PostMessageW(hwnd_, WM_NULL, 0, 0);
    DestroyMenu(menu);
}

}  // namespace foundry::tray
