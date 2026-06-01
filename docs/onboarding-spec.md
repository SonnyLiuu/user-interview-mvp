# Onboarding Spec

## Purpose

The onboarding flow is being pivoted from a single generic project-to-Foundation flow into a founder-focused startup workspace.

The new product model is:

- A founder creates or onboards a **Startup** first.
- Each startup can contain **Outreach Projects**.
- V1 supports only **Information Discovery** outreach.
- Other outreach types may be shown, but they are disabled as **coming soon**.

Information Discovery is the product-facing name for the active V1 outreach project type. Its purpose is founder learning: help the founder learn from the market, not sell to it.

V1 may still map these concepts onto the existing project infrastructure internally, but product language should say "startup" and "outreach project."

---

## User Experience

### Startup onboarding

Startup onboarding runs before the founder reaches the main workspace for a startup.

The onboarding page remains a guided chat:

- Scrollable chat transcript, newest message at bottom
- Auto-scrolls to bottom on new message unless the user has scrolled up
- Starts with one open-ended kickoff question
- Follows up with AI-generated multiple-choice questions per slot
- Always shows a free-text input next to generated suggestion chips
- Users can send selected chips, typed text, or both together
- Inputs are disabled while a response is loading

The experience should feel like a founder context interview, not a form. The assistant should gather enough information to understand what the founder is building, where the startup is, and what bottleneck makes outreach valuable now.

### Outreach project onboarding

After startup onboarding, the product recommends creating an Information Discovery outreach project inside the startup.

The recommendation should include clear reasoning tied to the founder's current bottleneck, for example:

- The founder needs sharper problem validation.
- The founder is unsure who feels the pain most urgently.
- The founder has early traction but needs to understand buying or adoption friction.
- The founder needs better interview targets before building or selling more.

When creating an outreach project, the user first sees outreach type options. Only Information Discovery is selectable in V1.

---

## Startup Chat Flow

### Turn 1 - Kickoff

Assistant asks an open-ended startup kickoff question, such as:

> What are you building, and what is the biggest thing you're trying to figure out right now?

The user responds in open text. AI extracts any configured startup slots that are clearly present, including startup name, stage, traction, and bottleneck when available.

### Follow-up turns

For each remaining required slot:

- The system chooses the next slot using deterministic state-machine rules.
- AI generates a question and 3-5 answer choices for that slot.
- User selects one or more choices, types a custom answer, or combines both.

Optional adaptive slots may be asked when they would improve the recommendation or downstream outreach setup. The model may skip optional stage or traction questions when they are already implied or would slow the flow.

### Startup completion

When startup onboarding is finishable:

- Show a finish action.
- Generate the startup Foundation from onboarding state.
- Recommend starting an Information Discovery outreach project.
- Redirect to the startup workspace or Foundation page until the final startup/outreach destination exists.

---

## Startup Slot Definitions

### Required

| Slot | What it captures |
|---|---|
| `startupName` | Name of the startup, product, or working project name |
| `ideaSummary` | One-line description of what is being built and for whom |
| `targetUser` | Specific person type who has the problem |
| `painPoint` | The problem - concrete, not abstract |
| `valueProp` | What the product does for the target user |
| `idealPeopleTypes` | Who the founder should talk to first |
| `biggestBottleneck` | The current blocker, uncertainty, or constraint making outreach valuable |

### Optional

| Slot | What it captures |
|---|---|
| `startupStage` | Current company stage: idea, prototype, MVP, launched, revenue, or scaling |
| `traction` | Evidence of progress such as users, revenue, pilots, waitlist, LOIs, notable customers, or design partners |
| `differentiation` | What makes this different from current solutions |

### Adaptive optional slot rules

`startupStage` and `traction` are optional. They should be extracted opportunistically from the kickoff and other answers.

The assistant may ask about stage or traction when:

- The answer would materially change the Information Discovery recommendation.
- The founder's bottleneck depends on company maturity.
- Traction would help identify better interview targets or avoid overly generic advice.

The assistant should skip these questions when:

- The information is already clear enough.
- The founder is at a very early stage and forcing traction would feel irrelevant.
- Required startup context is still missing.

---

## Outreach Project Types

Outreach projects are created inside each startup.

| Type | V1 status | Purpose |
|---|---|---|
| Information Discovery | Active | Learn from target users, customers, buyers, or market experts |
| Customer Acquisition | Coming soon | Book qualified demos or sales calls |
| Finding Beta Users | Coming soon | Find early users or design partners who will shape the product |
| Investor Outreach | Coming soon | Get meetings with relevant investors |
| Partnership Outreach | Coming soon | Create mutual value with another company |
| Recruiting Outreach | Coming soon | Find candidates, collaborators, or founding team members |
| Advisor Outreach | Coming soon | Get advice, credibility, or strategic support |
| Press / Creator Outreach | Coming soon | Get coverage, distribution, or attention |

