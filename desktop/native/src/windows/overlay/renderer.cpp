// Direct2D renderer for the visible notepad checklist shell.

#include "renderer.h"

#include <windows.h>
#include <d3d11.h>
#include <dxgi.h>
#include <d2d1.h>
#include <dwrite.h>
#include <wrl/client.h>
#include <algorithm>
#include <string>

using Microsoft::WRL::ComPtr;

namespace foundry::overlay {

namespace {

ComPtr<ID2D1Factory>      g_d2dFactory;
ComPtr<IDWriteFactory>    g_dwriteFactory;
ComPtr<IDWriteTextFormat> g_titleFormat;
ComPtr<IDWriteTextFormat> g_bodyFormat;
ComPtr<IDWriteTextFormat> g_titleNoWrapFormat;
ComPtr<IDWriteTextFormat> g_bodyNoWrapFormat;
ComPtr<IDWriteTextFormat> g_buttonFormat;
ComPtr<IDWriteTextFormat> g_iconFormat;
ComPtr<IDWriteTextFormat> g_topicFormat;

IDXGISwapChain*              g_cachedSwapChain = nullptr;
ComPtr<ID2D1RenderTarget>    g_cachedRenderTarget;
ComPtr<ID2D1SolidColorBrush> g_paperBrush;
ComPtr<ID2D1SolidColorBrush> g_headerBrush;
ComPtr<ID2D1SolidColorBrush> g_borderBrush;
ComPtr<ID2D1SolidColorBrush> g_textBrush;
ComPtr<ID2D1SolidColorBrush> g_mutedBrush;
ComPtr<ID2D1SolidColorBrush> g_buttonBrush;
ComPtr<ID2D1SolidColorBrush> g_buttonHoverBrush;
ComPtr<ID2D1SolidColorBrush> g_accentBrush;
ComPtr<ID2D1SolidColorBrush> g_goalBrush;
ComPtr<ID2D1SolidColorBrush> g_goalHeaderBrush;
ComPtr<ID2D1SolidColorBrush> g_questionBrush;
ComPtr<ID2D1SolidColorBrush> g_questionHeaderBrush;
ComPtr<ID2D1SolidColorBrush> g_signalBrush;

D2D1_ROUNDED_RECT rounded(D2D1_RECT_F rect, float radius) {
    return D2D1::RoundedRect(rect, radius, radius);
}

float topicTop() { return 86.0f; }
float topicLeft() { return 14.0f; }
float topicRight(float width, bool overflow) {
    return width - (overflow ? 26.0f : 14.0f);
}
float topicRowHeight() { return 64.0f; }
float topicGap() { return 8.0f; }
float sectionHeaderHeight() { return 32.0f; }
float sectionGap() { return 8.0f; }
float topicAreaBottomMargin() { return 54.0f; }
float personTop() { return 110.0f; }
float personLeft() { return 14.0f; }
float personRight(float width) { return width - 14.0f; }
float personRowHeight() { return 54.0f; }
float personGap() { return 8.0f; }
unsigned int maxPickerRows() { return 4; }

unsigned int visiblePickerRows(int overlayHeightDip) {
    float available = static_cast<float>(overlayHeightDip)
                      - personTop() - 54.0f;
    if (available <= 0.0f) return 0;
    float stride = personRowHeight() + personGap();
    return static_cast<unsigned int>(
        std::max(1, static_cast<int>((available + personGap()) / stride)));
}

struct ChecklistEntry {
    enum class Kind {
        QuestionHeader,
        Topic,
    };
    Kind kind;
    unsigned int topicIndex = 0;
    int visibleTopicIndex = -1;
};

std::vector<ChecklistEntry> checklistEntries(
    const std::vector<OverlayTopicRow>& topics,
    bool goalsCollapsed,
    bool questionsCollapsed) {
    (void)goalsCollapsed;
    std::vector<ChecklistEntry> entries;

    unsigned int questionCount = 0;
    for (const auto& topic : topics) {
        if (topic.category == TopicCategory::Question) ++questionCount;
    }

    int visibleTopicIndex = 0;
    if (questionCount > 0) {
        entries.push_back({ChecklistEntry::Kind::QuestionHeader, 0, -1});
        if (!questionsCollapsed) {
            for (unsigned int i = 0; i < topics.size(); ++i) {
                if (topics[i].category != TopicCategory::Question) continue;
                entries.push_back({ChecklistEntry::Kind::Topic, i,
                                   visibleTopicIndex++});
            }
        }
    }
    return entries;
}

unsigned int visibleChecklistRows(int overlayHeightDip) {
    float available = static_cast<float>(overlayHeightDip)
                      - topicTop() - topicAreaBottomMargin();
    if (available <= 0.0f) return 0;
    float stride = topicRowHeight() + topicGap();
    return static_cast<unsigned int>(
        std::max(1, static_cast<int>((available + topicGap()) / stride)));
}

ID2D1SolidColorBrush* categoryBrush(TopicCategory category) {
    switch (category) {
        case TopicCategory::Goal:     return g_goalBrush.Get();
        case TopicCategory::Question: return g_questionBrush.Get();
        case TopicCategory::Signal:   return g_signalBrush.Get();
    }
    return g_mutedBrush.Get();
}

bool createTextFormat(float size,
                      DWRITE_FONT_WEIGHT weight,
                      IDWriteTextFormat** out) {
    if (FAILED(g_dwriteFactory->CreateTextFormat(
            L"Segoe UI", nullptr, weight, DWRITE_FONT_STYLE_NORMAL,
            DWRITE_FONT_STRETCH_NORMAL, size, L"en-us", out))) {
        return false;
    }
    (*out)->SetWordWrapping(DWRITE_WORD_WRAPPING_WRAP);
    return true;
}

bool createSingleLineTextFormat(float size,
                                DWRITE_FONT_WEIGHT weight,
                                IDWriteTextFormat** out) {
    if (!createTextFormat(size, weight, out)) {
        return false;
    }
    (*out)->SetWordWrapping(DWRITE_WORD_WRAPPING_NO_WRAP);
    ComPtr<IDWriteInlineObject> ellipsis;
    if (SUCCEEDED(g_dwriteFactory->CreateEllipsisTrimmingSign(*out, ellipsis.GetAddressOf()))) {
        DWRITE_TRIMMING trimming{};
        trimming.granularity = DWRITE_TRIMMING_GRANULARITY_CHARACTER;
        (*out)->SetTrimming(&trimming, ellipsis.Get());
    }
    return true;
}

bool createIconFormat(float size, IDWriteTextFormat** out) {
    if (FAILED(g_dwriteFactory->CreateTextFormat(
            L"Segoe MDL2 Assets", nullptr, DWRITE_FONT_WEIGHT_NORMAL,
            DWRITE_FONT_STYLE_NORMAL, DWRITE_FONT_STRETCH_NORMAL, size,
            L"en-us", out))) {
        return false;
    }
    (*out)->SetTextAlignment(DWRITE_TEXT_ALIGNMENT_CENTER);
    (*out)->SetParagraphAlignment(DWRITE_PARAGRAPH_ALIGNMENT_CENTER);
    return true;
}

bool ensureFactories() {
    if (!g_d2dFactory &&
        FAILED(D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED,
                                 g_d2dFactory.GetAddressOf()))) {
        return false;
    }
    if (!g_dwriteFactory &&
        FAILED(DWriteCreateFactory(
            DWRITE_FACTORY_TYPE_SHARED, __uuidof(IDWriteFactory),
            reinterpret_cast<IUnknown**>(g_dwriteFactory.GetAddressOf())))) {
        return false;
    }
    if (!g_titleFormat &&
        !createTextFormat(16.0f, DWRITE_FONT_WEIGHT_SEMI_BOLD,
                          g_titleFormat.GetAddressOf())) {
        return false;
    }
    if (!g_bodyFormat &&
        !createTextFormat(13.0f, DWRITE_FONT_WEIGHT_NORMAL,
                          g_bodyFormat.GetAddressOf())) {
        return false;
    }
    if (!g_titleNoWrapFormat &&
        !createSingleLineTextFormat(16.0f, DWRITE_FONT_WEIGHT_SEMI_BOLD,
                                    g_titleNoWrapFormat.GetAddressOf())) {
        return false;
    }
    if (!g_bodyNoWrapFormat &&
        !createSingleLineTextFormat(13.0f, DWRITE_FONT_WEIGHT_NORMAL,
                                    g_bodyNoWrapFormat.GetAddressOf())) {
        return false;
    }
    if (!g_buttonFormat &&
        !createTextFormat(12.0f, DWRITE_FONT_WEIGHT_SEMI_BOLD,
                          g_buttonFormat.GetAddressOf())) {
        return false;
    }
    if (!g_iconFormat &&
        !createIconFormat(17.0f, g_iconFormat.GetAddressOf())) {
        return false;
    }
    if (!g_topicFormat &&
        !createTextFormat(14.0f, DWRITE_FONT_WEIGHT_NORMAL,
                          g_topicFormat.GetAddressOf())) {
        return false;
    }
    g_buttonFormat->SetTextAlignment(DWRITE_TEXT_ALIGNMENT_CENTER);
    g_buttonFormat->SetParagraphAlignment(DWRITE_PARAGRAPH_ALIGNMENT_CENTER);
    return true;
}

bool ensureRenderTarget(IDXGISwapChain* swapChain) {
    if (g_cachedSwapChain == swapChain && g_cachedRenderTarget) return true;

    g_cachedRenderTarget.Reset();
    g_paperBrush.Reset();
    g_headerBrush.Reset();
    g_borderBrush.Reset();
    g_textBrush.Reset();
    g_mutedBrush.Reset();
    g_buttonBrush.Reset();
    g_buttonHoverBrush.Reset();
    g_accentBrush.Reset();
    g_goalBrush.Reset();
    g_goalHeaderBrush.Reset();
    g_questionBrush.Reset();
    g_questionHeaderBrush.Reset();
    g_signalBrush.Reset();
    g_cachedSwapChain = nullptr;

    ComPtr<IDXGISurface> surface;
    if (FAILED(swapChain->GetBuffer(0, IID_PPV_ARGS(surface.GetAddressOf())))) {
        return false;
    }

    D2D1_RENDER_TARGET_PROPERTIES props = D2D1::RenderTargetProperties(
        D2D1_RENDER_TARGET_TYPE_DEFAULT,
        D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM,
                          D2D1_ALPHA_MODE_PREMULTIPLIED),
        96.0f, 96.0f);

