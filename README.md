# User Interview

A tool that helps founders do user interviews properly. Tell it your idea, it builds your hypothesis. Then it finds the right people to talk to on LinkedIn and Twitter, generates a personalized call brief for each one, and tracks everyone in a pipeline so you know who you've reached out to, who's scheduled, and who you've talked to. Most founders go into interviews with no structure and come out with vibes instead of signal. This fixes that.

## Features

- **Foundation** — Chat-based onboarding that turns your rough idea into a structured hypothesis: assumptions to validate, strengths, weak spots, and who to talk to first.
- **People** — Paste a LinkedIn, Twitter, or personal website URL. AI analyzes each person's relevance to your hypothesis and tells you exactly why they're worth your time.
- **Call Brief** — Auto-generated prep brief per person: a sharp objective, tailored questions based on their background, and signals to listen for (green flags and red flags). Designed to be used live during the call.
- **Board** — Kanban pipeline across outreach stages: To Contact → Sent → Scheduled → Completed. Bookmark people from the People page to add them here.
- **Insights** — Aggregated learnings across calls, showing how your assumptions are holding up.

## Tech stack

**Frontend**
- [Next.js 15](https://nextjs.org) (App Router) + React 19
- [Clerk](https://clerk.com) — auth (OAuth/SSO + webhook user sync)
- [Drizzle ORM](https://orm.drizzle.team) + [Neon](https://neon.tech) — serverless Postgres

**Backend**
- [FastAPI](https://fastapi.tiangolo.com) (Python) — streaming AI responses and background jobs
- [asyncpg](https://magicstack.github.io/asyncpg/) — async Postgres driver

**External services**
- OpenAI or Anthropic (configurable via `AI_PROVIDER`)
- [Firecrawl](https://firecrawl.dev) — web scraping for person analysis (optional)

## Getting started

### 1. Install dependencies

```bash
# Frontend
npm install

# Backend
cd services/foundry-api
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in all required values — see [Environment variables](#environment-variables) below.

### 3. Run migrations

```bash
npm run db:generate   # generate migration files from schema
npm run db:migrate    # apply migrations to the database
```

### 4. Start the dev servers

```bash
# Terminal 1 — Next.js frontend (http://localhost:3000)
npm run dev

# Terminal 2 — FastAPI backend (http://localhost:8001)
cd services/foundry-api
python app/main.py
```

## Environment variables

### Frontend (`.env.local`)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Yes | Public URL of the app |
| `DATABASE_URL` | Yes | Neon pooled connection string |
| `DATABASE_URL_UNPOOLED` | Yes | Neon direct connection (used for migrations) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key |
| `CLERK_SECRET_KEY` | Yes | Clerk secret key |
| `CLERK_WEBHOOK_SECRET` | Yes | Clerk webhook signing secret |
| `AI_PROVIDER` | Yes | `openai` or `anthropic` |
| `OPENAI_API_KEY` | If `AI_PROVIDER=openai` | OpenAI API key |
| `ANTHROPIC_API_KEY` | If `AI_PROVIDER=anthropic` | Anthropic API key |
| `FOUNDRY_API_BASE_URL` | Yes | FastAPI base URL (e.g. `http://127.0.0.1:8001`) |
| `FOUNDRY_BACKEND_SHARED_SECRET` | Yes | HMAC key shared with backend for request signing |
| `FIRECRAWL_API_KEY` | No | Enables web scraping for person analysis |

### Backend (`services/foundry-api/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `FOUNDRY_BACKEND_SHARED_SECRET` | Yes | Must match the frontend secret |
| `AI_PROVIDER` | Yes | `openai` or `anthropic` |
| `OPENAI_API_KEY` | If `AI_PROVIDER=openai` | OpenAI API key |
| `ANTHROPIC_API_KEY` | If `AI_PROVIDER=anthropic` | Anthropic API key |

## Project structure

```
src/
  app/
    (app)/dashboard/[slug]/         # Per-project workspaces
      onboarding/                   # Guided intake chat
      (workspace)/
        foundation/                 # Project hypothesis view
        people/                     # CRM — person list & detail
        insights/                   # Aggregated learnings
        board/                      # Kanban by outreach stage
    api/
      backend/[...path]/            # Proxy to FastAPI
      projects/                     # Project CRUD
      people/[personId]/
        crawl/                      # Trigger web scraping + AI analysis
        bookmark/                   # Toggle favorite
      webhooks/clerk/               # Clerk → database user sync
  lib/
    ai/                             # AI provider adapters + task implementations
    db/                             # Drizzle schema & connection
    onboarding/                     # Slot progression engine

services/foundry-api/               # FastAPI backend
  app/
    routers/                        # projects, onboarding, intake, briefs, workspace, dashboard
    services/                       # Business logic
    repositories/                   # DB query layer

scripts/                            # DB migration runner
drizzle/                            # Generated migration files
docs/                               # Architecture specs
```

## Deployment checklist

- [ ] Clerk app created with webhook pointing to `/api/webhooks/clerk`
- [ ] Neon Postgres database provisioned
- [ ] Migrations applied: `npm run db:migrate`
- [ ] All environment variables set on both frontend and backend hosts
- [ ] FastAPI backend deployed and reachable at `FOUNDRY_API_BASE_URL`
- [ ] `FOUNDRY_BACKEND_SHARED_SECRET` is identical on both services
- [ ] CORS origins in `services/foundry-api/app/main.py` updated to production URL
