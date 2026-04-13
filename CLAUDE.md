# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

---

## Product Name

**Startup Foundry**

---

## What This Product Is

An **AI founder discovery copilot** that helps early founders clarify and pressure-test their startup idea, identify the most promising customer and monetization angles, find the right people to learn from, prepare better outreach and conversations, and improve their thinking after every interaction.

**Core promise:** Forge your idea, find the right people, and get smarter after every conversation.

**The product operates across three layers:**

1. **Idea formation** — Help the founder turn a rough, messy idea into a sharper hypothesis. Structured like accelerator office hours or gstack intake. Exposes weak spots, identifies promising angles, generates a project brief with strengths, risks, and recommended first conversations.

2. **Market learning** — Help the founder find and analyze the right people to talk to, prep outreach and calls, and run better conversations.

3. **Iterative refinement** — Help the founder update the idea and next steps after each conversation. The project brief evolves as new evidence comes in.

**The fundamental positioning distinction:** Every existing tool in this space (Apollo, Clay, Salesloft, Outreach) is optimized for sales outreach and pipeline generation. This product is optimized for **founder learning**. It enters much earlier in the founder journey — before the question is "who do I message," when the question is still "is this a good idea, what is actually promising, and who should I talk to first?"

This distinction must be reflected in every design and copy decision. Never let the product feel like outreach automation or a sales CRM.

---

## Who It Is For

- Early-stage founders, especially first-timers without an established mentor or customer network
- Founders whose idea is still messy, underdefined, or pointed at the wrong opportunity
- People doing customer discovery, market validation, or early GTM learning
- Founders who want help before, during, and after outreach and calls
- **Not for:** mature sales teams running high-volume outbound

---

## The Core Loop

```
Idea Intake (Founder Office Hours)
    ↓
AI generates Project Brief:
  strengths · risks · promising avenues ·
  assumptions to test · recommended first conversations
    ↓
Add people to talk to (paste URL / text → AI crawls + analyzes)
    ↓
Open Person Workspace → prep outreach
    ↓
Board: Contacted → Scheduled → review call prep → have call
    ↓
Debrief (paste notes/transcript → AI coaching + insights)
    ↓
Project Brief updates with new evidence
    ↓
Insights screen shows patterns across all conversations
```

---

## The 5 Core Jobs

1. **Pressure-test the idea** — structured intake that builds a full picture of the startup, exposes weak spots, identifies promising angles, and outputs an actionable project brief with recommended first conversations.

2. **Consolidate and analyze people the founder has found** — crawl submitted sources, extract what's relevant to the founder's specific hypothesis, surface learning rationale and suggested questions. In MVP, users find people themselves. AI recommendation is a future premium feature.

3. **Generate outreach prep** — messages, emails, and call briefs are each distinct outputs. A call brief = conversation objective + learning goals + tailored question sequence + signals to watch + closing question for referrals.

4. **Analyze conversations afterward** — debrief on pasted notes or transcript, extract pain signals, surface missed openings, recommend who to talk to next, deliver coaching on interview quality.

5. **Build compounding memory** — track personas covered, recurring themes, current hypotheses, unresolved questions, patterns by segment. The project brief evolves as evidence accumulates.

---

## Screen Map (MVP)

The app has 7 screens. All screens except Person Workspace are full pages. Person Workspace is a large popup/sheet (~85% screen) that opens from any person card.

---

### 1. Project Intake — "Founder Office Hours"

This is a major pillar of the product, not a simple setup form. It acts like a structured accelerator intake — comprehensive questions that progressively build a complete picture of the idea.

**Purpose:** Help the founder clarify their idea, expose weak spots, identify what is promising and profitable, and generate a clear research direction before any outreach begins.

**5 intake sections (progressive, not all shown at once):**

**Section 1 — The Idea**
- What are you building?
- For whom?
- Why now — what has changed or what did you observe that makes this the right moment?

**Section 2 — The Problem**
- What pain exists?
- How often does this problem occur?
- How do people handle it today? What tools or workarounds do they use?
- Why has this not been solved well enough already?
- What happens if this problem is not solved?

**Section 3 — The Customer**
- Who experiences the pain most directly?
- Who decides whether to pay for a solution?
- Are the user and buyer the same person? If not, who influences the decision?
- Who benefits most if this is solved?

**Section 4 — The Opportunity**
- Who has budget here? What types of organizations or people would pay?
- Is this a painful must-fix or a nice-to-have?
- Where does this seem most promising — which niche, segment, or use case?
- What narrow wedge is the most believable starting point?

**Section 5 — Risks and Assumptions**
- What assumptions does this idea depend on being true?
- What would have to be true for this to work as a business?
- What are the biggest reasons this may fail?
- What is your personal connection to this problem — why do you believe it matters?

**AI output after intake — the Project Brief:**

The system generates a structured interpretation, not just a storage of answers:

