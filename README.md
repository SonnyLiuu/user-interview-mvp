# User Interview MVP

A discovery workspace for early-stage founders. The app turns a rough startup idea into a structured project foundation, helps evaluate people to talk to, generates call prep and outreach drafts, and tracks conversations through a lightweight CRM board.

The product is built around one loop:

1. Define the foundation for a startup idea.
2. Add people from LinkedIn, personal sites, or other URLs.
3. Let AI analyze whether each person is worth talking to.
4. Generate outreach and call prep.
5. Move people through the outreach pipeline and capture learnings.

## Features

- **Foundation**: guided onboarding and editable foundation doc for hypothesis, target user, pain point, value prop, ideal people, differentiation, and disqualifiers.
- **People research**: paste URLs, crawl pages with Firecrawl, and analyze relevance against the current foundation.
- **Call prep**: generate a focused brief for a specific person with objective, goals, questions, signals, and closing ask.
- **Outreach**: generate a short outreach draft tailored to the recipient without exposing the product idea.
- **Board**: CRM pipeline for `To Contact`, `Sent`, `Scheduled`, and `Completed`.
- **Transcripts and events**: add call/message transcripts and record person events.
- **Desktop hooks**: desktop auth and desktop people/call-brief API routes exist for native app integration.

## Tech Stack

### Web App

- Next.js 16 App Router
- React 19
- TypeScript
- Clerk auth
- Drizzle ORM
- Neon Postgres
- Zod for local API validation

### Backend Service

- FastAPI
- asyncpg
- Pydantic settings/models
- OpenAI, Anthropic, or Gemini provider support

### External Services

- Clerk for auth and webhooks
- Firecrawl for person research crawling
- OpenAI / Anthropic / Gemini for AI generation

## Repo Layout

```text
src/
  app/
    (app)/dashboard/[slug]/
      (workspace)/
        board/
        foundation/
        insights/
        people/
    api/
      backend/[...path]/              # generic proxy to FastAPI
      people/                         # local people/crawl/CRM routes
      projects/                       # project creation proxy
      desktop/                        # desktop integration routes
      webhooks/clerk/
  components/
    app-nav/
    board/
    brief/
    landing/
    onboarding/
    people/
    project/
  lib/
    ai/                               # Next-side person analysis provider stack
    db/                               # Drizzle schema and connection
    backend-*.ts                      # FastAPI auth/proxy helpers

services/foundry-api/
  app/
    routers/
    services/
    repositories/
    schemas/
    ai.py                             # FastAPI AI provider/task layer

drizzle/                              # SQL migrations
docs/                                 # audit and architecture notes
desktop/native/                       # native desktop source/build area
scripts/migrate.ts                    # migration runner
```

## Getting Started

### 1. Install Web Dependencies

```powershell
npm install
```

### 2. Install Backend Dependencies

```powershell
cd services/foundry-api
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..\..
```

### 3. Configure Environment

Copy the examples:

```powershell
Copy-Item .env.example .env.local
Copy-Item services\foundry-api\.env.example services\foundry-api\.env.local
```

Use the same `DATABASE_URL` and `FOUNDRY_BACKEND_SHARED_SECRET` in both env files.

### 4. Apply Migrations

```powershell
npm run db:migrate
```

Do not run `npm run db:generate` during normal setup. This repo currently uses hand-written SQL migrations after `0002`; use `db:generate` only when intentionally changing the migration workflow.

### 5. Run Locally

Terminal 1:

```powershell
npm run dev
```

Terminal 2:

```powershell
cd services/foundry-api
.\.venv\Scripts\python.exe app/main.py
```

Default URLs:

- Web app: `http://localhost:3000`
- FastAPI: `http://127.0.0.1:8001`
- FastAPI health check: `http://127.0.0.1:8001/healthz`

## Environment Variables

