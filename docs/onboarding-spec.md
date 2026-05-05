# Onboarding Spec

## Purpose

The onboarding flow is a guided chat that collects enough structured information about a founder's idea to generate a Foundation document. It runs once per project, before the founder reaches the main workspace.

The onboarding page shows only a scrollable chat. No Foundation preview. No sidebar. After completion, the Foundation is generated and the user is redirected to `/dashboard/[slug]/foundation`.

---

## User Experience

- Scrollable chat transcript, newest message at bottom
- Auto-scrolls to bottom on new message unless the user has scrolled up
- Starts with one open-ended kickoff question
- Follows up with AI-generated multiple-choice questions per slot
- Always includes a `Something else` option — never in model output, always appended by UI
- Text input only appears when `Something else` is selected
- Inputs are disabled while a response is loading

---

## Chat Flow

### Turn 1 — Kickoff
Assistant asks: *"What are you building?"*

User responds in open text. AI extracts `ideaSummary` from the answer.

### Turns 2–7 — Slot questions
For each remaining slot:
- System chooses the next slot (deterministic, not AI-driven)
- AI generates a question + 3–5 answer choices for that slot
- UI appends `Something else`
- User picks a choice or types a custom answer

### Completion
When required slots are filled:
- Show a finish action
- Generate Foundation from onboarding state
- Redirect to `/dashboard/[slug]/foundation`

---

## Slot Definitions

### Required
| Slot | What it captures |
|---|---|
| `ideaSummary` | One-line description of what is being built and for whom |
| `targetUser` | Specific person type who has the problem |
| `painPoint` | The problem — concrete, not abstract |
| `valueProp` | What the product does for them |
| `idealPeopleTypes` | Who the founder should be talking to first |

### Optional
| Slot | What it captures |
|---|---|
| `differentiation` | What makes this different from current solutions |
| `disqualifiers` | Who is not a good interview target even if they seem like one |

### Slot order
Ask missing required slots first, then weak required slots, then optional slots.

1. ideaSummary
2. targetUser
3. painPoint
4. valueProp
5. idealPeopleTypes
6. differentiation
7. disqualifiers

---

## Hidden Onboarding State

Not shown in the UI. Used to track slot quality, choose next slot, and generate Foundation.

```ts
type SlotQuality = 'missing' | 'weak' | 'solid';

type OnboardingState = {
  ideaSummary: string | null;
  targetUser: string | null;
  painPoint: string | null;
  valueProp: string | null;
  idealPeopleTypes: string[];
  differentiation: string | null;
  disqualifiers: string[];

  completeness: {
    ideaSummary: SlotQuality;
    targetUser: SlotQuality;
    painPoint: SlotQuality;
    valueProp: SlotQuality;
    idealPeopleTypes: SlotQuality;
    differentiation: SlotQuality;
    disqualifiers: SlotQuality;
  };
};
```

---

## Completion Rule

Onboarding is finishable when all 5 required slots are not missing.

Stronger threshold (recommended): at least 3 of the 5 required slots are `solid`.

---

## Data Model

### `onboarding_sessions`
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| project_id | uuid | |
| status | text | `active`, `ready`, `completed` |
| current_slot | text | |
| started_at | timestamp | |
| completed_at | timestamp | |
| progress_json | jsonb | |

### `onboarding_messages`
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| session_id | uuid | |
| project_id | uuid | |
| role | text | `assistant`, `user` |
| content | text | |
| message_type | text | `question`, `choice_answer`, `custom_answer`, `system` |
| created_at | timestamp | |

### `onboarding_state`
| Field | Type | Notes |
|---|---|---|
| project_id | uuid | |
| state_json | jsonb | |
| updated_at | timestamp | |

### `project_foundations`
| Field | Type | Notes |
|---|---|---|
| project_id | uuid | |
| foundation_json | jsonb | |
| generated_at | timestamp | |
| updated_at | timestamp | |

---

## AI Tasks

### `extractKickoffIdea`
Interprets the first open-ended answer. Populates `ideaSummary`.

```ts
// Input
{ kickoffMessage: string }

// Output
{ ideaSummary: string; quality: 'weak' | 'solid' }
```

### `generateNextQuestionWithChoices`
Generates the next question and 3–5 choices for a given slot.