    if (FAILED(g_d2dFactory->CreateDxgiSurfaceRenderTarget(
            surface.Get(), &props, g_cachedRenderTarget.GetAddressOf()))) {
        return false;
    }

    g_cachedRenderTarget->CreateSolidColorBrush(
        D2D1::ColorF(0xFFFFFF, 0.98f), g_paperBrush.GetAddressOf());
    g_cachedRenderTarget->CreateSolidColorBrush(
        D2D1::ColorF(0xECE2D1, 0.98f), g_headerBrush.GetAddressOf());
    g_cachedRenderTarget->CreateSolidColorBrush(
        D2D1::ColorF(0xB9AA94, 1.0f), g_borderBrush.GetAddressOf());
    g_cachedRenderTarget->CreateSolidColorBrush(
        D2D1::ColorF(0x25211C, 1.0f), g_textBrush.GetAddressOf());
    g_cachedRenderTarget->CreateSolidColorBrush(
        D2D1::ColorF(0x6F6557, 1.0f), g_mutedBrush.GetAddressOf());
    g_cachedRenderTarget->CreateSolidColorBrush(
        D2D1::ColorF(0xFFFFFF, 0.78f), g_buttonBrush.GetAddressOf());
    g_cachedRenderTarget->CreateSolidColorBrush(
        D2D1::ColorF(0xFFFFFF, 0.96f), g_buttonHoverBrush.GetAddressOf());
    g_cachedRenderTarget->CreateSolidColorBrush(
        D2D1::ColorF(0xB24A3B, 1.0f), g_accentBrush.GetAddressOf());
    g_cachedRenderTarget->CreateSolidColorBrush(
        D2D1::ColorF(0x2D8B5F, 1.0f), g_goalBrush.GetAddressOf());
    g_cachedRenderTarget->CreateSolidColorBrush(
        D2D1::ColorF(0xE8F5EE, 1.0f), g_goalHeaderBrush.GetAddressOf());
    g_cachedRenderTarget->CreateSolidColorBrush(
        D2D1::ColorF(0x3D6FB5, 1.0f), g_questionBrush.GetAddressOf());
    g_cachedRenderTarget->CreateSolidColorBrush(
        D2D1::ColorF(0xEAF1FB, 1.0f), g_questionHeaderBrush.GetAddressOf());
    g_cachedRenderTarget->CreateSolidColorBrush(
        D2D1::ColorF(0xC8851A, 1.0f), g_signalBrush.GetAddressOf());