Coming-soon types may show icons, descriptions, and disabled controls, but they cannot start onboarding or create projects in V1.

The underlying outreach type registry should support explicit availability states:

```ts
type OutreachProjectAvailability = 'active' | 'coming_soon' | 'hidden';
```

---

## Information Discovery Outreach Onboarding

Information Discovery is for learning, not selling.

### First question

Ask:

> What outcome do you want from this outreach?

The answer should guide the rest of the project onboarding. Examples:

- Validate whether the problem is painful enough.
- Learn who owns the workflow or buying decision.
- Understand current workarounds.
- Find what would make someone try the product.
- Identify which segment has the strongest urgency.

### Follow-up focus

Follow-up questions should focus on:

- Learning goals
- Who to talk to first
- Assumptions to test
- Current unknowns
- What the founder hopes to understand after the conversations
- Any boundaries that should keep outreach from sounding like a sales pitch

### Positioning rules

Information Discovery outputs should:

- Support interview targeting, conversation prep, and insight collection.
- Avoid sales-heavy language by default.
- Ask for conversations, feedback, perspective, or experience rather than demos or purchases.
- Use sales framing only if the founder explicitly asks for it.

---

## Hidden Onboarding State

Hidden state is not shown directly in the UI. It tracks slot quality, chooses next questions, and generates the Foundation and initial outreach recommendation.

```ts
type SlotQuality = 'missing' | 'weak' | 'solid';

type StartupStage =
  | 'idea'
  | 'prototype'
  | 'mvp'
  | 'launched'
  | 'revenue'
  | 'scaling';

type OutreachProjectType =
  | 'information_discovery'
  | 'customer_acquisition'
  | 'beta_users'
  | 'investor'
  | 'partnership'
  | 'recruiting'
  | 'advisor'
  | 'press_creator';

type StartupOnboardingState = {
  startupName: string | null;
  ideaSummary: string | null;
  targetUser: string | null;
  painPoint: string | null;
  valueProp: string | null;
  idealPeopleTypes: string[];
  biggestBottleneck: string | null;
  startupStage: StartupStage | string | null;
  traction: string[];
  differentiation: string | null;

  recommendedOutreachProject: {
    type: 'information_discovery';
    reason: string | null;
  } | null;

  completeness: Record<string, SlotQuality>;
  followUpCounts: Record<string, number>;
};

type CustomerDiscoveryOutreachState = {
  outreachProjectType: 'information_discovery';
  desiredOutcome: string | null;
  learningGoals: string[];
  targetPeople: string[];
  assumptionsToTest: string[];
  conversationBoundaries: string[];

  completeness: Record<string, SlotQuality>;
  followUpCounts: Record<string, number>;
};
```

---

## Completion Rules

Startup onboarding is finishable when:

- Required startup slots are not missing.
- At least 3 required startup slots are solid, or weak required slots have been probed once.
- `biggestBottleneck` is captured directly or confidently inferred from prior context.

Recommended stronger threshold:

- `startupName`, `ideaSummary`, `targetUser`, `painPoint`, and `biggestBottleneck` should be solid before recommending an outreach project.

Information Discovery onboarding is finishable when:

- `desiredOutcome` is not missing.
- The project has enough context to produce interview targeting and learning-oriented outreach guidance.

---

## Data Model

### Existing tables

The existing onboarding tables can continue to be used during the V1 transition.

### `outreach_projects`

Outreach projects are persisted separately from startup `projects`.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| startup_project_id | uuid | References the startup project |
| type | text | `information_discovery`, `customer_acquisition`, `beta_users`, `investor`, `partnership`, `recruiting`, `advisor`, or `press_creator` |
| name | text | Human-readable outreach project name |
| status | text | `draft`, `onboarding`, `active`, `paused`, `completed`, or `archived` |
| brief_json | jsonb | Generated outreach project brief |
| onboarding_state_json | jsonb | Outreach-project-level onboarding state |
| created_at | timestamp | |
| updated_at | timestamp | |

V1 enforces one non-archived `information_discovery` outreach project per startup.

### `onboarding_sessions`

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| project_id | uuid | May represent startup onboarding or an outreach project during the transition |
| status | text | `active`, `ready`, `completed` |
| current_slot | text | |
| started_at | timestamp | |
| completed_at | timestamp | |
| progress_json | jsonb | Stores last turn, onboarding layer, and active mode metadata |

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
| state_json | jsonb | Stores startup or outreach-project onboarding state |
| updated_at | timestamp | |

### `project_foundations`

