# System Design Overview
# Startup Foundry

---

## 1. Product Summary

An AI founder discovery copilot that operates across three layers: idea formation, market learning, and iterative refinement. Founders begin with a structured idea intake (like accelerator office hours) that generates a Project Brief. They then add people to analyze, prep outreach and calls, debrief after conversations, and watch their Project Brief evolve as evidence accumulates.

**The system is not a contact database or outreach automation tool.** It is a learning system. The AI's job is analysis, pressure-testing, consolidation, and coaching — not volume generation.

---

## 2. Tech Stack

### Core — confirmed, always present

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript | Full-stack framework — handles pages, API routes, and SSR in one project |
| Database | Neon PostgreSQL | Serverless Postgres — zero cost when idle, JSONB for AI output, relational for complex joins |
| ORM | Drizzle ORM | Type-safe queries, schema-as-code migrations, lightweight, Neon-native driver |
| Auth | Clerk | Google OAuth + email/password out of box, Next.js App Router SDK, fastest to working auth |
| AI | Claude (`claude-sonnet-4-6`) via internal provider wrapper | All analysis, brief generation, outreach, debrief, insights jobs. Routed through internal wrapper — do not call Anthropic SDK directly. |
| Background jobs | Inngest | Crawl + LLM analysis takes 30–60s — Vercel functions would time out. Inngest gives durable multi-step execution with per-step retries. |
| Deployment | Vercel | Zero-config Next.js, native Neon + Clerk integrations, preview deploys per branch |

### Conditional — crawling strategy

Crawling uses a two-tier fallback. Always try Jina first. Only invoke Firecrawl if Jina fails or returns insufficient content.

```
Submit URL
    ↓
Try: r.jina.ai/{url}  (free, no API key, clean markdown)
    ↓ if empty / error / JS-heavy fail
Fallback: Firecrawl API  (paid, JS rendering, reliable)
```

| Service | When used | Cost |
|---|---|---|
| Jina AI Reader | First pass on every URL | Free |
| Firecrawl | Fallback when Jina fails or returns < threshold content | Paid (500 pages/month free tier) |

The crawl wrapper in `src/lib/crawl/index.ts` handles this logic. Callers never reference Jina or Firecrawl directly.

### Deferred — not in MVP

| Item | Deferred until |
|---|---|
| Upstash Redis | Specific performance problem that Postgres queries can't solve |
| File storage (Vercel Blob / R2) | PDF transcript uploads or CSV people imports are added |
| Supabase consolidation | If dependency count becomes a maintenance burden |
| Prisma swap | If Drizzle tooling becomes limiting |
| Custom crawling infra | If Jina + Firecrawl costs or reliability become a problem at scale |

---

## 3. Repository Structure

```
user-interview-mvp/
├── CLAUDE.md
├── SYSTEM_DESIGN.md
├── clawtrace/                  ← existing subproject (separate git repo)
└── packages/
    └── discovery-ui/           ← Startup Foundry app
        ├── src/
        │   ├── app/
        │   │   ├── page.tsx                        ← landing page
        │   │   ├── login/page.tsx
        │   │   ├── signup/page.tsx
        │   │   ├── onboarding/page.tsx             ← first project + intake
        │   │   └── (app)/                          ← authenticated shell
        │   │       ├── layout.tsx                  ← left rail + project switcher
        │   │       ├── dashboard/page.tsx           ← redirect to most recent project board
        │   │       └── project/[projectId]/
        │   │           ├── intake/page.tsx          ← Founder Office Hours
        │   │           ├── brief/page.tsx           ← Project Brief (living doc)
        │   │           ├── people/page.tsx
        │   │           ├── board/page.tsx
        │   │           └── insights/page.tsx
        │   ├── app/api/
        │   │   ├── projects/
        │   │   ├── projects/[id]/intake/            ← save intake answers
        │   │   ├── projects/[id]/brief/             ← generate + get Project Brief
        │   │   ├── projects/[id]/brief/refresh/     ← re-run brief after new debriefs
        │   │   ├── people/
        │   │   ├── people/[id]/outreach/
        │   │   ├── people/[id]/call-prep/
        │   │   ├── people/[id]/debrief/
        │   │   └── projects/[id]/insights/
        │   ├── components/
        │   │   ├── landing/
        │   │   ├── intake/                          ← Founder Office Hours form sections
        │   │   ├── brief/                           ← Project Brief display + assumption tracker
        │   │   ├── people/
        │   │   ├── board/
        │   │   ├── person-workspace/
        │   │   ├── debrief/
        │   │   └── insights/
        │   ├── lib/
        │   │   ├── db/
        │   │   │   ├── schema.ts
        │   │   │   └── index.ts
        │   │   ├── ai/
        │   │   │   ├── generate-brief.ts            ← intake → Project Brief
        │   │   │   ├── update-brief.ts              ← debrief evidence → assumption updates
        │   │   │   ├── analyze-person.ts
        │   │   │   ├── generate-outreach.ts
        │   │   │   ├── generate-call-prep.ts
        │   │   │   ├── analyze-debrief.ts
        │   │   │   └── generate-insights.ts
        │   │   ├── crawl/
        │   │   │   └── firecrawl.ts
        │   │   └── types.ts
        │   └── inngest/
        │       ├── client.ts
        │       └── functions/
        │           ├── generate-brief.ts
        │           ├── crawl-and-analyze.ts
        │           ├── analyze-debrief.ts           ← also triggers brief update
        │           └── refresh-insights.ts
        ├── drizzle.config.ts
        ├── package.json
        └── next.config.ts
```