    g_cachedSwapChain = swapChain;
    return true;
}

void drawButton(const wchar_t* text, D2D1_RECT_F rect, bool hovered = false) {
    g_cachedRenderTarget->FillRoundedRectangle(rounded(rect, 5.0f),
                                               hovered ? g_buttonHoverBrush.Get()
                                                       : g_buttonBrush.Get());
    g_cachedRenderTarget->DrawRoundedRectangle(rounded(rect, 5.0f),
                                               hovered ? g_accentBrush.Get()
                                                       : g_borderBrush.Get(),
                                               hovered ? 1.3f : 1.0f);
    g_cachedRenderTarget->DrawTextW(text, static_cast<UINT32>(wcslen(text)),
                                    g_buttonFormat.Get(), rect,
                                    g_textBrush.Get());
}

void drawSettingsGlyph(D2D1_RECT_F rect) {
    const wchar_t* glyph = L"\xE713";
    g_cachedRenderTarget->DrawTextW(glyph, 1, g_iconFormat.Get(), rect,
                                    g_textBrush.Get());
}

void drawBackArrow(D2D1_RECT_F rect, bool hovered = false) {
    if (hovered) {
        g_cachedRenderTarget->FillRoundedRectangle(rounded(rect, 5.0f),
                                                   g_buttonHoverBrush.Get());
        g_cachedRenderTarget->DrawRoundedRectangle(rounded(rect, 5.0f),
                                                   g_borderBrush.Get(), 1.0f);
    }
    const float cx = (rect.left + rect.right) * 0.5f;
    const float cy = (rect.top + rect.bottom) * 0.5f;
    const float left = cx - 8.0f;
    const float right = cx + 8.0f;
    g_cachedRenderTarget->DrawLine(D2D1::Point2F(right, cy),
                                   D2D1::Point2F(left, cy),
                                   g_textBrush.Get(), 1.8f);
    g_cachedRenderTarget->DrawLine(D2D1::Point2F(left, cy),
                                   D2D1::Point2F(left + 6.0f, cy - 6.0f),
                                   g_textBrush.Get(), 1.8f);
    g_cachedRenderTarget->DrawLine(D2D1::Point2F(left, cy),
                                   D2D1::Point2F(left + 6.0f, cy + 6.0f),
                                   g_textBrush.Get(), 1.8f);
}

void drawLabeledValue(const wchar_t* label, const std::wstring& value,
                      float top, float width) {
    D2D1_RECT_F labelRect = D2D1::RectF(16.0f, top, width - 16.0f,
                                       top + 18.0f);
    g_cachedRenderTarget->DrawTextW(label, static_cast<UINT32>(wcslen(label)),
                                    g_buttonFormat.Get(), labelRect,
                                    g_mutedBrush.Get());
    D2D1_RECT_F valueRect = D2D1::RectF(16.0f, top + 21.0f,
                                       width - 16.0f, top + 62.0f);
    const std::wstring shown = value.empty() ? L"http://localhost:3000" : value;
    g_cachedRenderTarget->DrawTextW(shown.c_str(),
                                    static_cast<UINT32>(shown.size()),
                                    g_bodyFormat.Get(), valueRect,
                                    g_textBrush.Get());
}

void drawSettingsPage(const OverlayRenderState& state, D2D1_SIZE_F sz) {
    D2D1_RECT_F backButton = D2D1::RectF(10.0f, 7.0f, 52.0f, 39.0f);
    drawBackArrow(backButton, state.hoverTarget == OverlayHoverTarget::Back);
    g_cachedRenderTarget->DrawTextW(L"Settings", 8, g_titleFormat.Get(),
                                    D2D1::RectF(58.0f, 11.0f,
                                                sz.width - 16.0f, 36.0f),
                                    g_textBrush.Get());

    const wchar_t* authLabel = state.hasAuthToken
        ? L"Signed in"
        : L"Not signed in";
    g_cachedRenderTarget->DrawTextW(authLabel,
                                    static_cast<UINT32>(wcslen(authLabel)),
                                    g_titleFormat.Get(),
                                    D2D1::RectF(16.0f, 70.0f,
                                                sz.width - 16.0f, 94.0f),
                                    state.hasAuthToken ? g_goalBrush.Get()
                                                       : g_accentBrush.Get());
    const wchar_t* authHint = state.hasAuthToken
        ? L"User Interview Desktop can load call briefs for the current user."
        : L"Sign in before starting a session.";
    g_cachedRenderTarget->DrawTextW(authHint,
                                    static_cast<UINT32>(wcslen(authHint)),
                                    g_bodyFormat.Get(),
                                    D2D1::RectF(16.0f, 96.0f,
                                                sz.width - 16.0f, 132.0f),
                                    g_mutedBrush.Get());

    drawLabeledValue(L"API base URL", state.apiBaseUrl, 132.0f, sz.width);

    drawButton(state.hasAuthToken ? L"Re-sign in" : L"Sign in",
               D2D1::RectF(16.0f, 168.0f, 154.0f, 202.0f),
               state.hoverTarget == OverlayHoverTarget::SignIn);
    drawButton(L"Auth test", D2D1::RectF(166.0f, 168.0f, 324.0f, 202.0f),
               state.hoverTarget == OverlayHoverTarget::AuthSelfTest);
    drawButton(L"Clear auth", D2D1::RectF(16.0f, 214.0f, 154.0f, 248.0f),
               state.hoverTarget == OverlayHoverTarget::ClearAuth);
    drawButton(L"Reset overlay",
               D2D1::RectF(166.0f, 214.0f, 324.0f, 248.0f),
               state.hoverTarget == OverlayHoverTarget::ResetOverlay);

    D2D1_RECT_F statusBox = D2D1::RectF(16.0f, 278.0f, sz.width - 16.0f,
                                       sz.height - 18.0f);
    g_cachedRenderTarget->FillRoundedRectangle(rounded(statusBox, 5.0f),
                                               g_buttonBrush.Get());
    g_cachedRenderTarget->DrawRoundedRectangle(rounded(statusBox, 5.0f),
                                               g_borderBrush.Get(), 1.0f);
    const std::wstring status = state.settingsStatus.empty()
        ? L"Ready."
        : state.settingsStatus;
    g_cachedRenderTarget->DrawTextW(status.c_str(),
                                    static_cast<UINT32>(status.size()),
                                    g_bodyFormat.Get(),
                                    D2D1::RectF(statusBox.left + 10.0f,
                                                statusBox.top + 10.0f,
                                                statusBox.right - 10.0f,
                                                statusBox.bottom - 10.0f),
                                    g_mutedBrush.Get());
}