| Field | Type | Notes |
|---|---|---|
| project_id | uuid | |
| foundation_json | jsonb | Startup Foundation in V1; should include recommendation metadata |
| generated_at | timestamp | |
| updated_at | timestamp | |

### Future model direction

The product model should eventually separate:

- `startups`
- `outreach_projects`
- startup-level onboarding state
- outreach-project-level onboarding state

V1 does not need a full schema split if the existing project model can represent the pivot safely.

---

## AI Tasks

### `extractKickoffIdea`

Interprets the first open-ended startup answer. Populates any startup slots with usable evidence.

```ts
// Input
{ kickoffMessage: string }

// Output
{
  [slotKey: string]: {
    value?: string;
    values?: string[];
    quality: 'missing' | 'weak' | 'solid';
  };
}
```

This task becomes startup-aware and may extract:

- `startupName`
- `ideaSummary`
- `targetUser`
- `painPoint`
- `valueProp`
- `idealPeopleTypes`
- `startupStage`
- `traction`
- `biggestBottleneck`
- `differentiation`

### `generateNextQuestionWithChoices`

Generates the next question and 3-5 choices for a given slot.

```ts
// Input
{
  targetSlot: string;
  recentMessages: Message[];
  onboardingState: StartupOnboardingState | CustomerDiscoveryOutreachState;
}

// Output
{
  targetSlot: string;
  question: string;
  choices: {
    id: string;
    label: string;
    normalizedValue: string;
    slotKey: string;
  }[];
  customPlaceholder: string;
}
```

The task should support adaptive optional questions. The deterministic engine chooses the slot; the model writes a question that is specific to the founder's prior answers.

Model does not generate a generic escape hatch; the UI keeps free text available for every choice turn.

### `extractCustomSlotAnswer`

Interprets typed text for a slot. Selected suggestions may be included as supporting context when the user combines chips with free text.

```ts
// Input
{
  targetSlot: string;
  customText: string;
  recentMessages: Message[];
  onboardingState: StartupOnboardingState | CustomerDiscoveryOutreachState;
}

// Output
{
  slotKey: string;
  value: string | string[];
  quality: 'weak' | 'solid';
}
```

### `generateFoundationFromOnboarding`

Generates the startup Foundation after startup onboarding completes.

```ts
// Input
{
  messages: Message[];
  state: StartupOnboardingState;
}

// Output
{
  foundation: {
    startupName: string;
    summary: string;
    targetUser: string;
    painPoint: string;
    valueProp: string;
    idealPeopleTypes: string[];
    biggestBottleneck: string;
    startupStage?: string | null;
    traction?: string[];
    differentiation?: string | null;
    recommendedOutreachProject: {
      type: 'information_discovery';
      label: 'Information Discovery';
      reason: string;
    };
  };
}
```

### `recommendInitialOutreachProject`

This may be implemented as a separate AI task or as part of Foundation generation.

```ts
// Input
{
  state: StartupOnboardingState;
  foundation: Record<string, unknown>;
}

// Output
{
  type: 'information_discovery';
  label: 'Information Discovery';
  reason: string;
}
```

The recommendation must be specific to the founder's bottleneck and must not recommend unavailable outreach types in V1.

---

## Choice Validation

Before showing choices to the user:

- Count must be 3-5.
- All choices must map to the target slot.
- No duplicate labels.
- No label over 120 characters.
- All normalized values must be non-empty.

On failure: regenerate once. If still invalid, use the static fallback turn for that slot from the mode config.

---

## Turn Flow

### Startup kickoff turn

1. Save user message.
2. Run `extractKickoffIdea`.
3. Update startup onboarding state.
4. Choose next startup slot.
5. Run `generateNextQuestionWithChoices`.
6. Save assistant message.
7. Return transcript and current turn.

### Startup answer submitted

1. Save user message.
2. If typed text is present, run `extractCustomSlotAnswer` with selected suggestions as context.
3. If only choices are selected, map selected normalized values into onboarding state as `solid`.
4. Choose next startup slot.
5. Run `generateNextQuestionWithChoices`.
6. Save assistant message.
7. Return transcript and current turn.

### Startup finish

1. Mark startup onboarding session complete.
2. Run `generateFoundationFromOnboarding`.
3. Generate or attach an Information Discovery recommendation.
4. Save Foundation.
5. Redirect to the existing Foundation/workspace destination until the startup/outreach route is implemented.

### Outreach type selection

1. Load outreach type registry.
2. Show active and coming-soon types.
3. Allow selection only for `information_discovery`.
4. Reject or disable coming-soon types.

### Information Discovery kickoff