---

## 4. Data Model

### Core Design Principles
- All AI-generated outputs are stored as structured JSON columns alongside the raw inputs that generated them
- Nothing is generated on the fly at read time — analysis is computed async, stored, and served from DB
- Every entity that can be re-analyzed has a `analysis_version` field to detect staleness when new context is added

### Tables

#### `users`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
email           text UNIQUE NOT NULL
name            text
avatar_url      text
subscription    text DEFAULT 'free'   -- 'free' | 'pro'
created_at      timestamptz DEFAULT now()
```

#### `projects`
```sql
id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id             uuid REFERENCES users(id) ON DELETE CASCADE
name                text NOT NULL
intake_status       text DEFAULT 'not_started'  -- 'not_started' | 'in_progress' | 'complete'
is_archived         boolean DEFAULT false
created_at          timestamptz DEFAULT now()
updated_at          timestamptz DEFAULT now()
```

#### `project_intake`
Stores the founder's answers to the Founder Office Hours intake. One row per project.
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
project_id      uuid REFERENCES projects(id) ON DELETE CASCADE UNIQUE

-- Section 1: The Idea
what_are_you_building       text
for_whom                    text
why_now                     text

-- Section 2: The Problem
pain_description            text
pain_frequency              text
current_solutions           text
why_not_solved              text
consequence_if_unsolved     text

-- Section 3: The Customer
who_feels_pain              text
who_pays                    text
user_buyer_same_person      boolean
who_influences              text
who_benefits_most           text

-- Section 4: The Opportunity
who_has_budget              text
urgency_level               text   -- 'must_fix' | 'nice_to_have' | 'unclear'
most_promising_angle        text
narrow_wedge                text

-- Section 5: Risks and Assumptions
key_assumptions             text[]
biggest_failure_reasons     text[]
personal_connection         text   -- why the founder believes this matters

updated_at      timestamptz DEFAULT now()
```

#### `project_briefs`
AI-generated interpretation of the intake. Updates after each debrief as new evidence comes in.
```sql
id                      uuid PRIMARY KEY DEFAULT gen_random_uuid()
project_id              uuid REFERENCES projects(id) ON DELETE CASCADE

-- AI-generated sections
idea_summary            text
strengths               text[]
weaknesses              text[]
most_promising_avenues  text[]
recommended_conversations jsonb
-- recommended_conversations shape:
-- [{ persona_type: string, why: string, what_to_learn: string, urgency: 'now' | 'soon' | 'later' }]

assumptions             jsonb
-- assumptions shape:
-- [{ assumption: string, status: 'unvalidated' | 'strengthened' | 'weakened', evidence: string[], last_updated: timestamp }]

-- metadata
debrief_count_at_generation  integer DEFAULT 0   -- how many debriefs existed when this was generated
generated_at            timestamptz DEFAULT now()
is_current              boolean DEFAULT true
```

