#pragma once

#include <nlohmann/json.hpp>
#include <string>

namespace foundry::json {

using Json = nlohmann::json;

std::string toUtf8(const std::wstring& value);
std::wstring fromUtf8(const std::string& value);

Json parseUtf8(const std::string& value, Json fallback = Json::object());
Json parseWide(const std::wstring& value, Json fallback = Json::object());

std::string dumpUtf8(const Json& value);
std::wstring dumpWide(const Json& value);

std::wstring wideValue(const Json& object,
                       const char* key,
                       const std::wstring& fallback = L"");

// Try to extract a user-facing error message from a JSON response body.
// Returns the "error" field if present, otherwise the raw body.
std::wstring extractErrorMessage(const std::string& responseBody);

}  // namespace foundry::json
