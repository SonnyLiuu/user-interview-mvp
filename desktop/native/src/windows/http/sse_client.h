#pragma once

#include <atomic>
#include <functional>
#include <string>
#include <thread>

namespace foundry::windows::http {

using SseEventCallback = std::function<void(const std::string& eventType,
                                            const std::string& data)>;

class SseClient {
public:
    SseClient();
    ~SseClient();

    SseClient(const SseClient&) = delete;
    SseClient& operator=(const SseClient&) = delete;

    void start(const std::wstring& url,
               const std::wstring& bearerToken,
               SseEventCallback callback);
    void stop();
    bool running() const;

private:
    void run(std::wstring url, std::wstring bearerToken);
    void consume(const std::string& text,
                 std::string& buffer,
                 std::string& eventType,
                 std::string& data);
    void emit(std::string& eventType, std::string& data);

    std::atomic<bool> running_{false};
    SseEventCallback callback_;
    std::thread thread_;
};

}  // namespace foundry::windows::http