#### `people`
```sql
id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
project_id          uuid REFERENCES projects(id) ON DELETE CASCADE

-- identity
name                text NOT NULL
title               text
company             text
persona_type        text          -- 'potential_user' | 'buyer' | 'operator' | 'domain_expert' | 'skeptic' | 'connector'

-- input (what the founder provided)
source_urls         text[]        -- URLs submitted for crawling
raw_pasted_text     text          -- any text the founder pasted directly
additional_context  text[]        -- additional pastes added after initial analysis

-- crawled data
crawl_status        text DEFAULT 'pending'   -- 'pending' | 'crawling' | 'done' | 'failed'
crawled_content     jsonb         -- { url: string, markdown: string, crawled_at: timestamp }[]
crawl_error         text

-- AI analysis (generated against research_goal at time of analysis)
analysis            jsonb
-- analysis shape:
-- {
--   consolidated_background: string,   -- who they are, synthesized from all sources
--   persona_type_rationale: string,    -- why they were assigned this persona
--   learning_value: string,            -- qualitative: 'high' | 'medium' | 'low'
--   learning_value_reason: string,     -- why they matter for this specific goal
--   what_to_explore: string[],         -- specific angles to pursue
--   assumptions_they_test: string[],   -- which founder hypotheses this person can validate
--   generated_at: timestamp,
--   goal_snapshot: string              -- the research_goal at time of analysis
-- }
analysis_version    integer DEFAULT 0
analysis_status     text DEFAULT 'pending'   -- 'pending' | 'analyzing' | 'done' | 'failed'

-- board state
board_status        text DEFAULT 'bookmarked'  -- 'bookmarked' | 'contacted' | 'scheduled' | 'completed'
call_scheduled_at   timestamptz

created_at          timestamptz DEFAULT now()
updated_at          timestamptz DEFAULT now()
```

#### `outreach`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
person_id       uuid REFERENCES people(id) ON DELETE CASCADE
channel         text NOT NULL   -- 'message' | 'email' | 'call'
content         jsonb
-- message shape:
-- { angle: string, variants: string[], tone_options: string[], cta: string, follow_up: string, risk_warnings: string[] }
-- email shape:
-- { subject_lines: string[], short_body: string, medium_body: string, async_version: string, follow_up_sequence: string[], reply_handling: { too_busy: string, wrong_person: string, send_questions: string } }
-- call shape: (→ see call_prep table)
generated_at    timestamptz DEFAULT now()
is_current      boolean DEFAULT true   -- false when regenerated after new context
```

#### `call_prep`
```sql
id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
person_id           uuid REFERENCES people(id) ON DELETE CASCADE
objective           text
learning_goals      text[]
question_sequence   jsonb   -- [{ question: string, probe: string, why: string }]
signals_to_watch    text[]
mistakes_to_avoid   text[]
closing_question    text    -- usually asks for intros/referrals
is_reviewed         boolean DEFAULT false   -- surfaces "not reviewed" warning on Board
generated_at        timestamptz DEFAULT now()
reviewed_at         timestamptz
is_current          boolean DEFAULT true
```

#### `interactions`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
person_id       uuid REFERENCES people(id) ON DELETE CASCADE
type            text DEFAULT 'call'   -- 'call' | 'message_exchange' | 'email_exchange'
notes_raw       text          -- founder's raw notes
transcript_raw  text          -- pasted transcript
scheduled_at    timestamptz
completed_at    timestamptz
created_at      timestamptz DEFAULT now()
```

#### `debriefs`
```sql
id                      uuid PRIMARY KEY DEFAULT gen_random_uuid()
interaction_id          uuid REFERENCES interactions(id) ON DELETE CASCADE
person_id               uuid REFERENCES people(id) ON DELETE CASCADE
project_id              uuid REFERENCES projects(id) ON DELETE CASCADE

-- AI-generated analysis
what_was_learned        text
pain_signals            text[]
unclear_items           text[]
missed_openings         text[]
objections_raised       text[]
coaching_feedback       text          -- interview technique coaching
next_person_suggestions text[]        -- who to talk to next based on this debrief
hypothesis_updates      jsonb         -- { hypothesis: string, status: 'strengthened' | 'weakened' | 'unchanged', evidence: string }[]
updated_assumptions     text[]

generated_at            timestamptz DEFAULT now()
```

