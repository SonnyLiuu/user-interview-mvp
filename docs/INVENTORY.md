# Codebase Inventory

Phase 1 baseline inventory for `wip/pre-audit-baseline`.
Generated on 2026-05-05 after Phase 0 migration verification.

## Scope Notes

- Primary web app: `src/app`, `src/components`, `src/lib`.
- Backend service: `services/foundry-api/app`.
- Desktop native code is present under `desktop/native/src`; generated CMake output under `desktop/native/build` is not audit source.
- Drizzle snapshots under `drizzle/meta/*.json` are generated history and are excluded from refactor-candidate file size rankings.

## Next.js Page Routes

### App Workspace Routes

| Route | Source |
| --- | --- |
| `/settings` | `src/app/(app)/settings/page.tsx` |
| `/onboarding` | `src/app/(app)/onboarding/page.tsx` |
| `/onboarding/[slug]` | `src/app/(app)/onboarding/[slug]/page.tsx` |
| `/dashboard` | `src/app/(app)/dashboard/page.tsx` |
| `/dashboard/[slug]` | `src/app/(app)/dashboard/[slug]/page.tsx` |
| `/dashboard/[slug]/board` | `src/app/(app)/dashboard/[slug]/(workspace)/board/page.tsx` |
| `/dashboard/[slug]/foundation` | `src/app/(app)/dashboard/[slug]/(workspace)/foundation/page.tsx` |
| `/dashboard/[slug]/insights` | `src/app/(app)/dashboard/[slug]/(workspace)/insights/page.tsx` |
| `/dashboard/[slug]/people` | `src/app/(app)/dashboard/[slug]/(workspace)/people/page.tsx` |
| `/dashboard/[slug]/people/[personId]` | `src/app/(app)/dashboard/[slug]/(workspace)/people/[personId]/page.tsx` |

### Public/Auth/Desktop Routes

| Route | Source |
| --- | --- |
| `/` | `src/app/page.tsx` |
| `/login` | `src/app/(auth)/login/page.tsx` |
| `/signup` | `src/app/(auth)/signup/page.tsx` |
| `/privacy` | `src/app/privacy/page.tsx` |
| `/terms` | `src/app/terms/page.tsx` |
| `/desktop-auth` | `src/app/desktop-auth/page.tsx` |

## Next.js API Routes

| Methods | Route | Source | Notes |
| --- | --- | --- | --- |
| `GET,POST,PUT,PATCH,DELETE` | `/api/backend/[...path]` | `src/app/api/backend/[...path]/route.ts` | Generic proxy to FastAPI. |
| `GET` | `/api/desktop/auth-test` | `src/app/api/desktop/auth-test/route.ts` | Desktop auth smoke test. |
| `GET` | `/api/desktop/people` | `src/app/api/desktop/people/route.ts` | Desktop people access. |
| `GET` | `/api/desktop/people/[personId]/call-brief` | `src/app/api/desktop/people/[personId]/call-brief/route.ts` | Desktop proxy to FastAPI call brief. |
| `POST` | `/api/desktop/sessions/end` | `src/app/api/desktop/sessions/end/route.ts` | Ends desktop session. |
| `POST` | `/api/projects` | `src/app/api/projects/route.ts` | Direct project creation proxy to FastAPI. |
| `POST` | `/api/people` | `src/app/api/people/route.ts` | Creates a person locally. |
| `GET,PATCH,DELETE` | `/api/people/[personId]` | `src/app/api/people/[personId]/route.ts` | Local person read/update/delete. |
| `POST` | `/api/people/[personId]/bookmark` | `src/app/api/people/[personId]/bookmark/route.ts` | Local bookmark toggle. |
| `GET,POST` | `/api/people/[personId]/call-brief` | `src/app/api/people/[personId]/call-brief/route.ts` | Proxy to FastAPI read/regenerate call brief. |
| `POST` | `/api/people/[personId]/crawl` | `src/app/api/people/[personId]/crawl/route.ts` | Firecrawl scrape/crawl then local person update. |
| `POST` | `/api/people/[personId]/ineffective` | `src/app/api/people/[personId]/ineffective/route.ts` | Marks person ineffective. |
| `POST` | `/api/people/[personId]/outreach` | `src/app/api/people/[personId]/outreach/route.ts` | Proxy to FastAPI outreach generation. |
| `POST` | `/api/people/[personId]/outreach-sent` | `src/app/api/people/[personId]/outreach-sent/route.ts` | Marks outreach sent. |
| `POST` | `/api/people/[personId]/schedule` | `src/app/api/people/[personId]/schedule/route.ts` | Marks/schedules person. |
| `PATCH` | `/api/people/[personId]/stage` | `src/app/api/people/[personId]/stage/route.ts` | Updates CRM stage. |
| `GET,POST` | `/api/people/[personId]/transcripts` | `src/app/api/people/[personId]/transcripts/route.ts` | Local transcript read/create. |
| `POST` | `/api/webhooks/clerk` | `src/app/api/webhooks/clerk/route.ts` | Clerk webhook verified through Svix. |

