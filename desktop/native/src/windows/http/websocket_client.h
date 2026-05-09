#pragma once

#include <cstdint>
#include <mutex>
#include <string>
#include <vector>

#include <windows.h>
#include <winhttp.h>

namespace foundry::windows::http {

class BinaryWebSocketClient {
public:
    BinaryWebSocketClient();
    ~BinaryWebSocketClient();

    BinaryWebSocketClient(const BinaryWebSocketClient&) = delete;
    BinaryWebSocketClient& operator=(const BinaryWebSocketClient&) = delete;

    bool connect(const std::wstring& url,
                 const std::wstring& bearerToken,
                 std::wstring& error);
    bool sendBinary(const std::vector<std::uint8_t>& bytes);
    void close();
    bool connected() const;

private:
    void closeUnlocked();

    HINTERNET session_ = nullptr;
    HINTERNET connect_ = nullptr;
    HINTERNET socket_ = nullptr;
    mutable std::mutex mutex_;
};

std::wstring webSocketUrlFromHttpBase(const std::wstring& baseUrl,
                                      const std::wstring& pathAndQuery);

}  // namespace foundry::windows::http