#### `insights`
```sql
id                      uuid PRIMARY KEY DEFAULT gen_random_uuid()
project_id              uuid REFERENCES projects(id) ON DELETE CASCADE

-- AI-generated cross-call synthesis
persona_coverage        jsonb   -- { type: string, count: number, gap: boolean }[]
recurring_themes        text[]
unresolved_questions    text[]
hypothesis_evolution    jsonb   -- { hypothesis: string, trajectory: string, evidence_count: number }[]
interview_quality_trend text    -- narrative: "Questions improving — more workflow-focused, less feature-focused"
summary_statement       text    -- top-level annotated brief paragraph
calls_analyzed          integer
generated_at            timestamptz DEFAULT now()
is_current              boolean DEFAULT true
```

---

## 5. API Routes

All routes are Next.js App Router route handlers under `src/app/api/`.

### Projects
```
GET    /api/projects                          list all projects for authenticated user
POST   /api/projects                          create project + research goal
GET    /api/projects/[projectId]              get single project with metadata
PUT    /api/projects/[projectId]              update name, goal, stage
DELETE /api/projects/[projectId]              archive project
```

### People
```
GET    /api/projects/[projectId]/people       list all people with analysis, sorted by learning value
POST   /api/projects/[projectId]/people       create person + trigger crawl+analysis job
GET    /api/people/[personId]                 get full person record with all child data
PUT    /api/people/[personId]                 update manual fields (name, title, etc.)
POST   /api/people/[personId]/enrich          add more context (paste) + re-trigger analysis
PUT    /api/people/[personId]/status          move board status (bookmarked/contacted/scheduled/completed)
```

### Outreach
```
GET    /api/people/[personId]/outreach        get current outreach for all channels
POST   /api/people/[personId]/outreach        generate outreach for a specific channel
PUT    /api/people/[personId]/outreach/[id]   regenerate with adjustments
```

### Call Prep
```
GET    /api/people/[personId]/call-prep       get current call prep
POST   /api/people/[personId]/call-prep       generate call prep
PUT    /api/people/[personId]/call-prep/[id]  mark as reviewed
```

### Interactions + Debrief
```
POST   /api/people/[personId]/interactions    create interaction (log a call)
POST   /api/people/[personId]/debrief         submit notes/transcript → trigger debrief analysis
GET    /api/people/[personId]/debrief         get latest debrief
```

### Insights
```
GET    /api/projects/[projectId]/insights           get current insights (cached)
POST   /api/projects/[projectId]/insights/refresh   force regenerate
```

### Intake + Project Brief
```
GET    /api/projects/[projectId]/intake             get saved intake answers
PUT    /api/projects/[projectId]/intake             save / update intake answers
POST   /api/projects/[projectId]/brief              generate Project Brief from intake
GET    /api/projects/[projectId]/brief              get current Project Brief
POST   /api/projects/[projectId]/brief/refresh      re-run brief after new debriefs
```

---

## 6. AI Pipeline

All AI calls use the Anthropic Claude API with prompt caching where applicable.

### Job 0 — Generate Project Brief
**Trigger:** POST `/api/projects/[projectId]/brief` (called when founder completes intake)
**Runs via:** Inngest background job

```
Input:
  - All project_intake fields (5 sections of founder answers)

Prompt strategy:
  - System: "You are an experienced startup advisor running a founder office hours session.
             Analyze this founder's startup idea and generate a structured brief."
  - User: structured intake answers

Output (structured JSON via tool use):
  - idea_summary (clear concise writeup)
  - strengths[]
  - weaknesses[]
  - most_promising_avenues[]
  - assumptions[] with initial status: 'unvalidated'
  - recommended_conversations[] (persona_type + why + what_to_learn + urgency)

Store → project_briefs (new row, previous marked is_current = false)
```

### Job 0b — Update Project Brief after Debrief
**Trigger:** Automatically after every debrief analysis completes
**Runs via:** Inngest step chained from analyze-debrief

```
Input:
  - Current project_briefs.assumptions[]
  - New debrief output (what_was_learned, pain_signals, objections, hypothesis_updates)

Output:
  - Updated assumptions[] — each gets: strengthened / weakened / unchanged + evidence appended

Store → project_briefs.assumptions (update in place, bump updated_at)
Note: This is a targeted patch, not a full brief regeneration
```

### Job 1 — Crawl + Analyze Person
**Trigger:** POST `/api/projects/[projectId]/people`
**Runs via:** Inngest background job