### Root `.env.local`

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Yes | Public app URL. |
| `DATABASE_URL` | Yes | Neon pooled connection string. |
| `DATABASE_URL_UNPOOLED` | Recommended | Direct Neon connection for migrations. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk frontend key. |
| `CLERK_SECRET_KEY` | Yes | Clerk server key. |
| `CLERK_WEBHOOK_SECRET` | Yes | Clerk webhook signing secret. |
| `AI_PROVIDER` | Yes | General AI provider for app generation flows: `openai`, `anthropic`, or `gemini`; defaults to OpenAI behavior. |
| `OPENAI_API_KEY` | Provider-dependent | Required when `AI_PROVIDER=openai`; can also be used as the checklist Realtime fallback key. |
| `ANTHROPIC_API_KEY` | Provider-dependent | Required when `AI_PROVIDER=anthropic`. |
| `GEMINI_API_KEY` | Provider-dependent | Required when `AI_PROVIDER=gemini`. |
| `OPENAI_MODEL` | No | Defaults to `gpt-4o`. |
| `CHECKLIST_AI_PROVIDER` | No | Desktop live-call checklist provider. Defaults to `openai`; use `azure` for Azure OpenAI Realtime or `mock` for local no-key smoke tests. |
| `OPENAI_REALTIME_API_KEY` | No | Optional dedicated OpenAI key for the desktop live-call checklist; falls back to `OPENAI_API_KEY`. |
| `OPENAI_REALTIME_MODEL` | No | Defaults to `gpt-realtime`; used by the desktop live-call auto-cross-off feature. |
| `AZURE_OPENAI_REALTIME_ENDPOINT` | Required for Azure checklist | Azure OpenAI endpoint, for example `https://resource.openai.azure.com/openai/v1`. |
| `AZURE_OPENAI_REALTIME_API_KEY` | Required for Azure checklist | Azure OpenAI/Foundry API key used only when `CHECKLIST_AI_PROVIDER=azure`. |
| `AZURE_OPENAI_REALTIME_DEPLOYMENT` | Required for Azure checklist | Azure realtime deployment name, not necessarily the raw model name. |
| `AZURE_OPENAI_TRANSCRIPTION_DEPLOYMENT` | Required for Azure transcription | Azure transcription deployment name used by source transcription flows. |
| `OPENAI_WEB_SEARCH_MODEL` | No | Optional model override for ongoing-advisor web search; defaults to `OPENAI_MODEL`. |
| `ANTHROPIC_MODEL` | No | Defaults to `claude-sonnet-4-6`. |
| `GEMINI_MODEL` | No | Defaults to `gemini-2.5-pro`. |
| `GEMINI_WEB_SEARCH_MODEL` | No | Optional model override for ongoing-advisor web search; defaults to `GEMINI_MODEL`. |
| `GEMINI_THINKING_LEVEL` | No | Optional Gemini thinking control. |
| `AI_REQUEST_TIMEOUT_SECONDS` | No | AI provider request timeout in seconds; defaults to `45`. |
| `FIRECRAWL_API_KEY` | Yes for person research | Used by `/api/people/[personId]/crawl`. |
| `FOUNDRY_API_BASE_URL` | Yes | Usually `http://127.0.0.1:8001` locally. |
| `FOUNDRY_DESKTOP_API_PUBLIC_URL` | No | Public FastAPI base URL used by the Windows overlay for live SSE/WebSocket streams; falls back to `FOUNDRY_API_BASE_URL`. |
| `FOUNDRY_OVERLAY_INSTALLER_URL` | No | Public URL for the signed Windows installer shown on `/download` and settings. |
| `FOUNDRY_BACKEND_SHARED_SECRET` | Yes | Shared HMAC secret for Next -> FastAPI calls. |
| `ZOOM_RTMS_ENABLED` | No | Enables Zoom RTMS integration; defaults to `false`. |
| `ZOOM_RTMS_CLIENT_ID` | Required for Zoom RTMS | Zoom RTMS client ID. |
| `ZOOM_RTMS_CLIENT_SECRET` | Required for Zoom RTMS | Zoom RTMS client secret. |
| `ZOOM_RTMS_WEBHOOK_SECRET_TOKEN` | Required for Zoom RTMS | Zoom RTMS webhook secret token. |
| `RECALL_API_KEY` | Required for Recall.ai | Recall.ai meeting bot API key. |
| `RECALL_REGION` | No | Recall.ai region; defaults to `us-west-2`. |
| `RECALL_WEBHOOK_SECRET` | No | Recall.ai webhook signing secret. |
| `FIREFLIES_API_KEY` | Required for Fireflies | Fireflies API key for transcript import. |
| `FIREFLIES_WEBHOOK_SECRET` | No | Fireflies webhook signing secret. |
| `OTTER_API_KEY` | Required for Otter.ai | Otter.ai API key for transcript import. |
| `OTTER_WEBHOOK_SECRET` | No | Otter.ai webhook signing secret. |

