# Startup Foundry

An AI-powered founder discovery copilot. Pressure-test your startup idea, find the right people to learn from, prepare smarter outreach and conversations, and get better after every call.

## What it does

- **Project Brief** — Structured intake that exposes weak spots, identifies promising angles, and outputs a living hypothesis document that updates as you learn.
- **Person Analysis** — Paste a URL or profile. AI scores learning value against your current hypothesis and surfaces who to talk to and why.
- **Conversation Prep** — Outreach drafts, call briefs, and tailored question sequences generated per person.
- **Conversation Insights** — Paste notes or a transcript. Get a debrief on what you learned, what you missed, and how your assumptions are holding up.

## Tech stack

- [Next.js 15](https://nextjs.org) (App Router)
- [Clerk](https://clerk.com) — auth
- [Neon](https://neon.tech) — serverless Postgres
- [Drizzle ORM](https://orm.drizzle.team)
- [Anthropic SDK](https://docs.anthropic.com) — AI
- [Inngest](https://www.inngest.com) — background jobs

## Getting started

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and fill in the required values before running.

### Database

```bash
npm run db:generate   # generate migrations from schema
npm run db:migrate    # run migrations
```

## Project structure

```
src/
  app/          # Next.js App Router pages and API routes
  components/   # UI components
  lib/          # Shared utilities, DB client, AI helpers
scripts/        # DB migration runner
drizzle/        # Generated migration files
```
