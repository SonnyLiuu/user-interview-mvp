#pragma once
#include <string>
#include <vector>

struct IDXGISwapChain;

namespace foundry::overlay {

enum class TopicCategory {
    Goal,
    Question,
    Signal,
};

enum class OverlayPage {
    Notepad,
    Settings,
    PersonPicker,
    EndSession,
};

enum class OverlayHoverTarget {
    None,
    Back,
    Settings,
    StartEnd,
    SignIn,
    AuthSelfTest,
    ClearAuth,
    ResetOverlay,
    SaveEndSession,
    CancelEndSession,
    PersonDropdown,
    RefreshPeople,
    GoalSection,
    QuestionSection,
    PersonRow,
    TopicRow,
};

struct OverlayTopicRow {
    std::wstring label;
    TopicCategory category = TopicCategory::Goal;
    bool checked = false;
};

struct OverlayPersonRow {
    std::wstring id;
    std::wstring name;
    std::wstring meta;
};

struct OverlayRenderState {
    OverlayPage page = OverlayPage::Notepad;
    OverlayHoverTarget hoverTarget = OverlayHoverTarget::None;
    int hoverIndex = -1;
    bool sessionActive = false;
    bool hasAuthToken = false;
    bool personDropdownOpen = false;
    bool goalsCollapsed = false;
    bool questionsCollapsed = false;
    unsigned int topicCount = 0;
    unsigned int goalCount = 0;
    unsigned int checkedCount = 0;
    unsigned int scrollOffset = 0;
    std::wstring apiBaseUrl;
    std::wstring settingsStatus;
    std::wstring pickerStatus;
    std::wstring endSessionStatus;
    std::wstring selectedPersonName;
    std::vector<OverlayTopicRow> topics;
    std::vector<OverlayPersonRow> people;
};

// Renders the notepad overlay shell into the swap chain's current back buffer.
// Caller must Present afterwards.
void renderOverlay(IDXGISwapChain* swapChain, const OverlayRenderState& state);

// Returns 0 for Goals, 1 for Questions, or -1 when not over a section header.
int topicSectionAtPoint(int x, int y,
                        unsigned int goalCount,
                        unsigned int questionCount,
                        bool goalsCollapsed,
                        bool questionsCollapsed,
                        unsigned int scrollOffset);

// Returns the zero-based visible checklist row at the given client coordinate,
// or -1. Signals are not included in this count.
int topicIndexAtPoint(int x, int y,
                      unsigned int goalCount,
                      unsigned int questionCount,
                      bool goalsCollapsed,
                      bool questionsCollapsed,
                      unsigned int scrollOffset);

unsigned int maxChecklistScrollOffset(unsigned int goalCount,
                                      unsigned int questionCount,
                                      bool goalsCollapsed,
                                      bool questionsCollapsed,
                                      int overlayHeightDip);

// Returns the zero-based visible person row at the given client coordinate,
// or -1 when the click is outside the picker list.
int personIndexAtPoint(int x, int y, unsigned int visiblePersonCount);

// Maximum number of topic rows that fit inside an overlay of the given client
// height (in DIPs). Used by the host to compute the visible window given the
// current scroll offset.
unsigned int maxVisibleTopicRows(int overlayHeightDip);

// Drops cached D2D / DWrite resources. Call before exit.
void releaseRendererResources();

}  // namespace foundry::overlay
