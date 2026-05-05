#pragma once

#include <filesystem>

namespace foundry::windows {

std::filesystem::path appDataDir();
std::filesystem::path settingsPath();
std::filesystem::path tokenPath();

}  // namespace foundry::windows
