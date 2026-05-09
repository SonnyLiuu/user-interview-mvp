cmake_minimum_required(VERSION 3.20)
project(foundry_overlay_native C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT WIN32)
    message(FATAL_ERROR "Windows-only target. macOS support pending.")
endif()

include(FetchContent)

# Microsoft Edge WebView2 SDK. NuGet packages are zip archives, CMake's
# FetchContent recognizes them by magic bytes and extracts cleanly.
# Bumping the version is safe; pin here so reproducible.
set(WEBVIEW2_VERSION "1.0.2210.55")
FetchContent_Declare(
    webview2
    URL https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/${WEBVIEW2_VERSION}
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
)
FetchContent_MakeAvailable(webview2)

FetchContent_Declare(
    nlohmann_json
    URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
)
FetchContent_MakeAvailable(nlohmann_json)

# foundry_overlay.exe — single native app: tray + overlay + WebView2 windows.
add_executable(foundry_overlay
    src/common/json_util.cpp
    src/windows/main.cpp
    src/windows/app_paths.cpp
    src/windows/audio/audio_capture.cpp
    src/windows/http/http_client.cpp
    src/windows/http/sse_client.cpp
    src/windows/http/websocket_client.cpp
    src/windows/overlay/window.cpp
    src/windows/overlay/renderer.cpp
    src/windows/tray/tray.cpp
    src/windows/webview/webview_window.cpp
)

target_include_directories(foundry_overlay PRIVATE
    src
    ${webview2_SOURCE_DIR}/build/native/include
)

target_compile_definitions(foundry_overlay PRIVATE
    UNICODE
    _UNICODE
    WIN32_LEAN_AND_MEAN
    NOMINMAX
)

target_link_libraries(foundry_overlay PRIVATE
    ${webview2_SOURCE_DIR}/build/native/x64/WebView2LoaderStatic.lib
    nlohmann_json::nlohmann_json
    d3d11
    dxgi
    d2d1
    dwrite
    user32
    gdi32
    shell32
    ole32
    shlwapi
    winhttp
    mmdevapi
)

# Copy HTML assets next to the exe so file:// URLs resolve at runtime.
add_custom_command(TARGET foundry_overlay POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
        ${CMAKE_CURRENT_SOURCE_DIR}/assets
        $<TARGET_FILE_DIR:foundry_overlay>/assets
)