void drawPersonRow(const OverlayPersonRow& person, D2D1_RECT_F rect,
                   bool hovered) {
    g_cachedRenderTarget->FillRoundedRectangle(rounded(rect, 5.0f),
                                               hovered ? g_buttonHoverBrush.Get()
                                                       : g_buttonBrush.Get());
    g_cachedRenderTarget->DrawRoundedRectangle(rounded(rect, 5.0f),
                                               hovered ? g_accentBrush.Get()
                                                       : g_borderBrush.Get(),
                                               hovered ? 1.3f : 1.0f);

    std::wstring name = person.name.empty() ? L"Unnamed person" : person.name;
    g_cachedRenderTarget->DrawTextW(name.c_str(),
                                    static_cast<UINT32>(name.size()),
                                    g_titleNoWrapFormat.Get(),
                                    D2D1::RectF(rect.left + 12.0f,
                                                rect.top + 8.0f,
                                                rect.right - 12.0f,
                                                rect.top + 28.0f),
                                    g_textBrush.Get(),
                                    D2D1_DRAW_TEXT_OPTIONS_CLIP);
    std::wstring meta = person.meta.empty() ? L"No details yet" : person.meta;
    g_cachedRenderTarget->DrawTextW(meta.c_str(),
                                    static_cast<UINT32>(meta.size()),
                                    g_bodyNoWrapFormat.Get(),
                                    D2D1::RectF(rect.left + 12.0f,
                                                rect.top + 31.0f,
                                                rect.right - 12.0f,
                                                rect.bottom - 6.0f),
                                    g_mutedBrush.Get(),
                                    D2D1_DRAW_TEXT_OPTIONS_CLIP);
}

std::wstring ellipsize(const std::wstring& text, size_t maxChars) {
    if (text.size() <= maxChars) return text;
    if (maxChars <= 3) return text.substr(0, maxChars);
    return text.substr(0, maxChars - 3) + L"...";
}

void drawPersonDropdown(const OverlayRenderState& state, D2D1_SIZE_F sz) {
    if (!state.sessionActive) return;

    D2D1_RECT_F button = D2D1::RectF(sz.width - 158.0f, 8.0f,
                                    sz.width - 12.0f, 38.0f);
    const bool hovered =
        state.hoverTarget == OverlayHoverTarget::PersonDropdown;
    drawButton(L"", button, hovered);

    std::wstring name = state.selectedPersonName.empty()
        ? L"Current person"
        : ellipsize(state.selectedPersonName, 16);
    g_cachedRenderTarget->DrawTextW(name.c_str(),
                                    static_cast<UINT32>(name.size()),
                                    g_bodyFormat.Get(),
                                    D2D1::RectF(button.left + 10.0f,
                                                button.top + 5.0f,
                                                button.right - 28.0f,
                                                button.bottom - 4.0f),
                                    g_textBrush.Get());
    const wchar_t* chevron = state.personDropdownOpen ? L"\xE70E" : L"\xE70D";
    g_cachedRenderTarget->DrawTextW(chevron, 1, g_iconFormat.Get(),
                                    D2D1::RectF(button.right - 26.0f,
                                                button.top + 1.0f,
                                                button.right - 6.0f,
                                                button.bottom + 1.0f),
                                    g_mutedBrush.Get());

    if (!state.personDropdownOpen) return;

    unsigned int limit = std::min<unsigned int>(
        static_cast<unsigned int>(state.people.size()), maxPickerRows());
    if (limit == 0) {
        D2D1_RECT_F row = D2D1::RectF(button.left, button.bottom + 6.0f,
                                      button.right, button.bottom + 44.0f);
        g_cachedRenderTarget->FillRoundedRectangle(rounded(row, 5.0f),
                                                   g_buttonHoverBrush.Get());
        g_cachedRenderTarget->DrawRoundedRectangle(rounded(row, 5.0f),
                                                   g_borderBrush.Get(), 1.0f);
        const wchar_t* empty = L"No people";
        g_cachedRenderTarget->DrawTextW(empty,
                                        static_cast<UINT32>(wcslen(empty)),
                                        g_bodyFormat.Get(),
                                        D2D1::RectF(row.left + 10.0f,
                                                    row.top + 8.0f,
                                                    row.right - 10.0f,
                                                    row.bottom - 6.0f),
                                        g_mutedBrush.Get());
        return;
    }

    for (unsigned int i = 0; i < limit; ++i) {
        D2D1_RECT_F row = D2D1::RectF(button.left,
                                      button.bottom + 6.0f + i * 42.0f,
                                      button.right,
                                      button.bottom + 44.0f + i * 42.0f);
        bool rowHovered = state.hoverTarget == OverlayHoverTarget::PersonRow &&
                          state.hoverIndex == static_cast<int>(i);
        g_cachedRenderTarget->FillRoundedRectangle(
            rounded(row, 5.0f),
            rowHovered ? g_buttonHoverBrush.Get() : g_buttonBrush.Get());
        g_cachedRenderTarget->DrawRoundedRectangle(
            rounded(row, 5.0f),
            rowHovered ? g_accentBrush.Get() : g_borderBrush.Get(),
            rowHovered ? 1.3f : 1.0f);

        std::wstring rowName = ellipsize(
            state.people[i].name.empty() ? L"Unnamed" : state.people[i].name,
            18);
        g_cachedRenderTarget->DrawTextW(rowName.c_str(),
                                        static_cast<UINT32>(rowName.size()),
                                        g_bodyFormat.Get(),
                                        D2D1::RectF(row.left + 10.0f,
                                                    row.top + 8.0f,
                                                    row.right - 10.0f,
                                                    row.bottom - 5.0f),
                                        g_textBrush.Get());
    }
}