## FastAPI Endpoints

| Methods | Path | Handler |
| --- | --- | --- |
| `GET` | `/healthz` | `healthz` |
| `GET` | `/v1/dashboard/latest-project` | `latest_project` |
| `GET` | `/v1/projects` | `list_projects` |
| `POST` | `/v1/projects` | `create_project` |
| `GET` | `/v1/projects/by-slug/{slug_or_id}` | `project_by_slug` |
| `GET` | `/v1/projects/{project_id}` | `get_project` |
| `PUT,PATCH` | `/v1/projects/{project_id}` | `update_project` |
| `DELETE` | `/v1/projects/{project_id}` | `delete_project` |
| `PATCH` | `/v1/projects/{project_id}/foundation` | `patch_foundation` |
| `GET` | `/v1/projects/{project_id}/foundation-view` | `foundation_view` |
| `GET` | `/v1/projects/{project_id}/intake` | `get_intake` |
| `POST` | `/v1/projects/{project_id}/intake/chat` | `intake_chat` |
| `POST` | `/v1/projects/{project_id}/onboarding/chat` | `onboarding_chat` |
| `GET` | `/v1/projects/{project_id}/workspace-summary` | `workspace_summary` |
| `GET` | `/v1/people/{person_id}/call-brief` | `read_call_brief` |
| `POST` | `/v1/people/{person_id}/call-brief/refresh` | `regenerate_call_brief` |
| `POST` | `/v1/people/{person_id}/outreach/refresh` | `regenerate_outreach` |

Router modules included by `services/foundry-api/app/main.py`:

- `projects`
- `onboarding`
- `intake`
- `call_prep`
- `outreach`
- `dashboard`
- `workspace`

## Drizzle Tables

| Export | Table | Source |
| --- | --- | --- |
| `users` | `users` | `src/lib/db/schema.ts` |
| `projects` | `projects` | `src/lib/db/schema.ts` |
| `project_intake` | `project_intake` | `src/lib/db/schema.ts` |
| `project_briefs` | `project_briefs` | `src/lib/db/schema.ts` |
| `people` | `people` | `src/lib/db/schema.ts` |
| `outreach` | `outreach` | `src/lib/db/schema.ts` |
| `call_prep` | `call_prep` | `src/lib/db/schema.ts` |
| `interactions` | `interactions` | `src/lib/db/schema.ts` |
| `debriefs` | `debriefs` | `src/lib/db/schema.ts` |
| `insights` | `insights` | `src/lib/db/schema.ts` |
| `onboarding_sessions` | `onboarding_sessions` | `src/lib/db/schema.ts` |
| `onboarding_messages` | `onboarding_messages` | `src/lib/db/schema.ts` |
| `onboarding_state` | `onboarding_state` | `src/lib/db/schema.ts` |
| `project_foundations` | `project_foundations` | `src/lib/db/schema.ts` |
| `transcripts` | `transcripts` | `src/lib/db/schema.ts` |
| `person_events` | `person_events` | `src/lib/db/schema.ts` |

Fresh-migration check after Phase 0 confirmed public tables:

`call_prep`, `debriefs`, `insights`, `interactions`, `onboarding_messages`, `onboarding_sessions`, `onboarding_state`, `outreach`, `people`, `person_events`, `project_briefs`, `project_foundations`, `project_intake`, `projects`, `transcripts`, `users`.

## Large Files

Top non-generated files by line count. Drizzle JSON snapshots and build outputs are excluded.

| Lines | Path |
| ---: | --- |
| 1059 | `desktop/native/src/windows/main.cpp` |
| 932 | `desktop/native/src/windows/overlay/renderer.cpp` |
| 754 | `src/app/(app)/dashboard/[slug]/(workspace)/people/[personId]/PersonDetailClient.tsx` |
| 576 | `desktop/native/src/windows/overlay/window.cpp` |
| 560 | `src/app/(app)/dashboard/[slug]/(workspace)/people/[personId]/PersonDetailClient.module.css` |
| 546 | `src/components/app-nav/AppNav.tsx` |
| 435 | `src/components/app-nav/AppNav.module.css` |
| 399 | `src/components/landing/LandingPage.module.css` |
| 386 | `services/foundry-api/app/ai.py` |
| 352 | `src/components/onboarding/OnboardingChat.tsx` |
| 328 | `src/components/brief/BriefView.module.css` |
| 301 | `src/lib/db/schema.ts` |
| 285 | `src/components/board/CRMPersonCard.tsx` |
| 279 | `src/components/people/PersonCard.tsx` |
| 267 | `docs/onboarding-spec.md` |
| 256 | `src/components/people/PersonCard.module.css` |
| 242 | `src/components/landing/LandingPage.tsx` |
| 225 | `src/components/onboarding/OnboardingChat.module.css` |
| 223 | `src/components/brief/FoundationView.tsx` |
| 211 | `src/components/project/ProjectChat.tsx` |

