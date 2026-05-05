# Frontend Data Flow Audit

Phase 3 audit for `wip/pre-audit-baseline`.
Updated on 2026-05-05 after the first optimization pass.

## Summary

The app is mostly event-driven, not poll-heavy. The main avoidable API calls were concentrated in people/board views:

- Person detail loaded server-known data again on mount.
- Board cards checked call-brief status once per scheduled card on mount.
- People page polled in-progress research with one request per person every 3 seconds.
- Add-context flow patched the same person twice before starting a crawl.

Those items are fixed in this pass.

## Data Contracts By Route

| Route | Server-Fetched Data | Client Fetches |
| --- | --- | --- |
| `/dashboard` | Latest project through FastAPI `/v1/dashboard/latest-project`. | None. |
| `/onboarding` | Project nav list through FastAPI `/v1/projects`. | Create project on submit. |
| `/onboarding/[slug]` | Project lookup through FastAPI `/v1/projects/by-slug/{slug}`. | Setup flow starts onboarding chat. |
| `/dashboard/[slug]/foundation` | Project lookup + foundation view through FastAPI. | Autosave PATCH to `/v1/projects/{id}/foundation`; intake chat sends. |
| `/dashboard/[slug]/people` | Project lookup through FastAPI; people loaded directly from Drizzle. | Create/crawl people on interaction; batch poll in-progress people with `GET /api/people?ids=...`. |
| `/dashboard/[slug]/people/[personId]` | Project lookup; person, current outreach, current call brief, and transcripts loaded directly from Drizzle. | Stage actions, bookmark, add transcript, add context crawl, outreach/call-brief generation on interaction. |
| `/dashboard/[slug]/board` | Project lookup; people and current call-brief existence loaded directly from Drizzle. | Stage updates, schedule/ineffective actions, call-brief generation on interaction. |
| `/dashboard/[slug]/insights` | Static placeholder. | None. |
| `/desktop-auth` | Clerk auth page. | Auth state effect only. |

All project workspace routes also render `AppNav`, which receives the project nav list from `getWorkspaceSummary(project.id)` in the workspace layout.

## Fixed In This Phase

### Person Detail Mount Fetches

Before:

- `TranscriptSection` fetched `GET /api/people/{personId}/transcripts` on mount.
- `CallBriefSection` fetched `GET /api/people/{personId}/call-brief` on mount.

After:

- `page.tsx` loads `transcripts` and current `call_prep` with the person.
- `PersonDetailClient` hydrates those sections from props.

Impact: opening a person detail page removes 2 client API calls.

### Board Scheduled Card Fan-Out

Before:

- Each scheduled `CRMPersonCard` fetched `GET /api/people/{personId}/call-brief` on mount.

After:

- Board page queries current `call_prep` rows once for all visible people.
- Cards receive `initialHasBrief`.

Impact: opening a board with N scheduled people removes N client API calls.

### People Polling

Before:

- The people page polled each in-progress person individually every 3 seconds.

After:

- `GET /api/people?ids=...` returns all requested owned people in one response.
- The poller updates all in-progress people from that single response.

Impact: batch research polling drops from N requests per interval to 1 request per interval.

### Add Context

Before:

- Adding context sent one PATCH for `additional_context`, another PATCH for `source_urls`, then a crawl request.

After:

- The flow sends one PATCH with both fields, then the crawl request.

Impact: one fewer write per add-context operation.

## Remaining Watchpoints

### AppNav Project Refresh

`AppNav` is currently fine for workspace pages because it receives `initialProjects` from the server layout. It still has a fallback `loadProjects()` when no initial list exists. Keep the fallback, but avoid adding more routes that mount `AppNav` without server data.

### Foundation Autosave

`FoundationContext` autosaves after edits through `PATCH /v1/projects/{id}/foundation`. This is expected, but Phase 5 should check whether the backend writes even when the normalized payload did not materially change.

### Onboarding And Intake Chat

`OnboardingChat` and `ProjectChat` make one backend call per user action, which is expected. The audit risk is not request count; it is repeated AI computation if the user resubmits the same content. That belongs in Phase 6.

### Person Creation

Creating a person intentionally uses two requests: create local row, then start crawl. This is defensible because it gives the UI an immediate row to poll. A later backend/API consolidation could offer `POST /api/people/research` if this becomes hard to reason about.

### Detail Re-Crawl Polling

The add-context flow still polls one person directly after starting a crawl. That is acceptable because the detail page only tracks one person. If detail pages later support multi-source batch work, reuse the batch `GET /api/people?ids=...` path.

## Next Phase Inputs

Phase 4 should start with these client boundaries:

- `PersonDetailClient.tsx`: still a large client component; likely split into smaller interactive widgets.
- `CRMPersonCard.tsx`: now free of mount fetches, but still mixes display and stage actions.
- `AppNav.tsx`: many local effects and modal states in one client component.
- `FoundationContext.tsx`: client boundary is justified by editor state and autosave.