```ts
// Input
{ targetSlot: string; recentMessages: Message[]; onboardingState: OnboardingState }

// Output
{
  targetSlot: string;
  question: string;
  choices: { id: string; label: string; normalizedValue: string; slotKey: string }[];
  customPlaceholder: string;
}
```

Model does not generate `Something else`. UI always appends it.

### `extractCustomSlotAnswer`
Interprets a typed custom answer after the user selects `Something else`.

```ts
// Input
{ targetSlot: string; customText: string; recentMessages: Message[]; onboardingState: OnboardingState }

// Output
{ slotKey: string; value: string | string[]; quality: 'weak' | 'solid' }
```

### `generateFoundationFromOnboarding`
Generates the Foundation after onboarding completes.

```ts
// Input
{ messages: Message[]; state: OnboardingState }

// Output
{
  foundation: {
    summary: string;
    targetUser: string;
    painPoint: string;
    valueProp: string;
    idealPeopleTypes: string[];
    differentiation?: string | null;
    disqualifiers?: string[];
  }
}
```

---

## Choice Validation

Before showing choices to the user:
- Count must be 3–5
- All choices must map to the target slot
- No duplicate labels
- No label over ~60 characters
- All normalized values must be non-empty

On failure: regenerate once. If still invalid, use static fallback choices for that slot.

---

## Turn Flow

### Kickoff turn
1. Save user message
2. Run `extractKickoffIdea`
3. Update onboarding state
4. Choose next slot
5. Run `generateNextQuestionWithChoices`
6. Save assistant message
7. Return transcript + current turn

### Choice selected
1. Save user message (choice label)
2. Map choice into onboarding state
3. Update slot quality
4. Choose next slot
5. Run `generateNextQuestionWithChoices`
6. Save assistant message
7. Return transcript + current turn

### Something else selected
1. Save user custom message
2. Run `extractCustomSlotAnswer`
3. Update onboarding state + slot quality
4. Choose next slot
5. Run `generateNextQuestionWithChoices`
6. Save assistant message
7. Return transcript + current turn

### Finish
1. Mark session complete
2. Run `generateFoundationFromOnboarding`
3. Save Foundation
4. Redirect to `/dashboard/[slug]/foundation`

---

## Architecture

App logic never calls provider SDKs directly. All AI calls go through task functions → provider adapter → model router.

```ts
type AITaskName =
  | 'onboarding.extractKickoffIdea'
  | 'onboarding.generateNextQuestionWithChoices'
  | 'onboarding.extractCustomSlotAnswer'
  | 'foundation.generateFoundationFromOnboarding';

interface AIProvider {
  generateJson<T>(input: { taskName: string; model?: string; messages: AIMessage[]; schemaName: string }): Promise<T>;
}

interface ModelRouter {
  resolve(taskName: AITaskName): { provider: 'openai' | 'anthropic'; model: string };
}
```

Even if only one provider is used in MVP, implement this structure from the start.

---

## Folder Structure

```
src/
  ai/
    providers/
      base.ts
      openai.ts
      anthropic.ts
    router/
      model-router.ts
    tasks/
      onboarding/
        extract-kickoff-idea.ts
        generate-next-question-with-choices.ts
        extract-custom-slot-answer.ts
      foundation/
        generate-foundation-from-onboarding.ts

  lib/
    onboarding/
      slot-definitions.ts
      choose-next-slot.ts
      merge-onboarding-state.ts
      validate-generated-choices.ts
      fallback-choices.ts
```

---

## What's Built (MVP)

- [x] Onboarding chat page with scrollable transcript
- [x] Kickoff open-ended question
- [x] AI-generated multiple-choice turns
- [x] `Something else` custom input path
- [x] Deterministic slot progression
- [x] Hidden onboarding state
- [x] Foundation generation after completion
- [x] Redirect to Foundation page

## Not Built Yet

- [ ] Live Foundation preview during onboarding
- [ ] Re-run or refine onboarding after completion
- [ ] Multi-provider A/B testing
- [ ] Slot confidence UI
- [ ] Advanced analytics / observability
- [ ] People-search criteria generation after Foundation
- [ ] **Live call brief overlay** — real-time Zoom integration where transcription crosses off questions as they're covered during the call (planned for Phase 2, see `call-brief-spec.md`)
