#include "webview_window.h"

#include <WebView2.h>
#include <wrl/event.h>
#include <shlobj.h>
#include <iostream>
#include <filesystem>

using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;

namespace foundry::webview {

namespace {

constexpr const wchar_t* kClassName = L"FoundryWebViewWindow";

std::wstring userDataFolder() {
    wchar_t local[MAX_PATH] = {0};
    SHGetFolderPathW(nullptr, CSIDL_LOCAL_APPDATA, nullptr, 0, local);
    std::filesystem::path p = std::filesystem::path(local) / L"foundry" / L"webview2";
    std::filesystem::create_directories(p);
    return p.wstring();
}

bool registerClassOnce() {
    static bool registered = false;
    if (registered) return true;
    HINSTANCE hinst = GetModuleHandleW(nullptr);
    WNDCLASSEXW wc{};
    wc.cbSize = sizeof(wc);
    wc.style = CS_HREDRAW | CS_VREDRAW;
    wc.lpfnWndProc = WebViewWindow::wndProc;
    wc.hInstance = hinst;
    wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
    wc.hbrBackground = reinterpret_cast<HBRUSH>(COLOR_WINDOW + 1);
    wc.lpszClassName = kClassName;
    if (!RegisterClassExW(&wc) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) {
        return false;
    }
    registered = true;
    return true;
}

}  // namespace

WebViewWindow::WebViewWindow(std::wstring title, int w, int h,
                             std::wstring url, MessageHandler om,
                             CloseHandler oc)
    : title_(std::move(title)), width_(w), height_(h),
      initialUrl_(std::move(url)), onMessage_(std::move(om)),
      onClosed_(std::move(oc)) {}

WebViewWindow::~WebViewWindow() {
    if (controller_) controller_->Close();
    if (hwnd_) DestroyWindow(hwnd_);
}

bool WebViewWindow::show() {
    if (!registerClassOnce()) return false;

    HINSTANCE hinst = GetModuleHandleW(nullptr);
    hwnd_ = CreateWindowExW(
        0, kClassName, title_.c_str(),
        WS_OVERLAPPEDWINDOW,
        CW_USEDEFAULT, CW_USEDEFAULT, width_, height_,
        nullptr, nullptr, hinst, this);

    if (!hwnd_) {
        std::cerr << "WebViewWindow: CreateWindowExW failed: "
                  << GetLastError() << "\n";
        return false;
    }

    ShowWindow(hwnd_, SW_SHOWNORMAL);
    UpdateWindow(hwnd_);
    initWebView();
    return true;
}

void WebViewWindow::postMessageToJs(const std::wstring& json) {
    if (webView_) {
        webView_->PostWebMessageAsJson(json.c_str());
    } else {
        // Buffer a single pending message; sufficient for the spike. If we
        // need a full queue later, replace with std::deque.
        pendingMessage_ = json;
        hasPending_ = true;
    }
}

void WebViewWindow::flushPending() {
    if (hasPending_ && webView_) {
        webView_->PostWebMessageAsJson(pendingMessage_.c_str());
        pendingMessage_.clear();
        hasPending_ = false;
    }
}

void WebViewWindow::initWebView() {
    std::wstring userData = userDataFolder();

    auto envCallback = Callback<
        ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
        [this](HRESULT hr, ICoreWebView2Environment* env) -> HRESULT {
            if (FAILED(hr) || !env) {
                std::wcerr << L"WebView2: env create failed hr=" << std::hex
                           << hr << L"\n";
                MessageBoxW(hwnd_,
                            L"User Interview Settings requires the Microsoft Edge WebView2 Runtime.",
                            L"WebView2 unavailable", MB_OK | MB_ICONERROR);
                return hr;
            }
            auto controllerCallback = Callback<
                ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                [this](HRESULT hr, ICoreWebView2Controller* ctrl) -> HRESULT {
                    if (FAILED(hr) || !ctrl) {
                        std::wcerr << L"WebView2: controller failed hr="
                                   << std::hex << hr << L"\n";
                        MessageBoxW(hwnd_,
                                    L"User Interview could not start the settings window. Please check the WebView2 Runtime.",
                                    L"WebView2 unavailable",
                                    MB_OK | MB_ICONERROR);
                        return hr;
                    }
                    controller_ = ctrl;
                    controller_->get_CoreWebView2(&webView_);

                    EventRegistrationToken token;
                    webView_->add_WebMessageReceived(
                        Callback<ICoreWebView2WebMessageReceivedEventHandler>(
                            [this](ICoreWebView2*,
                                   ICoreWebView2WebMessageReceivedEventArgs* args)
                                -> HRESULT {
                                LPWSTR raw = nullptr;
                                if (SUCCEEDED(args->get_WebMessageAsJson(&raw))
                                    && raw) {
                                    if (onMessage_) onMessage_(raw);
                                    CoTaskMemFree(raw);
                                }
                                return S_OK;
                            }).Get(), &token);

                    resizeWebView();
                    webView_->Navigate(initialUrl_.c_str());
                    flushPending();
                    return S_OK;
                });

            return env->CreateCoreWebView2Controller(hwnd_,
                                                     controllerCallback.Get());
        });

    HRESULT hr = CreateCoreWebView2EnvironmentWithOptions(
        nullptr, userData.c_str(), nullptr, envCallback.Get());
    if (FAILED(hr)) {
        std::wcerr << L"CreateCoreWebView2EnvironmentWithOptions failed hr="
                   << std::hex << hr
                   << L" — is the WebView2 Runtime installed?\n";
        MessageBoxW(hwnd_,
                    L"User Interview Settings requires the Microsoft Edge WebView2 Runtime.",
                    L"WebView2 unavailable", MB_OK | MB_ICONERROR);
    }
}

void WebViewWindow::resizeWebView() {
    if (!controller_) return;
    RECT rc;
    GetClientRect(hwnd_, &rc);
    controller_->put_Bounds(rc);
}

LRESULT CALLBACK WebViewWindow::wndProc(HWND hwnd, UINT msg,
                                        WPARAM w, LPARAM l) {
    WebViewWindow* self = nullptr;
    if (msg == WM_NCCREATE) {
        auto* cs = reinterpret_cast<CREATESTRUCTW*>(l);
        self = static_cast<WebViewWindow*>(cs->lpCreateParams);
        SetWindowLongPtrW(hwnd, GWLP_USERDATA,
                          reinterpret_cast<LONG_PTR>(self));
        if (self) self->hwnd_ = hwnd;
    } else {
        self = reinterpret_cast<WebViewWindow*>(
            GetWindowLongPtrW(hwnd, GWLP_USERDATA));
    }
    if (self) return self->handleMessage(hwnd, msg, w, l);
    return DefWindowProcW(hwnd, msg, w, l);
}

LRESULT WebViewWindow::handleMessage(HWND hwnd, UINT msg,
                                     WPARAM w, LPARAM l) {
    switch (msg) {
        case WM_SIZE:
            resizeWebView();
            return 0;
        case WM_CLOSE:
            DestroyWindow(hwnd);
            return 0;
        case WM_DESTROY:
            // Window closed by user. We do NOT post WM_QUIT — the app
            // continues running with the tray icon. The owner of this
            // WebViewWindow is responsible for releasing it.
            hwnd_ = nullptr;
            if (onClosed_) onClosed_();
            return 0;
    }
    return DefWindowProcW(hwnd, msg, w, l);
}

}  // namespace foundry::webview
