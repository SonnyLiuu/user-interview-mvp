#pragma once
#include <windows.h>
#include <wrl/client.h>
#include <functional>
#include <string>

struct ICoreWebView2;
struct ICoreWebView2Controller;

namespace foundry::webview {

// Generic Win32 frame hosting a WebView2 control. Bidirectional bridge to
// JS via PostWebMessageAsJson (native → JS) and the WebMessageReceived
// event (JS → native).
//
// JS side:
//   window.chrome.webview.postMessage(<obj>)            // → onMessage callback
//   window.chrome.webview.addEventListener('message',   // ← postMessageToJs
//                                          e => e.data)
class WebViewWindow {
public:
    using MessageHandler = std::function<void(const std::wstring& json)>;
    using CloseHandler = std::function<void()>;

    WebViewWindow(std::wstring title,
                  int width, int height,
                  std::wstring initialUrl,
                  MessageHandler onMessage,
                  CloseHandler onClosed = {});
    ~WebViewWindow();

    WebViewWindow(const WebViewWindow&) = delete;
    WebViewWindow& operator=(const WebViewWindow&) = delete;

    // Creates and shows the window. WebView2 init is async — the page
    // navigates once the controller becomes available.
    bool show();

    // Send a JSON payload to the page. Safe to call before WebView2 is
    // ready; pending messages are queued and flushed on init.
    void postMessageToJs(const std::wstring& json);

    HWND hwnd() const { return hwnd_; }

    // Public so the Win32 RegisterClassEx machinery can take its address.
    // Not part of the user-facing API.
    static LRESULT CALLBACK wndProc(HWND, UINT, WPARAM, LPARAM);

private:
    // hwnd passed explicitly: hwnd_ may not yet be set (during WM_NCCREATE)
    // or may be stale (after WM_DESTROY).
    LRESULT handleMessage(HWND hwnd, UINT, WPARAM, LPARAM);
    void initWebView();
    void resizeWebView();
    void flushPending();

    HWND hwnd_ = nullptr;
    Microsoft::WRL::ComPtr<ICoreWebView2>           webView_;
    Microsoft::WRL::ComPtr<ICoreWebView2Controller> controller_;

    std::wstring title_;
    int width_;
    int height_;
    std::wstring initialUrl_;
    MessageHandler onMessage_;
    CloseHandler onClosed_;

    std::wstring pendingMessage_;
    bool hasPending_ = false;
};

}  // namespace foundry::webview