Early refactor candidates for later phases:

- `PersonDetailClient.tsx`: many local fetches and interaction handlers in one client component.
- `AppNav.tsx`: project list/edit/delete UI and navigation state in one component.
- `services/foundry-api/app/ai.py`: multiple provider adapters plus task-specific prompt functions in one module.
- Desktop C++ files: large, but audit scope should be confirmed before spending cleanup time there.

## External Services And Network Surfaces

### Clerk

- Middleware/auth: `src/middleware.ts`.
- App provider and auth UI: `src/app/layout.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/signup/page.tsx`, `src/app/desktop-auth/page.tsx`.
- Server auth helpers: `src/lib/backend-auth.ts`, `src/lib/desktop-auth.ts`.
- Webhook: `src/app/api/webhooks/clerk/route.ts` with `svix`.
- Backend auth consumes signed user context in `services/foundry-api/app/auth.py`.

### User Interview FastAPI Backend

- Base URL helper: `src/lib/backend-utils.ts`.
- Server-side fetch wrapper: `src/lib/backend-server.ts`.
- Client proxy fetch wrapper: `src/lib/backend-client.ts`.
- Generic Next proxy: `src/app/api/backend/[...path]/route.ts` and `src/lib/backend-proxy.ts`.
- Bespoke proxy routes also exist for projects, call briefs, outreach, and desktop call briefs.

### Databases

- Next/Drizzle/Neon: `src/lib/db/index.ts`, `scripts/migrate.ts`.
- FastAPI/asyncpg pool: `services/foundry-api/app/db.py`.
- Env keys: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`.

### AI Providers

- Next AI provider layer: `src/lib/ai/provider.ts`, `src/lib/ai/providers/openai.ts`, `src/lib/ai/providers/anthropic.ts`, `src/lib/ai/providers/gemini.ts`.
- FastAPI AI provider layer: `services/foundry-api/app/ai.py`.
- Providers/dependencies: OpenAI, Anthropic, Google Gemini.
- Env keys: `AI_PROVIDER`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_MODEL`, `ANTHROPIC_MODEL`, `GEMINI_MODEL`.

### Firecrawl

- Scrape/crawl helper: `src/lib/firecrawl.ts`.
- Caller: `src/app/api/people/[personId]/crawl/route.ts`.
- Env key: `FIRECRAWL_API_KEY`.

## Frontend Fetch Surfaces

These are the main places Phase 3 should inspect for excessive or duplicate API calls.

| File | Fetch surface |
| --- | --- |
| `src/app/(app)/dashboard/[slug]/(workspace)/people/[personId]/PersonDetailClient.tsx` | Person actions, transcripts, crawl refresh, call brief, outreach. Highest-priority API-call audit target. |
| `src/components/board/CRMPersonCard.tsx` | Call-brief reads/regeneration and stage/action updates per card. |
| `src/app/(app)/dashboard/[slug]/(workspace)/board/BoardPageClient.tsx` | Stage updates. |
| `src/components/people/PersonCard.tsx` | Person creation crawl, bookmark, delete. |
| `src/app/(app)/dashboard/[slug]/(workspace)/people/PeoplePageClient.tsx` | Refetches individual person after card interactions. |
| `src/components/app-nav/AppNav.tsx` | Project list, edit, delete through backend proxy. |
| `src/components/onboarding/OnboardingChat.tsx` | Multiple onboarding chat sends to FastAPI. |
| `src/components/project/ProjectChat.tsx` | Intake chat sends to FastAPI. |
| `src/components/brief/FoundationContext.tsx` | Foundation PATCH to FastAPI. |

## Open Questions For Later Phases

- Should desktop native source be part of the MVP audit, or should Phase 2-4 focus on web + FastAPI only?
- Should the remaining Next and FastAPI AI provider stacks stay separate by design?
- Should bespoke Next API proxy routes be kept next to the generic `/api/backend/[...path]`, or should later cleanup consolidate one direction?
- Should `project_briefs`/brief UI leftovers remain after the FastAPI brief removal work?