void drawPickerPage(const OverlayRenderState& state, D2D1_SIZE_F sz) {
    D2D1_RECT_F backButton = D2D1::RectF(10.0f, 7.0f, 52.0f, 39.0f);
    drawBackArrow(backButton, state.hoverTarget == OverlayHoverTarget::Back);
    g_cachedRenderTarget->DrawTextW(L"Start Session", 13, g_titleFormat.Get(),
                                    D2D1::RectF(58.0f, 11.0f,
                                                sz.width - 16.0f, 36.0f),
                                    g_textBrush.Get());

    const std::wstring status = state.pickerStatus.empty()
        ? L"Pick person for call."
        : state.pickerStatus;
    g_cachedRenderTarget->DrawTextW(status.c_str(),
                                    static_cast<UINT32>(status.size()),
                                    g_bodyFormat.Get(),
                                    D2D1::RectF(16.0f, 66.0f,
                                                sz.width - 112.0f, 98.0f),
                                    g_mutedBrush.Get());
    drawButton(L"Refresh",
               D2D1::RectF(sz.width - 102.0f, 64.0f,
                           sz.width - 16.0f, 94.0f),
               state.hoverTarget == OverlayHoverTarget::RefreshPeople);

    if (state.people.empty()) {
        const wchar_t* emptyText =
            L"No people found. Add people in the dashboard, then refresh.";
        g_cachedRenderTarget->DrawTextW(emptyText,
                                        static_cast<UINT32>(wcslen(emptyText)),
                                        g_bodyFormat.Get(),
                                        D2D1::RectF(16.0f, 120.0f,
                                                    sz.width - 16.0f, 170.0f),
                                        g_mutedBrush.Get());
        return;
    }

    unsigned int visible = 0;
    unsigned int maxRows = maxVisiblePersonRows(static_cast<int>(sz.height));
    unsigned int start = std::min<unsigned int>(
        state.personScrollOffset,
        static_cast<unsigned int>(state.people.size()));
    unsigned int remaining =
        static_cast<unsigned int>(state.people.size()) - start;
    unsigned int limit = std::min<unsigned int>(remaining, maxRows);
    for (unsigned int i = 0; i < limit; ++i) {
        float top = personTop() + visible * (personRowHeight() + personGap());
        drawPersonRow(state.people[start + i],
                      D2D1::RectF(personLeft(), top, personRight(sz.width),
                                  top + personRowHeight()),
                      state.hoverTarget == OverlayHoverTarget::PersonRow &&
                          state.hoverIndex == static_cast<int>(i));
        ++visible;
    }

    if (state.people.size() > maxRows) {
        std::wstring more = L"Showing " + std::to_wstring(start + 1) +
                            L"-" + std::to_wstring(start + limit) +
                            L" of " +
                            std::to_wstring(state.people.size()) +
                            L" people. Scroll for more.";
        g_cachedRenderTarget->DrawTextW(more.c_str(),
                                        static_cast<UINT32>(more.size()),
                                        g_bodyFormat.Get(),
                                        D2D1::RectF(16.0f, sz.height - 42.0f,
                                                    sz.width - 16.0f,
                                                    sz.height - 16.0f),
                                        g_mutedBrush.Get());
    }
}

void drawEndSessionPage(const OverlayRenderState& state, D2D1_SIZE_F sz) {
    D2D1_RECT_F backButton = D2D1::RectF(10.0f, 7.0f, 52.0f, 39.0f);
    drawBackArrow(backButton,
                  state.hoverTarget == OverlayHoverTarget::CancelEndSession);
    g_cachedRenderTarget->DrawTextW(L"End Call", 8, g_titleFormat.Get(),
                                    D2D1::RectF(58.0f, 11.0f,
                                                sz.width - 16.0f, 36.0f),
                                    g_textBrush.Get());

    std::wstring person = state.selectedPersonName.empty()
        ? L"this call"
        : state.selectedPersonName;
    std::wstring title = L"Save call with " + person + L"?";
    g_cachedRenderTarget->DrawTextW(title.c_str(),
                                    static_cast<UINT32>(title.size()),
                                    g_titleFormat.Get(),
                                    D2D1::RectF(16.0f, 70.0f,
                                                sz.width - 16.0f, 96.0f),
                                    g_textBrush.Get());

    const wchar_t* help =
        L"Checked items and captured transcript will be saved to the dashboard.";
    g_cachedRenderTarget->DrawTextW(help, static_cast<UINT32>(wcslen(help)),
                                    g_bodyFormat.Get(),
                                    D2D1::RectF(16.0f, 102.0f,
                                                sz.width - 16.0f, 142.0f),
                                    g_mutedBrush.Get());

    std::wstring summary = std::to_wstring(state.checkedCount) + L" of " +
                           std::to_wstring(state.topicCount) +
                           L" items checked | " +
                           std::to_wstring(state.transcriptTurnCount) +
                           (state.transcriptTurnCount == 1
                                ? L" transcript turn captured"
                                : L" transcript turns captured");
    g_cachedRenderTarget->DrawTextW(summary.c_str(),
                                    static_cast<UINT32>(summary.size()),
                                    g_bodyFormat.Get(),
                                    D2D1::RectF(16.0f, 160.0f,
                                                sz.width - 16.0f, 196.0f),
                                    g_textBrush.Get());

    D2D1_RECT_F box = D2D1::RectF(16.0f, 204.0f, sz.width - 16.0f,
                                  sz.height - 72.0f);
    g_cachedRenderTarget->FillRoundedRectangle(rounded(box, 5.0f),
                                               g_buttonBrush.Get());
    g_cachedRenderTarget->DrawRoundedRectangle(rounded(box, 5.0f),
                                               g_borderBrush.Get(), 1.0f);
    const std::wstring status = state.endSessionStatus.empty()
        ? L"Ready to save."
        : state.endSessionStatus;
    g_cachedRenderTarget->DrawTextW(status.c_str(),
                                    static_cast<UINT32>(status.size()),
                                    g_bodyFormat.Get(),
                                    D2D1::RectF(box.left + 10.0f,
                                                box.top + 10.0f,
                                                box.right - 10.0f,
                                                box.top + 34.0f),
                                    g_mutedBrush.Get());

    const std::wstring transcriptStatus =
        state.hasTranscript
            ? L"Latest transcript: " + state.transcriptPreview
            : L"No transcript captured yet. Save will still keep checked topics.";
    g_cachedRenderTarget->DrawTextW(transcriptStatus.c_str(),
                                    static_cast<UINT32>(transcriptStatus.size()),
                                    g_bodyFormat.Get(),
                                    D2D1::RectF(box.left + 10.0f,
                                                box.top + 42.0f,
                                                box.right - 10.0f,
                                                box.bottom - 10.0f),
                                    g_mutedBrush.Get());

    drawButton(L"Cancel", D2D1::RectF(sz.width - 284.0f, sz.height - 50.0f,
                                      sz.width - 166.0f, sz.height - 16.0f),
               state.hoverTarget == OverlayHoverTarget::CancelEndSession);
    drawButton(L"Save call", D2D1::RectF(sz.width - 154.0f,
                                         sz.height - 50.0f,
                                         sz.width - 16.0f,
                                         sz.height - 16.0f),
               state.hoverTarget == OverlayHoverTarget::SaveEndSession);
}

