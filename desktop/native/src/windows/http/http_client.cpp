#include "http_client.h"

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

std::wstring errorFromLastError(const wchar_t* prefix) {
    return std::wstring(prefix) + L" failed: " + std::to_wstring(GetLastError());
}

bool parseUrl(const std::wstring& url, ParsedUrl& parsed, std::wstring& error) {
    std::wstring crackUrl = url;
    if (crackUrl.rfind(L"http://", 0) != 0 &&
        crackUrl.rfind(L"https://", 0) != 0) {
        crackUrl = L"http://" + crackUrl;
    }

    URL_COMPONENTSW parts{};
    parts.dwStructSize = sizeof(parts);
    parts.dwHostNameLength = static_cast<DWORD>(-1);
    parts.dwUrlPathLength = static_cast<DWORD>(-1);
    parts.dwExtraInfoLength = static_cast<DWORD>(-1);

    if (!WinHttpCrackUrl(crackUrl.c_str(), 0, 0, &parts)) {
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

HttpResponse request(const wchar_t* method,
                     const std::wstring& url,
                     const std::string& body,
                     const std::wstring& bearerToken) {
    HttpResponse response;

    ParsedUrl parsed;
    if (!parseUrl(url, parsed, response.error)) return response;

    HINTERNET session = WinHttpOpen(L"UserInterviewNotetaker/0.1",
                                    WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                                    WINHTTP_NO_PROXY_NAME,
                                    WINHTTP_NO_PROXY_BYPASS, 0);
    if (!session) {
        response.error = errorFromLastError(L"WinHttpOpen");
        return response;
    }

    HINTERNET connect = WinHttpConnect(session, parsed.host.c_str(),
                                       parsed.port, 0);
    if (!connect) {
        response.error = errorFromLastError(L"WinHttpConnect");
        WinHttpCloseHandle(session);
        return response;
    }

    DWORD flags = parsed.secure ? WINHTTP_FLAG_SECURE : 0;
    HINTERNET req = WinHttpOpenRequest(connect, method, parsed.path.c_str(),
                                       nullptr, WINHTTP_NO_REFERER,
                                       WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!req) {
        response.error = errorFromLastError(L"WinHttpOpenRequest");
        WinHttpCloseHandle(connect);
        WinHttpCloseHandle(session);
        return response;
    }

    std::wstring headers;
    if (!bearerToken.empty()) {
        headers += L"Authorization: Bearer " + bearerToken + L"\r\n";
    }
    if (!body.empty()) {
        headers += L"Content-Type: application/json\r\n";
    }

    BOOL sent = WinHttpSendRequest(
        req,
        headers.empty() ? WINHTTP_NO_ADDITIONAL_HEADERS : headers.c_str(),
        headers.empty() ? 0 : static_cast<DWORD>(headers.size()),
        body.empty() ? WINHTTP_NO_REQUEST_DATA :
                       const_cast<char*>(body.data()),
        static_cast<DWORD>(body.size()),
        static_cast<DWORD>(body.size()),
        0);
    if (!sent || !WinHttpReceiveResponse(req, nullptr)) {
        response.error = errorFromLastError(L"WinHttpSendRequest/ReceiveResponse");
        WinHttpCloseHandle(req);
        WinHttpCloseHandle(connect);
        WinHttpCloseHandle(session);
        return response;
    }

    DWORD status = 0;
    DWORD statusSize = sizeof(status);
    WinHttpQueryHeaders(req,
                        WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                        WINHTTP_HEADER_NAME_BY_INDEX, &status, &statusSize,
                        WINHTTP_NO_HEADER_INDEX);
    response.status = status;

    for (;;) {
        DWORD available = 0;
        if (!WinHttpQueryDataAvailable(req, &available) || available == 0) {
            break;
        }
        std::vector<char> buffer(available);
        DWORD read = 0;
        if (!WinHttpReadData(req, buffer.data(), available, &read) || read == 0) {
            break;
        }
        response.body.append(buffer.data(), read);
    }

    response.ok = response.status >= 200 && response.status < 300;
    WinHttpCloseHandle(req);
    WinHttpCloseHandle(connect);
    WinHttpCloseHandle(session);
    return response;
}

}  // namespace

HttpResponse get(const std::wstring& url, const std::wstring& bearerToken) {
    return request(L"GET", url, "", bearerToken);
}

HttpResponse postJson(const std::wstring& url,
                      const std::string& json,
                      const std::wstring& bearerToken) {
    return request(L"POST", url, json, bearerToken);
}

}  // namespace foundry::windows::http
