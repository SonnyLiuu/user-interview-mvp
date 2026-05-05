#pragma once

#include <string>

namespace foundry::windows::http {

struct HttpResponse {
    bool ok = false;
    unsigned long status = 0;
    std::string body;
    std::wstring error;
};

HttpResponse get(const std::wstring& url,
                 const std::wstring& bearerToken = L"");

HttpResponse postJson(const std::wstring& url,
                      const std::string& json,
                      const std::wstring& bearerToken = L"");

}  // namespace foundry::windows::http