void drawSectionHeader(const wchar_t* title, unsigned int count,
                       bool collapsed, D2D1_RECT_F rect, bool hovered,
                       ID2D1SolidColorBrush* fillBrush,
                       ID2D1SolidColorBrush* accentBrush) {
    g_cachedRenderTarget->FillRoundedRectangle(
        rounded(rect, 5.0f),
        hovered ? g_buttonHoverBrush.Get() : fillBrush);
    g_cachedRenderTarget->DrawRoundedRectangle(
        rounded(rect, 5.0f),
        hovered ? accentBrush : g_borderBrush.Get(),
        hovered ? 1.3f : 1.0f);
    D2D1_RECT_F marker = D2D1::RectF(rect.left + 6.0f, rect.top + 7.0f,
                                     rect.left + 10.0f, rect.bottom - 7.0f);
    g_cachedRenderTarget->FillRoundedRectangle(rounded(marker, 2.0f),
                                               accentBrush);

    const wchar_t* chevron = collapsed ? L"\xE70D" : L"\xE70E";
    g_cachedRenderTarget->DrawTextW(chevron, 1, g_iconFormat.Get(),
                                    D2D1::RectF(rect.left + 13.0f,
                                                rect.top + 3.0f,
                                                rect.left + 35.0f,
                                                rect.bottom + 1.0f),
                                    accentBrush);

    std::wstring label = std::wstring(title) + L" (" +
                         std::to_wstring(count) + L")";
    g_cachedRenderTarget->DrawTextW(label.c_str(),
                                    static_cast<UINT32>(label.size()),
                                    g_buttonFormat.Get(),
                                    D2D1::RectF(rect.left + 40.0f,
                                                rect.top + 7.0f,
                                                rect.right - 8.0f,
                                                rect.bottom - 4.0f),
                                    g_textBrush.Get());
}

void drawTopicRow(const OverlayTopicRow& topic, D2D1_RECT_F rect,
                  bool hovered) {
    ID2D1SolidColorBrush* rowFill = topic.checked
        ? g_goalHeaderBrush.Get()
        : (hovered ? g_buttonHoverBrush.Get() : g_buttonBrush.Get());
    ID2D1SolidColorBrush* rowBorder = topic.checked
        ? g_goalBrush.Get()
        : (hovered ? g_accentBrush.Get() : g_borderBrush.Get());

    g_cachedRenderTarget->FillRoundedRectangle(rounded(rect, 5.0f),
                                               rowFill);
    g_cachedRenderTarget->DrawRoundedRectangle(rounded(rect, 5.0f),
                                               rowBorder,
                                               hovered || topic.checked
                                                   ? 1.3f
                                                   : 1.0f);
    if (topic.checked) {
        const float stripeX = rect.left + 4.0f;
        g_cachedRenderTarget->DrawLine(
            D2D1::Point2F(stripeX, rect.top + 8.0f),
            D2D1::Point2F(stripeX, rect.bottom - 8.0f),
            g_goalBrush.Get(), 3.0f);
    }

    D2D1_RECT_F box = D2D1::RectF(rect.left + 12.0f, rect.top + 22.0f,
                                 rect.left + 30.0f, rect.top + 40.0f);
    if (topic.checked) {
        g_cachedRenderTarget->FillRectangle(box, g_goalBrush.Get());
        g_cachedRenderTarget->DrawRectangle(box, g_goalBrush.Get(), 1.2f);
        g_cachedRenderTarget->DrawLine(D2D1::Point2F(box.left + 3.0f,
                                                     box.top + 8.0f),
                                       D2D1::Point2F(box.left + 7.0f,
                                                     box.bottom - 3.0f),
                                       g_paperBrush.Get(), 2.0f);
        g_cachedRenderTarget->DrawLine(D2D1::Point2F(box.left + 7.0f,
                                                     box.bottom - 3.0f),
                                       D2D1::Point2F(box.right - 2.0f,
                                                     box.top + 3.0f),
                                       g_paperBrush.Get(), 2.0f);
    } else {
        g_cachedRenderTarget->DrawRectangle(box, g_borderBrush.Get(), 1.2f);
    }

    D2D1_RECT_F textRect = D2D1::RectF(rect.left + 42.0f, rect.top + 9.0f,
                                      rect.right - 10.0f, rect.bottom - 7.0f);
    g_cachedRenderTarget->DrawTextW(topic.label.c_str(),
                                    static_cast<UINT32>(topic.label.size()),
                                    g_topicFormat.Get(), textRect,
                                    topic.checked ? g_mutedBrush.Get()
                                                  : g_textBrush.Get());
}

}  // namespace

