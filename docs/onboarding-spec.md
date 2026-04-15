# AI Onboarding Chat - Implementation Spec

## Purpose

The onboarding flow is a guided AI chat that collects enough structured information about a project so the app can generate a polished Foundation afterward.

The onboarding page itself does not show a live Foundation.
It only shows a scrollable chat conversation with AI-guided questions.

After onboarding is complete:
- generate the Foundation
- save it
- redirect user to `/dashboard/[slug]/foundation`

---

# Product Behavior

## User experience

The onboarding page should:

- show a scrollable chat transcript
- allow scrolling upward to review previous messages
- keep the latest turn at the bottom
- begin with one open-ended kickoff question
- continue with AI-generated multiple-choice follow-up questions
- always include a final `Something else` option
- show a text input only when `Something else` is selected
- save each assistant question and each user answer as chat messages
- decide completion behind the scenes using hidden structured onboarding state

## Chat flow

### First turn
Assistant asks:
- "What are you building?"

User responds with open text.

### Following turns
System:
- chooses the next slot to ask about
- generates a question for that slot
- generates 3 to 5 answer choices
- UI appends `Something else`

User either:
- clicks a generated choice
- or chooses `Something else` and types a custom answer

### Completion
When required slots are strong enough:
- show a finish action
- generate Foundation from onboarding
- redirect to Foundation page

---

# Full Feature Plan

## Full vision

The full system should support:

- chat-only onboarding experience
- scrollable transcript with full history
- hidden slot-based state collection
- AI-generated contextual choices each turn
- deterministic slot progression logic
- custom-answer extraction
- final Foundation generation after onboarding
- downstream people-search criteria generation
- model-portable architecture with provider adapters
- validation and fallback for generated choices
- background jobs for post-onboarding generation and retries
- analytics / observability for AI turn quality
- optional later support for re-running onboarding or refining Foundation

## Architecture layers

### 1. App layer
Owns:
- routes
- auth
- server actions / API routes
- DB reads/writes
- UI state

### 2. Onboarding engine
Owns:
- slot definitions
- hidden onboarding state shape
- choose-next-slot logic
- merge/update logic
- completion rules

### 3. AI task layer
Owns:
- kickoff extraction
- next question generation
- custom answer extraction
- final Foundation generation

### 4. Provider layer
Owns:
- OpenAI adapter
- Anthropic adapter
- future adapters

### 5. Model router
Owns:
- mapping task name -> provider/model

The app should never directly depend on one provider SDK inside product logic.

---

# Core Onboarding Data Model

## Projects
Stores the project itself.

Suggested fields:
- id
- user_id
- name
- slug
- status
- created_at
- updated_at

## Onboarding Sessions
Tracks one onboarding run.

Suggested fields:
- id
- project_id
- status (`active`, `ready`, `completed`)
- current_slot
- started_at
- completed_at
- progress_json

## Onboarding Messages
Stores chat transcript.

Suggested fields:
- id
- session_id
- project_id
- role (`assistant`, `user`)
- content
- message_type (`question`, `choice_answer`, `custom_answer`, `system`)
- created_at

## Onboarding State
Stores the hidden structured state collected during chat.

Suggested fields:
- project_id
- state_json
- updated_at

## Project Foundations
Created after onboarding finishes.

Suggested fields:
- project_id
- foundation_json
- generated_at
- updated_at

---

# Hidden Onboarding State

## Purpose

This is not shown on the onboarding page.
It is internal state used to:
- decide what to ask next
- know what is missing
- know when onboarding is complete
- generate the final Foundation later

## Suggested MVP shape

```ts
type SlotQuality = "missing" | "weak" | "solid";

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

# Slot Plan

## Required MVP slots

* ideaSummary
* targetUser
* painPoint
* valueProp
* idealPeopleTypes

## Optional later / v1 slots

* differentiation
* disqualifiers

## Slot order for MVP

Use deterministic app logic, not AI, to choose the next slot.

Recommended order:

1. ideaSummary
2. targetUser
3. painPoint
4. valueProp
5. idealPeopleTypes
6. differentiation
7. disqualifiers

Rule:

* ask missing required slots first
* then weak required slots
* then optional slots
* then finish

---

# AI Task Design

## 1. extractKickoffIdea

Purpose:

* interpret the first open-ended answer
* populate `ideaSummary`

Input:

* kickoff user message

Output:

```ts
type ExtractKickoffIdeaResult = {
  ideaSummary: string;
  quality: "weak" | "solid";
};
```

## 2. generateNextQuestionWithChoices

Purpose:

* generate the next question for a chosen slot
* generate 3 to 5 contextual choices
* return custom placeholder text

Input:

* target slot
* recent messages
* onboarding state

Output:

```ts
type GeneratedChoice = {
  id: string;
  label: string;
  normalizedValue: string;
  slotKey: string;
};

