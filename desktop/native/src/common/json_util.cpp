#include "json_util.h"

#include <windows.h>

namespace foundry::json {

std::string toUtf8(const std::wstring& value) {
    if (value.empty()) return "";
    int size = WideCharToMultiByte(CP_UTF8, 0, value.c_str(),
                                   static_cast<int>(value.size()),
                                   nullptr, 0, nullptr, nullptr);
    if (size <= 0) return "";
    std::string out(size, '\0');
    WideCharToMultiByte(CP_UTF8, 0, value.c_str(),
                        static_cast<int>(value.size()), out.data(), size,
                        nullptr, nullptr);
    return out;
}

std::wstring fromUtf8(const std::string& value) {
    if (value.empty()) return L"";
    int size = MultiByteToWideChar(CP_UTF8, 0, value.data(),
                                   static_cast<int>(value.size()),
                                   nullptr, 0);
    if (size <= 0) return std::wstring(value.begin(), value.end());
    std::wstring out(size, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, value.data(),
                        static_cast<int>(value.size()), out.data(), size);
    return out;
}

Json parseUtf8(const std::string& value, Json fallback) {
    try {
        if (value.empty()) return fallback;
        return Json::parse(value);
    } catch (...) {
        return fallback;
    }
}

Json parseWide(const std::wstring& value, Json fallback) {
    return parseUtf8(toUtf8(value), std::move(fallback));
}

std::string dumpUtf8(const Json& value) {
    return value.dump();
}

std::wstring dumpWide(const Json& value) {
    return fromUtf8(value.dump());
}

std::wstring wideValue(const Json& object,
                       const char* key,
                       const std::wstring& fallback) {
    if (!object.is_object() || !object.contains(key) ||
        !object.at(key).is_string()) {
        return fallback;
    }
    return fromUtf8(object.at(key).get<std::string>());
}

}  // namespace foundry::json