1. **Idea summary** — clear concise writeup of what the startup is, who it is for, what problem it addresses, why the founder thinks it matters
2. **Strengths** — what looks promising, differentiated, or likely to resonate
3. **Weaknesses and uncertainties** — vague customer, unclear pain severity, weak monetization path, too broad a wedge, too much dependence on behavior change
4. **Most promising avenues** — best initial niche, best user segment, best monetization path to test first, best learning direction
5. **Core assumptions to validate** — the 3–5 things that must be true for this to work
6. **Recommended first conversations** — specific types of people to talk to and why (feeds directly into the People screen)

The Project Brief is a living document — it updates after each debrief as new evidence comes in.

---

### 2. People

- Founder adds people they have found themselves — **no AI recommendations in MVP**
- Input methods: paste a URL (portfolio, GitHub, company bio, speaker page, blog, Substack), paste profile text, manual entry
- System crawls submitted sources and consolidates relevant information into an analysis card
- Card shows: name, title, persona type, learning value for the founder's current hypothesis, why they matter, what to explore with them, which project brief assumption they help validate
- Founder can paste additional context at any time to refine the analysis
- Cards sorted by learning value for the current project hypothesis — not alphabetical or arbitrary
- Coverage gap signal in the list header: "You have 4 users and 0 budget owners"
- Clicking a card opens the Person Workspace popup

---

### 3. Board

- Kanban-style view organizing all people in the project by their stage
- 4 columns: **Bookmarked** → **Contacted** → **Scheduled** → **Completed**
- Primary job: at-a-glance view of where every conversation stands
- **Most important signal:** Scheduled cards must show a visible "Call prep not reviewed" warning if prep is blank or stale
- Cards show: name, persona type, one-line learning rationale, call date if scheduled, call prep status
- Scoped per project. Clicking a card opens the Person Workspace popup

---

### 4. Person Workspace (popup/sheet)

- Opens as a large sheet (~85% screen) from any person card on People or Board
- **Single unified scroll — no tabs.** All sections present, contextually weighted by the person's current stage
- Sections in order:
  1. **Identity** — name, title, persona type, learning rationale, which project assumptions this person tests
  2. **Context** — consolidated crawled information, pasted additions, source notes. Prominent "+ Add more context" affordance.
  3. **Outreach** — message variants, email subject + body, tone options, CTA, follow-up nudge, risk warnings. Weighted high when status is Bookmarked.
  4. **Call Prep** — conversation objective, top learning goals, tailored question sequence, follow-up probes, signals to listen for, common mistakes to avoid, best closing question (including intro requests). Weighted high when status is Scheduled.
  5. **Debrief** — paste notes or transcript; outputs: learning summary, pain signals, what remains unclear, missed openings, coaching on question quality, who to talk to next, which project assumptions this updates. Weighted high when status is Completed.
- Sections are never hidden — only visually de-emphasized when not yet relevant

---

### 5. Debrief

- Accessible from the bottom section of the Person Workspace or as a standalone post-call entry
- Inputs: pasted notes, transcript, or manual reflection
- Outputs: what was learned, strongest pain signals, what remains unclear, objections or doubts, where the founder missed a useful opening, coaching on interview technique, who to talk to next
- Side effect: triggers a Project Brief update — assumptions get marked strengthened / weakened / unchanged based on evidence

---

### 6. Insights

- Deliberately separate screen — cross-call synthesis only, not per-person analysis
- Becomes meaningful after multiple conversations (3+)
- **Not a metrics dashboard.** Reads like an annotated brief — statements lead, numbers support
- Example: "You've spoken to 6 users and 0 budget owners. The pricing question has come up in 4 of 8 calls and is unresolved. Your questions are improving — probing more on workflow, less on features."
- Contains: persona coverage gaps, recurring themes, hypothesis evolution, unresolved questions, interview quality trends
- Embedded insight vs. Insights screen: per-person and per-call insights stay embedded. This screen consolidates the full arc.

---

### 7. Project Brief (within Project)

- The living document generated from the intake and updated after each debrief
- Always accessible from the project nav
- Sections: Idea Summary · Strengths · Weaknesses · Most Promising Avenues · Assumptions (with current status: unvalidated / strengthened / weakened) · Recommended Conversations
- The "Recommended Conversations" section links directly to the People screen — it is the bridge between idea formation and market learning
- Never a static document. The brief evolves as the founder learns more.

---

## Multiple Projects

- The app supports multiple projects simultaneously
- Project switcher lives in the left rail — persistent, low-profile
- Every screen (People, Board, Brief, Insights) is scoped per project
- Project Intake is the founding document of each project — always accessible, always editable

---

## Data Strategy

### MVP — User-driven input, AI analysis

No proprietary contact database. No AI-driven people recommendations. Founders find people themselves and submit them for analysis.

**Accepted input types:**
- URL to a personal website, portfolio, GitHub profile, company bio page, speaker page, blog, or Substack
- Pasted profile text (LinkedIn about section, bio, etc.)
- Manual entry (name, title, company, notes)
- CSV of candidates

**What the system does with input:**
- Crawls submitted public URLs — does not scrape LinkedIn
- Consolidates relevant information against the founder's current project hypothesis
- Generates the analysis card: persona type, learning value, why they matter, what to explore, which assumptions they test
- Stores everything per user and project
- Accepts additional context pastes at any time to refine analysis