```
Step 1: crawl_sources
  For each URL in source_urls:
    → Try Jina AI Reader (r.jina.ai/{url}) — free, no key
    → If response empty or below content threshold → fallback to Firecrawl API
    → Store result in people.crawled_content
    (All crawl logic encapsulated in src/lib/crawl/index.ts — Inngest calls the wrapper, not Jina/Firecrawl directly)

Step 2: analyze_person
  Input:
    - All crawled markdown
    - raw_pasted_text + additional_context
    - project.research_goal
    - project.target_user
    - project.target_buyer
    - project.current_stage

  Prompt strategy:
    - System: "You are analyzing a person for a founder doing customer discovery.
               The founder's project brief is: {brief_summary}.
               Their current unvalidated assumptions are: {assumptions}.
               Extract what is most relevant for their specific learning objective."
    - User: "Here is everything we know about this person: {all_content}"

  Output (structured JSON via tool use):
    - consolidated_background
    - persona_type + rationale
    - learning_value (high/medium/low) + reason
    - what_to_explore[]
    - assumptions_they_test[]     ← references specific assumptions from the project brief

  Store → people.analysis
```

### Job 2 — Generate Outreach
**Trigger:** POST `/api/people/[personId]/outreach`
**Runs:** Synchronously (fast enough, no crawl needed)

```
Input:
  - people.analysis
  - people.persona_type
  - channel (message | email)
  - project.research_goal

Output: channel-specific outreach object (see schema above)
Store → outreach table
```

### Job 3 — Generate Call Prep
**Trigger:** POST `/api/people/[personId]/call-prep`
**Runs:** Synchronously

```
Input:
  - people.analysis
  - people.persona_type
  - project.research_goal + current_stage
  - any previous debrief data from this person (if repeat conversation)

Output: call_prep object (see schema above)
Store → call_prep table
```

### Job 4 — Debrief Analysis
**Trigger:** POST `/api/people/[personId]/debrief`
**Runs via:** Inngest background job (transcripts can be long)

```
Input:
  - interactions.notes_raw or transcript_raw
  - people.analysis (who they were, what was expected)
  - call_prep.question_sequence (what was planned vs. what happened)
  - project.research_goal
  - all prior debriefs for this project (for hypothesis tracking)

Output: debrief object (see schema above)
Store → debriefs table
Side effect: invalidate insights cache (set insights.is_current = false)
```

### Job 5 — Cross-Call Insights
**Trigger:** GET `/api/projects/[projectId]/insights` (if stale) or manual refresh
**Runs via:** Inngest background job

```
Input:
  - All debriefs for the project
  - All people.analysis for the project
  - project.research_goal
  - projects.current_stage

Output: insights object (see schema above)
Store → insights table (new row, old row marked is_current = false)
```

### Prompt Caching Strategy
- System prompt + research goal context = cacheable prefix
- Person-specific content = dynamic suffix
- Reduces cost significantly for projects with many people against the same goal

---

## 7. Background Job Architecture (Inngest)

```
POST /api/people → create DB record (status: pending) → emit inngest event
                                                              ↓
                                              inngest function: crawl-and-analyze
                                              ├── step.run("crawl") → Firecrawl API
                                              ├── step.run("store-crawl") → update DB
                                              ├── step.run("analyze") → Claude API
                                              └── step.run("store-analysis") → update DB
                                                              ↓
                                              Frontend polls GET /api/people/[id]
                                              until analysis_status = 'done'
```

**Why Inngest:**
- Durable execution — survives Vercel function timeouts
- Built-in retries for crawl failures
- Step-level granularity — crawl failure doesn't re-run analysis
- Works natively with Next.js on Vercel

---

## 8. Data Flow — End to End

```
Founder pastes URL or text
        ↓
POST /api/projects/[id]/people
  → Creates person record (status: crawling)
  → Returns person.id immediately (optimistic UI)
  → Emits Inngest event
        ↓
Inngest: crawl-and-analyze
  → Firecrawl fetches each URL → markdown
  → Stored in people.crawled_content
  → Claude analyzes all content + research goal
  → Structured analysis stored in people.analysis
  → Status → 'done'
        ↓
Frontend polling detects status = 'done'
  → Card appears with full analysis
        ↓
Founder opens Person Workspace
  → Reads people.analysis (instant, from DB)
  → Requests outreach → POST /api/people/[id]/outreach → Claude → stored
  → Requests call prep → POST /api/people/[id]/call-prep → Claude → stored
        ↓
Founder has call, pastes notes
  → POST /api/people/[id]/debrief
  → Inngest: analyze-debrief → Claude → stored
  → Board status → 'completed'
  → insights.is_current → false
        ↓
Founder opens Insights
  → GET /api/projects/[id]/insights
  → If stale: triggers Inngest refresh job
  → Cross-call synthesis → new insights record
```