### `services/foundry-api/.env.local`

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Postgres connection string. |
| `FOUNDRY_BACKEND_SHARED_SECRET` | Yes | Must match root env. |
| `AI_PROVIDER` | Yes | General AI provider for app generation flows: `openai`, `anthropic`, or `gemini`. |
| `OPENAI_API_KEY` | Provider-dependent | Required when `AI_PROVIDER=openai`; can also be used as the checklist Realtime fallback key. |
| `ANTHROPIC_API_KEY` | Provider-dependent | Required when `AI_PROVIDER=anthropic`. |
| `GEMINI_API_KEY` | Provider-dependent | Required when `AI_PROVIDER=gemini`. |
| `OPENAI_MODEL` | No | Defaults to `gpt-4o`. |
| `CHECKLIST_AI_PROVIDER` | No | Desktop live-call checklist provider. Defaults to `openai`; use `azure` for Azure OpenAI Realtime or `mock` for local no-key smoke tests. |
| `OPENAI_REALTIME_API_KEY` | No | Optional dedicated OpenAI key for the desktop live-call checklist; falls back to `OPENAI_API_KEY`. |
| `OPENAI_REALTIME_MODEL` | No | Defaults to `gpt-realtime`; used by the desktop live-call auto-cross-off feature. |
| `AZURE_OPENAI_REALTIME_ENDPOINT` | Required for Azure checklist | Azure OpenAI endpoint, for example `https://resource.openai.azure.com/openai/v1`. |
| `AZURE_OPENAI_REALTIME_API_KEY` | Required for Azure checklist | Azure OpenAI/Foundry API key used only when `CHECKLIST_AI_PROVIDER=azure`. |
| `AZURE_OPENAI_REALTIME_DEPLOYMENT` | Required for Azure checklist | Azure realtime deployment name, not necessarily the raw model name. |
| `AZURE_OPENAI_TRANSCRIPTION_DEPLOYMENT` | Required for Azure transcription | Azure transcription deployment name used by source transcription flows. |
| `OPENAI_WEB_SEARCH_MODEL` | No | Optional model override for ongoing-advisor web search; defaults to `OPENAI_MODEL`. |
| `ANTHROPIC_MODEL` | No | Defaults to `claude-sonnet-4-6`. |
| `GEMINI_MODEL` | No | Defaults to `gemini-2.5-pro`. |
| `GEMINI_WEB_SEARCH_MODEL` | No | Optional model override for ongoing-advisor web search; defaults to `GEMINI_MODEL`. |
| `GEMINI_THINKING_LEVEL` | No | Optional Gemini thinking control. |
| `AI_REQUEST_TIMEOUT_SECONDS` | No | AI provider request timeout in seconds; defaults to `45`. |
| `ZOOM_RTMS_ENABLED` | No | Enables Zoom RTMS integration; defaults to `false`. |
| `ZOOM_RTMS_CLIENT_ID` | Required for Zoom RTMS | Zoom RTMS client ID. |
| `ZOOM_RTMS_CLIENT_SECRET` | Required for Zoom RTMS | Zoom RTMS client secret. |
| `ZOOM_RTMS_WEBHOOK_SECRET_TOKEN` | Required for Zoom RTMS | Zoom RTMS webhook secret token. |
| `RECALL_API_KEY` | Required for Recall.ai | Recall.ai meeting bot API key. |
| `RECALL_REGION` | No | Recall.ai region; defaults to `us-west-2`. |
| `RECALL_WEBHOOK_SECRET` | No | Recall.ai webhook signing secret. |
| `FIREFLIES_API_KEY` | Required for Fireflies | Fireflies API key for transcript import. |
| `FIREFLIES_WEBHOOK_SECRET` | No | Fireflies webhook signing secret. |
| `OTTER_API_KEY` | Required for Otter.ai | Otter.ai API key for transcript import. |
| `OTTER_WEBHOOK_SECRET` | No | Otter.ai webhook signing secret. |

## Common Commands

```powershell
npm run dev          # Next dev server
npm run test         # Web unit tests
npm run test:backend # FastAPI service unit tests
npm run typecheck    # TypeScript check
npm run build        # Production Next build
npm run start        # Start built Next app
npm run db:migrate   # Apply Drizzle migrations
npm run db:push      # Push schema directly; avoid unless intentional
```

Backend:

```powershell
cd services/foundry-api
.\.venv\Scripts\python.exe app/main.py
.\.venv\Scripts\python.exe -c "import sys; sys.path.insert(0, '.'); from app.main import app; print(len(app.routes))"
```

## Data And API Shape

The app uses both local Next API routes and the FastAPI service:

- Next local API routes own people creation, crawling, transcripts, and CRM actions.
- FastAPI owns project lookup/listing, onboarding chat, foundation view/patch, call prep, and outreach generation.
- `/api/backend/[...path]` is a generic authenticated proxy from Next to FastAPI.
- Bespoke proxy routes also exist for call brief, outreach, projects, and desktop call brief flows.

See `docs/INVENTORY.md` for the route map.

## Migrations

Migrations live in `drizzle/`.

Important current convention:

- `0000` through `0002` have generated Drizzle snapshots.
- `0003` onward are hand-written SQL migrations with journal entries.
- `0008_query_indexes.sql` adds the current query/index baseline.

Run:

```powershell
npm run db:migrate
```

After pulling latest, run `npm run db:migrate` before using the app if new files appeared in `drizzle/`.

Avoid destructive resets unless you know the database is disposable.

## Audit Docs

The repo includes a full housekeeping and performance audit trail:

- `docs/INVENTORY.md`
- `docs/API_FLOW_AUDIT.md`
- `docs/CLIENT_BOUNDARY_AUDIT.md`
- `docs/BACKEND_ENDPOINT_AUDIT.md`
- `docs/AI_COST_AUDIT.md`
- `docs/DB_SCHEMA_AUDIT.md`
- `docs/CONTRACT_AUDIT.md`
- `docs/notetaker-architecture.md`
- `docs/PERF_AUDIT.md`

The highest-value next refactor target is `PersonDetailClient`, followed by `AppNav`.

## Deployment Checklist

- Clerk app configured with auth URLs and webhook to `/api/webhooks/clerk`.
- Neon database provisioned.
- Root and backend env vars configured.
- `FOUNDRY_BACKEND_SHARED_SECRET` matches in both services.
- `npm run db:migrate` applied.
- FastAPI deployed and reachable at `FOUNDRY_API_BASE_URL`.
- FastAPI CORS origins updated for production in `services/foundry-api/app/config.py` or environment/config layer.
- Local verification passes:

```powershell
npm run typecheck
npm run build
```
