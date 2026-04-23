# Startup Foundry

This tool helps new founders. It helps you brainstorm an ambiguous idea through many questions that aim to uncover the most promising areas, while meaningfully pushing back on the ambiguity to bring attention to weak points. The goal is to brainstorm together in order to find the best possible version of your idea and extract a clear and actionable foundation document. Using this document, a personalized AI model will take deep analysis of people you are interested in contacting in the context of your business idea. This allows for a tool that knows your vision and can isolate what makes contacting that person valuable to you. 

One of the tallest challenges for new founders with limited networks is outreach. Startup Foundry helps find who to contact and drafts customized outreach messages to clearly state your purposes. The interface revolves around this foundation and tracks the people you reach out to in varying stages via CRM, also taking care of outbound email/message drafts, briefs before scheduled calls, and after call debriefs that help you learn more from every call. By viewing these insights, especially across multiple calls you can find patterns and shortcomings to improve upon with your pitch, tone, and balance your outreach between the right people with less gaps.

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
- [OpenAI SDK](https://developers.openai.com/api/docs) - AI

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