---

## 9. Authentication

- **Provider:** Google OAuth via Clerk (or NextAuth.js)
- **Session:** JWT stored in cookie, validated in Next.js middleware
- **Authorization:** All API routes check `session.userId` matches resource ownership — projects, people, and all child records are scoped to `user_id` via foreign keys
- **Row-level isolation:** Every DB query filters by user_id or joins through projects → user_id

---

## 10. Crawling — What Gets Crawled vs. What Doesn't

### Crawled (via Firecrawl)
| Source | What's extracted |
|---|---|
| Personal website / portfolio | Bio, experience, expertise, writing |
| GitHub profile | Bio, pinned repos, README, contribution areas |
| Company bio page | Role, responsibilities, team context |
| Speaker/conference page | Topics, talks, areas of focus |
| Blog / Substack / Medium | Writing topics, opinions, framing |
| LinkedIn public profile (if URL resolves publicly) | Role, experience summary only |

### Not Crawled
- LinkedIn pages that require login
- Private GitHub repos
- Gated content
- Any page requiring authentication

### Fallback
If a URL fails to crawl (rate limited, JS-only, login wall), the system:
1. Marks that URL as `crawl_failed`
2. Proceeds with whatever other content is available
3. Shows a non-alarming status on the card: "Some sources couldn't be reached — analysis based on available content"
4. Allows founder to paste content manually as fallback

---

## 11. Frontend State Strategy

| Data | Where it lives | How it's fetched |
|---|---|---|
| Project list | Server component | Direct DB query at page load |
| People list | Server component + client refetch | Initial SSR, polling for crawl status |
| Person analysis | Server component | Fetched when workspace opens |
| Outreach / call prep | Client (lazy) | Fetched on demand when section opens |
| Debrief | Client (lazy) | Fetched after submission completes |
| Insights | Server component | Fetched on page load, stale-while-revalidate |
| Board status | Client optimistic | Immediate local update, confirm via API |

**Crawl status polling:** When a person's `analysis_status` is `crawling` or `analyzing`, the people list polls `GET /api/people/[id]` every 3 seconds until status is `done` or `failed`. Card shows a calm loading state — no progress bar, no percentage, no animated AI flourish.

---

## 12. Feature Flags (MVP vs. Future)

| Feature | MVP | Future |
|---|---|---|
| User inputs people manually | ✅ | ✅ |
| AI crawls + analyzes submitted people | ✅ | ✅ |
| Outreach generation (message + email) | ✅ | ✅ |
| Call prep generation | ✅ | ✅ |
| Post-call debrief analysis | ✅ | ✅ |
| Cross-call insights | ✅ | ✅ |
| Board (Kanban by stage) | ✅ | ✅ |
| Multiple projects | ✅ | ✅ |
| AI recommends new people to add | ❌ | Premium |
| "Find more people like X" | ❌ | Premium |
| Team collaboration / shared projects | ❌ | Future |
| Email sequence automation | ❌ | Never (out of scope) |
| LinkedIn automation | ❌ | Never (out of scope) |
| Expert marketplace | ❌ | Future |

---

## 13. Environment Variables

```env
# Database
DATABASE_URL=                       # Neon pooled connection string
DATABASE_URL_UNPOOLED=              # Neon direct connection (for migrations)

# Auth
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=

# AI — via internal provider wrapper, do not call Anthropic SDK directly
ANTHROPIC_API_KEY=

# Crawling — Jina needs no key (free, HTTP). Firecrawl key only needed when Jina fallback triggers.
FIRECRAWL_API_KEY=                  # optional for MVP; only required when Jina fallback is hit

# Background jobs
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# App
NEXT_PUBLIC_SITE_URL=
```

The following are explicitly not in `.env` for MVP:
- No Redis / Upstash credentials
- No file storage credentials (Vercel Blob / S3 / R2)
- No separate vector DB