type GenerateNextQuestionWithChoicesResult = {
  targetSlot: string;
  question: string;
  choices: GeneratedChoice[];
  customPlaceholder: string;
};
```

Important:

* UI appends `Something else`
* model should not generate `Something else`

## 3. extractCustomSlotAnswer

Purpose:

* interpret a typed custom answer after user selects `Something else`

Input:

* target slot
* custom text
* recent messages
* onboarding state

Output:

```ts
type ExtractCustomSlotAnswerResult = {
  slotKey: string;
  value: string | string[];
  quality: "weak" | "solid";
};
```

## 4. generateFoundationFromOnboarding

Purpose:

* generate the final Foundation after onboarding completes

Input:

* onboarding messages
* onboarding state

Output:

```ts
type GenerateFoundationFromOnboardingResult = {
  foundation: {
    summary: string;
    targetUser: string;
    painPoint: string;
    valueProp: string;
    idealPeopleTypes: string[];
    differentiation?: string | null;
    disqualifiers?: string[];
  };
};
```

---

# Choice Generation Rules

AI-generated choices each turn should be constrained.

## Requirements

* target exactly one slot
* generate 3 to 5 distinct choices
* choices must be concrete
* choices must not overlap heavily
* choices must reflect project context
* labels should be concise
* each choice must include a normalized value
* no `Something else` in model output

## Validation before showing to user

Validate:

* number of choices is 3 to 5
* all choices map to the target slot
* labels are not duplicates
* labels are not too long
* normalized values exist

If validation fails:

* regenerate once
* if still bad, use static fallback choices for that slot

---

# Onboarding Turn Flow

## Start onboarding

1. create onboarding session
2. create empty onboarding state
3. save first assistant question
4. render onboarding page

## Kickoff turn

1. user answers open-ended kickoff
2. save user message
3. run `extractKickoffIdea`
4. update hidden onboarding state
5. choose next slot
6. run `generateNextQuestionWithChoices`
7. save assistant message
8. return updated transcript + current turn

## Structured turn - generated choice selected

1. save user message using clicked choice label
2. map selected choice into hidden onboarding state
3. update slot quality
4. choose next slot
5. run `generateNextQuestionWithChoices`
6. save assistant message
7. return updated transcript + current turn

## Structured turn - Something else selected

1. save user custom message
2. run `extractCustomSlotAnswer`
3. update hidden onboarding state
4. update slot quality
5. choose next slot
6. run `generateNextQuestionWithChoices`
7. save assistant message
8. return updated transcript + current turn

## Finish onboarding

1. mark onboarding session complete
2. run `generateFoundationFromOnboarding`
3. save Foundation in `project_foundations`
4. optionally trigger people-search criteria generation
5. redirect to `/dashboard/[slug]/foundation`

---

# Completion Rules

## MVP completion rule

Onboarding is finishable when:

Required slots:

* ideaSummary is not missing
* targetUser is not missing
* painPoint is not missing
* valueProp is not missing
* idealPeopleTypes is not missing

Suggested stronger threshold:

* at least 3 of the 5 required slots are `solid`

---

# UI Implementation Plan

## Onboarding page

### Layout

* full-height page
* one central scrollable chat column

### Chat transcript

* assistant messages
* user messages
* previous turns preserved
* scroll upward allowed at all times
* newest message at bottom
* auto-scroll to bottom on new message unless user intentionally scrolled away

### Current turn UI

At the bottom of the thread:

* assistant question
* generated choice buttons/cards
* `Something else`
* text input appears only if `Something else` selected

### Message behavior

* selected choices should render as normal user messages
* custom text answers render as normal user messages

### Loading states

* disable inputs during submit
* show assistant pending/loading state before next message appears

---

# Model-Portability Plan

## Requirements

* no provider SDK calls directly in onboarding route handlers
* all provider-specific logic hidden behind adapters
* model choice resolved through router
* task outputs validated into app-owned schemas

## Base provider shape

```ts
type AIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type AIJsonRequest = {
  taskName: string;
  model?: string;
  messages: AIMessage[];
  schemaName: string;
};