**LinkedIn strategy:** Discovery surface only. No scraping, no automation. Founder pastes URL or text; system uses other public sources for enrichment.

### Future / Premium — AI-driven recommendation

- As users add people, the database grows into a network of analyzed profiles
- Premium: AI recommends new people based on the shared database + founder's project hypothesis
- Natural growth moat — more users = richer database = better recommendations

---

## Person Categories (Persona Types)

`potential_user` | `buyer` | `operator` | `domain_expert` | `skeptic` | `connector`

Every person gets one primary persona type. Always displayed as: type label + icon + context. Never color alone.

---

## Design Philosophy

This product uses the **ClawTrace design philosophy** as its design foundation. The canonical design references live in the `clawtrace/` subdirectory.

Key reference files:
- `clawtrace/DESIGN.md` — product-level design thesis
- `clawtrace/CLAUDE.md` — hard development rules
- `clawtrace/docs/design-specs/CLAWTRACE_ATELIER_COMPONENT_SPEC.md` — build-ready UI contracts
- `clawtrace/docs/design-specs/clawtrace.tokens.css` — full token system
- `clawtrace/docs/design-specs/clawtrace.interfaces.ts` — canonical React prop interfaces

### Applied to this product

| ClawTrace principle | Startup Foundry equivalent |
|---|---|
| Control room, not dashboard | Learning workspace, not outreach pipeline |
| Evidence is the center of gravity | Learning rationale and hypothesis status are the center of gravity |
| Cockpit is the product heart | Person Workspace is the product heart |
| Chat is a partner, not the home screen | AI drafting/analysis is embedded, never the dominant surface |
| Calm earns trust | Quiet, controlled UI — not urgent, not alarming |
| 5-second legibility | Founder sees hypothesis status, who needs attention, and what to do immediately |

### Shell layout

```
[Left Rail — nav + project switcher] | [Main content area]
```

No persistent second column in MVP. Main content area is the full page for each screen. Person Workspace opens as a large overlay sheet.

### Hard design rules

1. **Never use font-weight above 550** for any title, heading, label, or body text. Use 400–520. Bold looks over-emphasized and breaks the design language.

2. **Color is never the only signal.** Every state, persona type, or status must have: text label + icon + color. Never color alone.

3. **The Person Workspace is the product heart.** Every other screen leads to it or feeds from it. It must visually dominate when open.

4. **No pipeline language.** Columns: Bookmarked, Contacted, Scheduled, Completed. Never: Prospect, Qualified, Opportunity, Closed.

5. **No metrics-first UI.** Statements lead, numbers support. "You have 4 users and 0 budget owners" is correct. A pie chart with no narrative is not.

6. **Copy is direct, operational, low-drama, evidence-based.**
   - Correct: "Call prep not reviewed. Call is tomorrow."
   - Correct: "Pricing came up in 4 of 8 calls and is unresolved."
   - Correct: "This assumption is weakening — 3 of 4 users said they handle this manually and don't consider it a problem."
   - Incorrect: "Something went wrong."
   - Incorrect: "You're making great progress!"
   - Incorrect: "The AI noticed a potential issue."

7. **The action cards anti-pattern.** Do not present equal-weight action grids. The product should know what the right next action is based on current state. Surface one primary action with secondary options below.

8. **No separate Insights page for individual call data.** Per-person insights in Person Workspace. Per-call insights in Debrief. Insights screen = cross-call synthesis only.

9. **The Project Brief is a living document.** Do not treat it as a one-time setup form output. It must visibly update as new debrief evidence comes in. Assumptions have status: unvalidated / strengthened / weakened.

10. **Mobile is triage-first.** If and when mobile is built: Board → person summary → primary next action → drill down. Do not stack the desktop layout vertically.

### Mood and tone

- **Default:** calm, controlled, legible, lightly editorial
- **Under pressure:** focused, contrast-rich, directive — never frantic
- Feels like a thoughtful advisor, not an urgent sales tool or a hyped AI product
- Healthy state (no pending actions) should feel quiet — not congratulatory, not empty

---

## What NOT to Build in MVP

- AI-driven people recommendations (future premium)
- Full CRM with custom fields and pipelines
- Heavy analytics dashboard
- Email sequence automation
- Automated LinkedIn messaging or connection requests
- Browser extension for scraping
- Expert marketplace
- Team collaboration features
- A giant standalone Insights dashboard before the loop has real data

---

## Key Differentiators to Preserve

- **Idea pressure-testing before outreach** — enters the founder journey earlier than any outreach tool
- **Project Brief as a living document** — not a setup form, a compounding hypothesis tracker
- **Learning value ranking** — people analyzed against the founder's current hypothesis, not generic sales-fit
- **Coverage gap detection** — "you have 4 users and 0 budget owners"
- **Persona-typed outreach** — message, email, and call prep are distinct outputs tailored to channel and persona
- **Post-call improvement loop** — debrief coaches interview technique, not just summarizes content
- **Cross-call synthesis** — Insights screen shows hypothesis evolution and pattern detection

These are what make Startup Foundry different from Apollo, Clay, and generic AI outreach tools. Do not dilute them.