---

## 14. Deployment

- **Platform:** Vercel
- **Root directory:** `packages/discovery-ui`
- **Build command:** `npm run build`
- **Database migrations:** Run via `npm run db:migrate` before deploy
- **Inngest:** Served at `/api/inngest` — registered in Inngest dashboard pointing to production URL
- **Crawl timeout:** Firecrawl handles its own timeout; Inngest step timeout set to 60s per URL

---

## 15. Build Phases

Development is split into two parallel tracks. Track A (landing + auth) ships first and establishes brand tone. Track B (app) builds behind it.

### Track A — Public-facing (ships first)

1. **Project scaffold** — Next.js 15 setup, Drizzle config, base CSS tokens from ClawTrace design system
2. **Landing page** — value prop, how it works, CTA
3. **Auth — login + signup** — Google OAuth + email/password via Clerk, post-auth redirect logic

No waitlist. Fully open signup from day one. App remains in dev (not publicly promoted) until Track B is complete. Anyone with the URL can sign up and will land in the app shell.

Track A can be deployed and iterated on while Track B is being built. Tone, typography, copy, and brand decisions made here carry forward into the app.

### Track B — Application (builds after Track A)

5. **DB schema + migrations** — all tables including project_intake and project_briefs
6. **App shell** — authenticated layout, project switcher, left rail nav
7. **Project Intake (Founder Office Hours)** — 5-section progressive form, save answers per section
8. **Project Brief generation** — intake → Claude → structured brief with assumptions
9. **Project Brief display** — living document with assumption status tracker
10. **People — input + crawl pipeline** — paste URL/text → Firecrawl → Claude analysis against brief
11. **Person Workspace** — unified popup: identity, context, outreach, call prep, debrief
12. **Outreach generation** — message + email per person
13. **Board** — kanban with stage transitions + call prep warning
14. **Call prep generation** — full call brief
15. **Debrief** — notes/transcript → analysis + auto-update Project Brief assumptions
16. **Insights** — cross-call synthesis (requires multiple debriefs to be meaningful)

---

## 16. Landing Page Spec

**Product name:** Startup Foundry

### Purpose
- Establish brand tone before the app is built
- Convert visiting founders to signups
- Set clear expectations: this product enters before outreach — it starts with the idea itself

### Sections
```
1. Hero
   Headline: short, direct, founder-voice
   Subhead: one sentence on the full arc — from messy idea to better conversations
   CTA: "Get started" → signup

2. The problem (2–3 lines)
   Not a feature list. The real founder struggle:
   unclear idea, no network, don't know who to talk to or what to ask,
   lose everything learned after each call.

3. How it works (3 steps — the 3-layer arc)
   Step 1: Pressure-test your idea
           Answer structured questions. Get a project brief with strengths,
           risks, and recommended first conversations.
   Step 2: Analyze and prep every conversation
           Add someone you've found. Get outreach, call prep, and post-call coaching.
   Step 3: Watch your thinking evolve
           Every conversation updates your brief. Patterns emerge across calls.

4. What makes it different (brief)
   Most tools ask "who do I message?"
   This one starts earlier: "is this a good idea, who should I talk to,
   and what should I actually be learning?"

5. CTA repeat
   Same as hero.

6. Footer
   Minimal. Startup Foundry wordmark, tagline, legal links.
```

### Design rules (from ClawTrace philosophy, applied here)
- No font-weight above 550 anywhere on the page
- No gradient hero blobs or glowing AI visuals
- Calm, editorial feel — more like a well-designed essay than a SaaS landing page
- Color is restrained — neutral background, one action accent
- Copy is direct and operational — no hype language ("revolutionary", "game-changing", "supercharge")
- Mobile-first for the landing page (unlike the app, which is desktop-first)

### Auth flow
```
Landing page CTA ("Get started" / "Sign up")
      ↓
/signup → Google OAuth  OR  email + password  (both via Clerk)
      ↓
New user    → /onboarding  (create first project + research goal)
Returning   → /dashboard   (most recent project board)
Logged out  → any /app/*   redirect → /login
```

### Auth notes
- Both Google OAuth and email/password supported from day one via Clerk
- No waitlist, no invite codes, no access gating — fully open signup
- App is in dev and not publicly promoted; anyone with the URL can sign up
- SEO and OG tags are low priority until launch
