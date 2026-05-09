#include "sse_client.h"

#include <windows.h>
#include <winhttp.h>

#include <vector>

namespace foundry::windows::http {
namespace {

struct ParsedUrl {
    std::wstring host;
    std::wstring path;
    INTERNET_PORT port = 0;
    bool secure = false;
};

bool parseUrl(const std::wstring& url, ParsedUrl& parsed) {
    URL_COMPONENTSW parts{};
    parts.dwStructSize = sizeof(parts);
    parts.dwHostNameLength = static_cast<DWORD>(-1);
    parts.dwUrlPathLength = static_cast<DWORD>(-1);
    parts.dwExtraInfoLength = static_cast<DWORD>(-1);
    if (!WinHttpCrackUrl(url.c_str(), 0, 0, &parts)) return false;
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

std::string trimTrailingCr(std::string value) {
    if (!value.empty() && value.back() == '\r') value.pop_back();
    return value;
}

}  // namespace

SseClient::SseClient() = default;

SseClient::~SseClient() {
    stop();
}

void SseClient::start(const std::wstring& url,
                      const std::wstring& bearerToken,
                      SseEventCallback callback) {
    stop();
    callback_ = std::move(callback);
    running_ = true;
    thread_ = std::thread([this, url, bearerToken] { run(url, bearerToken); });
}

void SseClient::stop() {
    if (!running_ && !thread_.joinable()) return;
    running_ = false;
    if (thread_.joinable()) thread_.join();
}

bool SseClient::running() const {
    return running_;
}

void SseClient::run(std::wstring url, std::wstring bearerToken) {
    ParsedUrl parsed;
    if (!parseUrl(url, parsed)) {
        running_ = false;
        return;
    }

    HINTERNET session = WinHttpOpen(L"FoundryOverlay/0.1",
                                    WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                                    WINHTTP_NO_PROXY_NAME,
                                    WINHTTP_NO_PROXY_BYPASS, 0);
    if (!session) {
        running_ = false;
        return;
    }

    HINTERNET connect = WinHttpConnect(session, parsed.host.c_str(),
                                       parsed.port, 0);
    if (!connect) {
        WinHttpCloseHandle(session);
        running_ = false;
        return;
    }

    DWORD flags = parsed.secure ? WINHTTP_FLAG_SECURE : 0;
    HINTERNET req = WinHttpOpenRequest(connect, L"GET", parsed.path.c_str(),
                                       nullptr, WINHTTP_NO_REFERER,
                                       WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!req) {
        WinHttpCloseHandle(connect);
        WinHttpCloseHandle(session);
        running_ = false;
        return;
    }

    DWORD timeout = 3000;
    WinHttpSetOption(req, WINHTTP_OPTION_RECEIVE_TIMEOUT,
                     &timeout, sizeof(timeout));

    std::wstring headers = L"Accept: text/event-stream\r\n";
    if (!bearerToken.empty()) {
        headers += L"Authorization: Bearer " + bearerToken + L"\r\n";
    }

    BOOL sent = WinHttpSendRequest(req, headers.c_str(),
                                   static_cast<DWORD>(headers.size()),
                                   WINHTTP_NO_REQUEST_DATA, 0, 0, 0);
    if (!sent || !WinHttpReceiveResponse(req, nullptr)) {
        WinHttpCloseHandle(req);
        WinHttpCloseHandle(connect);
        WinHttpCloseHandle(session);
        running_ = false;
        return;
    }

    std::string buffer;
    std::string eventType;
    std::string data;
    while (running_) {
        DWORD available = 0;
        if (!WinHttpQueryDataAvailable(req, &available)) {
            if (GetLastError() == ERROR_WINHTTP_TIMEOUT) continue;
            break;
        }
        if (available == 0) break;
        std::vector<char> chunk(available);
        DWORD read = 0;
        if (!WinHttpReadData(req, chunk.data(), available, &read)) {
            if (GetLastError() == ERROR_WINHTTP_TIMEOUT) continue;
            break;
        }
        if (read > 0) {
            consume(std::string(chunk.data(), read), buffer, eventType, data);
        }
    }

    WinHttpCloseHandle(req);
    WinHttpCloseHandle(connect);
    WinHttpCloseHandle(session);
    running_ = false;
}

void SseClient::consume(const std::string& text,
                        std::string& buffer,
                        std::string& eventType,
                        std::string& data) {
    buffer += text;
    for (;;) {
        size_t pos = buffer.find('\n');
        if (pos == std::string::npos) return;
        std::string line = trimTrailingCr(buffer.substr(0, pos));
        buffer.erase(0, pos + 1);

        if (line.empty()) {
            emit(eventType, data);
            continue;
        }
        if (line.rfind("event:", 0) == 0) {
            eventType = line.substr(6);
            if (!eventType.empty() && eventType.front() == ' ') {
                eventType.erase(0, 1);
            }
        } else if (line.rfind("data:", 0) == 0) {
            std::string value = line.substr(5);
            if (!value.empty() && value.front() == ' ') value.erase(0, 1);
            if (!data.empty()) data += "\n";
            data += value;
        }
    }
}

void SseClient::emit(std::string& eventType, std::string& data) {
    if (!data.empty() && callback_) {
        callback_(eventType.empty() ? "message" : eventType, data);
    }
    eventType.clear();
    data.clear();
}

}  // namespace foundry::windows::http