void renderOverlay(IDXGISwapChain* swapChain, const OverlayRenderState& state) {
    if (!ensureFactories()) return;
    if (!ensureRenderTarget(swapChain)) return;

    g_cachedRenderTarget->BeginDraw();
    g_cachedRenderTarget->Clear(D2D1::ColorF(0, 0.0f));

    D2D1_SIZE_F sz = g_cachedRenderTarget->GetSize();
    D2D1_RECT_F outer = D2D1::RectF(0.5f, 0.5f, sz.width - 0.5f,
                                   sz.height - 0.5f);
    D2D1_RECT_F header = D2D1::RectF(0.5f, 0.5f, sz.width - 0.5f, 46.0f);
    D2D1_RECT_F body = D2D1::RectF(18.0f, 66.0f, sz.width - 18.0f,
                                  sz.height - 60.0f);
    D2D1_RECT_F endButton = D2D1::RectF(10.0f, sz.height - 40.0f,
                                       82.0f, sz.height - 10.0f);
    D2D1_RECT_F settingsButton = D2D1::RectF(sz.width - 44.0f,
                                            sz.height - 44.0f,
                                            sz.width - 10.0f,
                                            sz.height - 10.0f);

    g_cachedRenderTarget->FillRoundedRectangle(rounded(outer, 7.0f),
                                               g_paperBrush.Get());
    g_cachedRenderTarget->DrawRoundedRectangle(rounded(outer, 7.0f),
                                               g_borderBrush.Get(), 1.0f);
    g_cachedRenderTarget->FillRectangle(header, g_headerBrush.Get());
    g_cachedRenderTarget->DrawLine(D2D1::Point2F(0.5f, 46.0f),
                                   D2D1::Point2F(sz.width - 0.5f, 46.0f),
                                   g_borderBrush.Get(), 1.0f);

    if (state.page == OverlayPage::Settings) {
        drawSettingsPage(state, sz);
    } else if (state.page == OverlayPage::PersonPicker) {
        drawPickerPage(state, sz);
    } else if (state.page == OverlayPage::EndSession) {
        drawEndSessionPage(state, sz);
    } else {
        g_cachedRenderTarget->DrawTextW(L"Call Brief", 10,
                                        g_titleFormat.Get(),
                                        D2D1::RectF(16.0f, 11.0f,
                                                    sz.width - 166.0f, 36.0f),
                                        g_textBrush.Get());

        std::wstring status = state.sessionActive
            ? (std::to_wstring(state.checkedCount) + L"/" +
               std::to_wstring(state.topicCount) + L" checked")
            : L"Idle - click Start to pick a person";
        g_cachedRenderTarget->DrawTextW(status.c_str(),
                                        static_cast<UINT32>(status.size()),
                                        g_bodyFormat.Get(), body,
                                        state.sessionActive ? g_textBrush.Get()
                                                            : g_mutedBrush.Get());

        if (state.sessionActive && !state.realtimeStatus.empty()) {
            D2D1_RECT_F rtBody = D2D1::RectF(body.left, body.bottom + 4.0f,
                                             body.right, body.bottom + 23.0f);
            bool isError = !state.realtimeError.empty() ||
                           state.realtimeStatus == L"error";
            ID2D1SolidColorBrush* rtBrush = isError
                ? g_accentBrush.Get() : g_mutedBrush.Get();
            std::wstring rtText = isError && !state.realtimeError.empty()
                ? (L"AI: " + state.realtimeError)
                : L"AI: " + state.realtimeStatus;
            g_cachedRenderTarget->DrawTextW(
                rtText.c_str(), static_cast<UINT32>(rtText.size()),
                g_bodyFormat.Get(), rtBody, rtBrush);
        }

        if (!state.sessionActive) {
            D2D1_RECT_F hint = D2D1::RectF(18.0f, 112.0f, sz.width - 18.0f,
                                          190.0f);
            const wchar_t* hintText =
                L"Click Start below to pick a person and load their call brief questions.";
            g_cachedRenderTarget->DrawTextW(
                hintText, static_cast<UINT32>(wcslen(hintText)),
                g_bodyFormat.Get(), hint, g_mutedBrush.Get());
        } else if (state.topics.empty()) {
            D2D1_RECT_F hint = D2D1::RectF(18.0f, 112.0f, sz.width - 18.0f,
                                          190.0f);
            const wchar_t* emptyText =
                L"No questions found. Generate call prep for this person, or switch people.";
            g_cachedRenderTarget->DrawTextW(
                emptyText, static_cast<UINT32>(wcslen(emptyText)),
                g_bodyFormat.Get(), hint, g_mutedBrush.Get());
        } else {
            const float maxBottom = sz.height - topicAreaBottomMargin();
            const float right = topicRight(sz.width, false);
            float y = topicTop();
            std::vector<ChecklistEntry> entries = checklistEntries(
                state.topics, state.goalsCollapsed, state.questionsCollapsed);
            unsigned int offset = std::min<unsigned int>(
                state.scrollOffset, static_cast<unsigned int>(entries.size()));
            unsigned int questionCount = 0;
            for (const auto& topic : state.topics) {
                if (topic.category == TopicCategory::Question) ++questionCount;
            }

            for (unsigned int i = offset; i < entries.size(); ++i) {
                const ChecklistEntry& entry = entries[i];
                if (entry.kind == ChecklistEntry::Kind::QuestionHeader) {
                    float bottom = y + sectionHeaderHeight();
                    if (bottom > maxBottom) break;
                    D2D1_RECT_F rect =
                        D2D1::RectF(topicLeft(), y, right, bottom);
                    drawSectionHeader(
                        L"Questions",
                        questionCount,
                        state.questionsCollapsed,
                        rect,
                        state.hoverTarget ==
                            OverlayHoverTarget::QuestionSection,
                        g_questionHeaderBrush.Get(),
                        g_questionBrush.Get());
                    y = bottom + topicGap();
                    continue;
                }

                float bottom = y + topicRowHeight();
                if (bottom > maxBottom) break;
                drawTopicRow(
                    state.topics[entry.topicIndex],
                    D2D1::RectF(topicLeft(), y, right, bottom),
                    state.hoverTarget == OverlayHoverTarget::TopicRow &&
                        state.hoverIndex == entry.visibleTopicIndex);
                y = bottom + topicGap();
            }

            unsigned int maxOffset = maxChecklistScrollOffset(
                0, questionCount, state.goalsCollapsed,
                state.questionsCollapsed, static_cast<int>(sz.height));
            if (maxOffset > 0) {
                float cx = sz.width - 14.0f;
                ID2D1SolidColorBrush* upBrush =
                    state.scrollOffset > 0 ? g_textBrush.Get()
                                           : g_borderBrush.Get();
                ID2D1SolidColorBrush* downBrush =
                    state.scrollOffset < maxOffset ? g_textBrush.Get()
                                                   : g_borderBrush.Get();
                g_cachedRenderTarget->DrawLine(
                    D2D1::Point2F(cx - 4.0f, topicTop() + 10.0f),
                    D2D1::Point2F(cx, topicTop() + 6.0f), upBrush, 1.5f);
                g_cachedRenderTarget->DrawLine(
                    D2D1::Point2F(cx, topicTop() + 6.0f),
                    D2D1::Point2F(cx + 4.0f, topicTop() + 10.0f),
                    upBrush, 1.5f);
                g_cachedRenderTarget->DrawLine(
                    D2D1::Point2F(cx - 4.0f, maxBottom - 10.0f),
                    D2D1::Point2F(cx, maxBottom - 6.0f), downBrush, 1.5f);
                g_cachedRenderTarget->DrawLine(
                    D2D1::Point2F(cx, maxBottom - 6.0f),
                    D2D1::Point2F(cx + 4.0f, maxBottom - 10.0f),
                    downBrush, 1.5f);
            }
        }

        if (state.sessionActive) {
            drawButton(L"End", endButton,
                       state.hoverTarget == OverlayHoverTarget::StartEnd);
        } else {
            drawButton(L"Start", endButton,
                       state.hoverTarget == OverlayHoverTarget::StartEnd);
        }

        drawButton(L"", settingsButton,
                   state.hoverTarget == OverlayHoverTarget::Settings);
        drawSettingsGlyph(settingsButton);
        drawPersonDropdown(state, sz);
    }

    HRESULT hr = g_cachedRenderTarget->EndDraw();
    if (hr == D2DERR_RECREATE_TARGET) {
        g_cachedRenderTarget.Reset();
        g_paperBrush.Reset();
        g_headerBrush.Reset();
        g_borderBrush.Reset();
        g_textBrush.Reset();
        g_mutedBrush.Reset();
        g_buttonBrush.Reset();
        g_buttonHoverBrush.Reset();
        g_accentBrush.Reset();
        g_goalBrush.Reset();
        g_goalHeaderBrush.Reset();
        g_questionBrush.Reset();
        g_questionHeaderBrush.Reset();
        g_signalBrush.Reset();
        g_cachedSwapChain = nullptr;
    }
}

