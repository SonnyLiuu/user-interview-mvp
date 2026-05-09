#include "websocket_client.h"

#include <windows.h>
#include <winhttp.h>

namespace foundry::windows::http {
namespace {

struct ParsedUrl {
    std::wstring host;
    std::wstring path;
    INTERNET_PORT port = 0;
    bool secure = false;
};

std::wstring errorFromLastError(const wchar_t* prefix) {
    return std::wstring(prefix) + L" failed: " + std::to_wstring(GetLastError());
}

bool parseUrl(const std::wstring& url, ParsedUrl& parsed, std::wstring& error) {
    URL_COMPONENTSW parts{};
    parts.dwStructSize = sizeof(parts);
    parts.dwHostNameLength = static_cast<DWORD>(-1);
    parts.dwUrlPathLength = static_cast<DWORD>(-1);
    parts.dwExtraInfoLength = static_cast<DWORD>(-1);

    if (!WinHttpCrackUrl(url.c_str(), 0, 0, &parts)) {
        error = errorFromLastError(L"WinHttpCrackUrl");
        return false;
    }

    parsed.host.assign(parts.lpszHostName, parts.dwHostNameLength);
    parsed.path.assign(parts.lpszUrlPath, parts.dwUrlPathLength);
    if (parts.dwExtraInfoLength > 0) {
        parsed.path.append(parts.lpszExtraInfo, parts.dwExtraInfoLength);
    }
    if (parsed.path.empty()) parsed.path = L"/";
    parsed.port = parts.nPort;
    parsed.secure = parts.nScheme == INTERNET_SCHEME_HTTPS;
    return true;
}

}  // namespace

BinaryWebSocketClient::BinaryWebSocketClient() = default;

BinaryWebSocketClient::~BinaryWebSocketClient() {
    close();
}

bool BinaryWebSocketClient::connect(const std::wstring& url,
                                    const std::wstring& bearerToken,
                                    std::wstring& error) {
    std::lock_guard<std::mutex> lock(mutex_);
    closeUnlocked();

    ParsedUrl parsed;
    if (!parseUrl(url, parsed, error)) return false;

    session_ = WinHttpOpen(L"FoundryOverlay/0.1",
                           WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                           WINHTTP_NO_PROXY_NAME,
                           WINHTTP_NO_PROXY_BYPASS, 0);
    if (!session_) {
        error = errorFromLastError(L"WinHttpOpen");
        return false;
    }

    connect_ = WinHttpConnect(session_, parsed.host.c_str(), parsed.port, 0);
    if (!connect_) {
        error = errorFromLastError(L"WinHttpConnect");
        closeUnlocked();
        return false;
    }

    DWORD flags = parsed.secure ? WINHTTP_FLAG_SECURE : 0;
    HINTERNET request = WinHttpOpenRequest(
        connect_, L"GET", parsed.path.c_str(), nullptr, WINHTTP_NO_REFERER,
        WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!request) {
        error = errorFromLastError(L"WinHttpOpenRequest");
        closeUnlocked();
        return false;
    }

    if (!WinHttpSetOption(request, WINHTTP_OPTION_UPGRADE_TO_WEB_SOCKET,
                          nullptr, 0)) {
        error = errorFromLastError(L"WinHttpSetOption(WEBSOCKET)");
        WinHttpCloseHandle(request);
        closeUnlocked();
        return false;
    }

    std::wstring headers;
    if (!bearerToken.empty()) {
        headers = L"Authorization: Bearer " + bearerToken + L"\r\n";
    }

    BOOL sent = WinHttpSendRequest(
        request,
        headers.empty() ? WINHTTP_NO_ADDITIONAL_HEADERS : headers.c_str(),
        headers.empty() ? 0 : static_cast<DWORD>(headers.size()),
        WINHTTP_NO_REQUEST_DATA, 0, 0, 0);
    if (!sent || !WinHttpReceiveResponse(request, nullptr)) {
        error = errorFromLastError(L"WinHttpSendRequest/ReceiveResponse");
        WinHttpCloseHandle(request);
        closeUnlocked();
        return false;
    }

    socket_ = WinHttpWebSocketCompleteUpgrade(request, 0);
    WinHttpCloseHandle(request);
    if (!socket_) {
        error = errorFromLastError(L"WinHttpWebSocketCompleteUpgrade");
        closeUnlocked();
        return false;
    }

    return true;
}

bool BinaryWebSocketClient::sendBinary(const std::vector<std::uint8_t>& bytes) {
    if (bytes.empty()) return true;
    std::lock_guard<std::mutex> lock(mutex_);
    if (!socket_) return false;
    DWORD result = WinHttpWebSocketSend(
        socket_, WINHTTP_WEB_SOCKET_BINARY_MESSAGE_BUFFER_TYPE,
        const_cast<std::uint8_t*>(bytes.data()),
        static_cast<DWORD>(bytes.size()));
    return result == NO_ERROR;
}

void BinaryWebSocketClient::close() {
    std::lock_guard<std::mutex> lock(mutex_);
    closeUnlocked();
}

void BinaryWebSocketClient::closeUnlocked() {
    if (socket_) {
        WinHttpWebSocketClose(socket_, WINHTTP_WEB_SOCKET_SUCCESS_CLOSE_STATUS,
                              nullptr, 0);
        WinHttpCloseHandle(socket_);
        socket_ = nullptr;
    }
    if (connect_) {
        WinHttpCloseHandle(connect_);
        connect_ = nullptr;
    }
    if (session_) {
        WinHttpCloseHandle(session_);
        session_ = nullptr;
    }
}

bool BinaryWebSocketClient::connected() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return socket_ != nullptr;
}

std::wstring webSocketUrlFromHttpBase(const std::wstring& baseUrl,
                                      const std::wstring& pathAndQuery) {
    std::wstring base = baseUrl;
    if (!base.empty() && base.back() == L'/') base.pop_back();
    if (base.rfind(L"https://", 0) == 0) {
        base.replace(0, 8, L"wss://");
    } else if (base.rfind(L"http://", 0) == 0) {
        base.replace(0, 7, L"ws://");
    }
    return base + pathAndQuery;
}

}  // namespace foundry::windows::http