interface AIProvider {
  generateJson<T>(input: AIJsonRequest): Promise<T>;
}
```

## Router shape

```ts
type AITaskName =
  | "onboarding.extractKickoffIdea"
  | "onboarding.generateNextQuestionWithChoices"
  | "onboarding.extractCustomSlotAnswer"
  | "foundation.generateFoundationFromOnboarding";

type ModelRoute = {
  provider: "openai" | "anthropic";
  model: string;
};

interface ModelRouter {
  resolve(taskName: AITaskName): ModelRoute;
}
```

Even if MVP uses only one provider/model, still implement this structure now.

---

# Suggested Folder Structure

```text
src/
  app/
    (app)/
      dashboard/
        [slug]/
          onboarding/
            page.tsx
          (workspace)/
            foundation/
              page.tsx

  ai/
    providers/
      base.ts
      openai.ts
      anthropic.ts
    router/
      model-router.ts
    schemas/
      onboarding.ts
      foundation.ts
    prompts/
      onboarding/
        extract-kickoff-idea.ts
        generate-next-question.ts
        extract-custom-slot-answer.ts
      foundation/
        generate-foundation-from-onboarding.ts
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

# Full Feature Plan vs MVP Cut

## Full feature plan

The full version should include:

* open-ended kickoff
* AI-generated choices each turn
* `Something else`
* hidden slot state
* Foundation generation after onboarding
* people-search criteria generation after Foundation
* validation + fallback choice generation
* provider adapters and model router
* background job support for Foundation regeneration
* observability for latency, model selection, and failures
* optional re-run / refine onboarding later
* optional optional-slot refinement before finish
* better analytics and quality scoring later

## Current MVP implementation

The MVP should include only:

### Included

* onboarding chat page
* scrollable transcript with previous messages visible
* kickoff open-ended question
* 5 required hidden slots:

  * ideaSummary
  * targetUser
  * painPoint
  * valueProp
  * idealPeopleTypes
* AI-generated multiple-choice turns after kickoff
* `Something else` custom input path
* deterministic choose-next-slot logic
* onboarding session table
* onboarding messages table
* onboarding state table
* final Foundation generation after completion
* Foundation saved and user redirected to Foundation page
* one provider adapter
* one model router
* choice validation + one fallback regeneration attempt

### Not in MVP

* live Foundation preview during onboarding
* user-editable Foundation during onboarding
* multi-provider A/B tests
* slot confidence UI
* advanced analytics dashboard
* version history
* complicated background retries per turn
* optional slot refinement flow unless easy to add
* people-search criteria generation unless time remains after Foundation generation works

---

# MVP Build Order

## Phase 1

* define slot keys
* define onboarding state schema
* create DB tables:

  * onboarding_sessions
  * onboarding_messages
  * onboarding_state
  * project_foundations

## Phase 2

* implement deterministic `chooseNextSlot()`
* implement onboarding state merge/update helpers
* create kickoff question flow

## Phase 3

* implement provider interface
* implement one provider adapter
* implement model router

## Phase 4

* implement `extractKickoffIdea`
* implement `generateNextQuestionWithChoices`
* implement `extractCustomSlotAnswer`

## Phase 5

* build onboarding chat UI
* render transcript
* render choices
* render `Something else`
* support upward scroll review
* wire submission flow

## Phase 6

* implement generated-choice validation
* add fallback behavior

## Phase 7

* implement `generateFoundationFromOnboarding`
* save Foundation
* redirect to Foundation page

---

# Recommended MVP Definition

A project onboarding is considered MVP-complete when a user can:

1. create a project
2. enter a chat-only onboarding flow
3. answer the first question in open text
4. answer follow-up questions mostly through AI-generated choices
5. use `Something else` when needed
6. scroll upward and review prior messages
7. complete onboarding once enough information is gathered
8. have a Foundation generated afterward
9. land on the Foundation page successfully

That is the current MVP target.