1. Ask: "What outcome do you want from this outreach?"
2. Save user response.
3. Extract desired outcome and any learning goals.
4. Ask follow-up questions about target people, assumptions to test, and learning boundaries.
5. Generate a learning-oriented outreach project brief.

---

## Architecture

Backend mode config owns:

- Supported startup and outreach project types
- Creatable/visible availability
- Kickoff questions
- Slot order
- Required flags
- Array flags
- Adaptive optional-slot rules
- Kickoff-extraction flags
- Static fallback turns for each slot

App logic never calls provider SDKs directly. All AI calls go through task functions -> provider adapter -> model router.

```ts
type AITaskName =
  | 'onboarding.extractKickoffIdea'
  | 'onboarding.generateNextQuestionWithChoices'
  | 'onboarding.extractCustomSlotAnswer'
  | 'foundation.generateFoundationFromOnboarding'
  | 'outreach.recommendInitialOutreachProject';

interface AIProvider {
  generateJson<T>(input: {
    taskName: string;
    model?: string;
    messages: AIMessage[];
    schemaName: string;
  }): Promise<T>;
}

interface ModelRouter {
  resolve(taskName: AITaskName): {
    provider: 'openai' | 'anthropic';
    model: string;
  };
}
```

Even if only one provider is used in MVP, keep this boundary intact.

---

## Current Backend Structure

```text
services/foundry-api/app/
  project_modes.py              # mode metadata, slots, availability, fallback turns
  onboarding_engine.py          # deterministic state machine helpers
  onboarding_mode_hints.py      # mode-specific AI hint/normalization hooks
  services/onboarding.py        # request orchestration and persistence
  schemas/onboarding.py         # request/response contracts
```

Expected implementation direction:

- Rename product-facing copy from project/startup discovery to startup and Information Discovery.
- Extend startup slots in `project_modes.py`.
- Add outreach type registry metadata with `active`, `coming_soon`, and `hidden`.
- Keep coming-soon outreach types non-creatable.
- Preserve the existing chat mechanics while changing the slot model and completion output.

---

## Test Plan

### Startup onboarding

- New founder can provide startup name and context in one kickoff answer.
- Stage and traction are extracted when present.
- Stage and traction are skipped when absent and not needed.
- Biggest bottleneck is captured before completion or confidently inferred from prior context.
- Completion creates a startup Foundation with an Information Discovery recommendation.

### Outreach type selection

- Information Discovery is selectable.
- Customer Acquisition is visible as coming soon and cannot be selected.
- Finding Beta Users is visible as coming soon and cannot be selected.
- Investor Outreach is visible as coming soon and cannot be selected.
- Partnership Outreach is visible as coming soon and cannot be selected.
- Recruiting Outreach is visible as coming soon and cannot be selected.
- Advisor Outreach is visible as coming soon and cannot be selected.
- Press / Creator Outreach is visible as coming soon and cannot be selected.

### Information Discovery

- First question asks what outcome the founder wants from outreach.
- Follow-up turns focus on learning goals, target people, assumptions, and unknowns.
- Generated project brief supports interview targeting and conversation prep.
- Generated outreach language avoids sales framing by default.
- Sales language appears only when explicitly requested by the founder.

### Regression

- Existing onboarding chat still supports chips plus free text.
- Existing completion and redirect behavior continues to work until replaced by the new startup/outreach destination.
- Choice validation still catches invalid generated choices and falls back to static turns.

---

## What's Built (Current MVP)

- [x] Onboarding chat page with scrollable transcript
- [x] Kickoff open-ended question
- [x] AI-generated multiple-choice turns
- [x] Always-available custom input path
- [x] Deterministic slot progression
- [x] Hidden onboarding state
- [x] Foundation generation after completion
- [x] Redirect to Foundation page

## Not Built Yet

- [ ] Startup-specific slots: `startupName`, `startupStage`, `traction`, `biggestBottleneck`
- [ ] Information Discovery as the active outreach project type
- [ ] Outreach type selection UI with coming-soon disabled options
- [ ] Startup Foundation recommendation for first outreach project
- [ ] Information Discovery onboarding flow
- [ ] Separate startup and outreach project data model
- [ ] Re-run or refine onboarding after completion
- [ ] Live Foundation preview during onboarding
- [ ] Multi-provider A/B testing
- [ ] Slot confidence UI
- [ ] Advanced analytics / observability
- [ ] People-search criteria generation after Foundation
- [ ] Live call brief overlay - real-time Zoom integration where transcription crosses off questions as they're covered during the call

---

## Assumptions

- "Information Discovery" is the V1 active name.
- Coming-soon outreach types are visible but non-creatable in V1.
- Startup and outreach project concepts may initially reuse existing project infrastructure.
- The spec describes the intended pivot and should not preserve the old single-project mental model.