unsigned int maxVisibleTopicRows(int overlayHeightDip) {
    return visibleChecklistRows(overlayHeightDip);
}

unsigned int maxChecklistScrollOffset(unsigned int goalCount,
                                      unsigned int questionCount,
                                      bool goalsCollapsed,
                                      bool questionsCollapsed,
                                      int overlayHeightDip) {
    (void)goalCount;
    (void)goalsCollapsed;
    unsigned int entries = 0;
    if (questionCount > 0) {
        ++entries;
        if (!questionsCollapsed) entries += questionCount;
    }
    unsigned int visible = visibleChecklistRows(overlayHeightDip);
    return entries > visible ? entries - visible : 0;
}

int topicSectionAtPoint(int x, int y,
                        unsigned int goalCount,
                        unsigned int questionCount,
                        bool goalsCollapsed,
                        bool questionsCollapsed,
                        unsigned int scrollOffset) {
    (void)goalCount;
    (void)goalsCollapsed;
    const float fx = static_cast<float>(x);
    const float fy = static_cast<float>(y);
    if (fx < topicLeft() || fy < topicTop()) return -1;

    std::vector<OverlayTopicRow> topics;
    for (unsigned int i = 0; i < questionCount; ++i) {
        topics.push_back({L"", TopicCategory::Question, false});
    }
    std::vector<ChecklistEntry> entries =
        checklistEntries(topics, goalsCollapsed, questionsCollapsed);
    float top = topicTop();
    for (unsigned int i = scrollOffset; i < entries.size(); ++i) {
        const ChecklistEntry& entry = entries[i];
        float height = entry.kind == ChecklistEntry::Kind::Topic
            ? topicRowHeight()
            : sectionHeaderHeight();
        float bottom = top + height;
        if (fy >= top && fy <= bottom) {
            if (entry.kind == ChecklistEntry::Kind::QuestionHeader) return 1;
            return -1;
        }
        top = bottom + topicGap();
    }
    return -1;
}

int topicIndexAtPoint(int x, int y,
                      unsigned int goalCount,
                      unsigned int questionCount,
                      bool goalsCollapsed,
                      bool questionsCollapsed,
                      unsigned int scrollOffset) {
    (void)goalCount;
    (void)goalsCollapsed;
    const float fx = static_cast<float>(x);
    const float fy = static_cast<float>(y);
    if (fx < topicLeft() || fy < topicTop()) return -1;

    std::vector<OverlayTopicRow> topics;
    for (unsigned int i = 0; i < questionCount; ++i) {
        topics.push_back({L"", TopicCategory::Question, false});
    }
    std::vector<ChecklistEntry> entries =
        checklistEntries(topics, goalsCollapsed, questionsCollapsed);
    float top = topicTop();
    for (unsigned int i = scrollOffset; i < entries.size(); ++i) {
        const ChecklistEntry& entry = entries[i];
        float height = entry.kind == ChecklistEntry::Kind::Topic
            ? topicRowHeight()
            : sectionHeaderHeight();
        float bottom = top + height;
        if (fy >= top && fy <= bottom) {
            return entry.kind == ChecklistEntry::Kind::Topic
                ? entry.visibleTopicIndex
                : -1;
        }
        top = bottom + topicGap();
    }
    return -1;
}

int personIndexAtPoint(int x, int y, unsigned int visiblePersonCount) {
    const float fx = static_cast<float>(x);
    const float fy = static_cast<float>(y);
    if (fx < personLeft() || fy < personTop()) {
        return -1;
    }
    const float stride = personRowHeight() + personGap();
    int index = static_cast<int>((fy - personTop()) / stride);
    if (index < 0 || static_cast<unsigned int>(index) >= visiblePersonCount) {
        return -1;
    }
    float rowTop = personTop() + index * stride;
    float rowBottom = rowTop + personRowHeight();
    if (fy >= rowTop && fy <= rowBottom) return index;
    return -1;
}

unsigned int maxVisiblePersonRows(int overlayHeightDip) {
    return visiblePickerRows(overlayHeightDip);
}

unsigned int maxPersonScrollOffset(unsigned int personCount,
                                   int overlayHeightDip) {
    unsigned int visible = maxVisiblePersonRows(overlayHeightDip);
    return personCount > visible ? personCount - visible : 0;
}

void releaseRendererResources() {
    g_cachedRenderTarget.Reset();
    g_paperBrush.Reset();
    g_headerBrush.Reset();
    g_borderBrush.Reset();
    g_textBrush.Reset();
    g_mutedBrush.Reset();
    g_buttonBrush.Reset();
    g_buttonHoverBrush.Reset();
    g_accentBrush.Reset();
    g_goalBrush.Reset();
    g_goalHeaderBrush.Reset();
    g_questionBrush.Reset();
    g_questionHeaderBrush.Reset();
    g_signalBrush.Reset();
    g_titleFormat.Reset();
    g_bodyFormat.Reset();
    g_titleNoWrapFormat.Reset();
    g_bodyNoWrapFormat.Reset();
    g_buttonFormat.Reset();
    g_iconFormat.Reset();
    g_topicFormat.Reset();
    g_dwriteFactory.Reset();
    g_d2dFactory.Reset();
    g_cachedSwapChain = nullptr;
}

}  // namespace foundry::overlay
