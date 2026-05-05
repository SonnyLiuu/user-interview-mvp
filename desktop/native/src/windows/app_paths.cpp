#include "app_paths.h"

#include <windows.h>
#include <shlobj.h>

namespace foundry::windows {

std::filesystem::path appDataDir() {
    wchar_t local[MAX_PATH] = {0};
    if (FAILED(SHGetFolderPathW(nullptr, CSIDL_LOCAL_APPDATA, nullptr, 0, local))) {
        return std::filesystem::current_path();
    }
    auto dir = std::filesystem::path(local) / L"foundry";
    std::filesystem::create_directories(dir);
    return dir;
}

std::filesystem::path settingsPath() {
    return appDataDir() / L"desktop-settings.json";
}

std::filesystem::path tokenPath() {
    return appDataDir() / L"token.json";
}

}  // namespace foundry::windows
