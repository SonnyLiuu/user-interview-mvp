# Backend Endpoint Audit

Phase 5 audit for `wip/pre-audit-baseline`.
Updated on 2026-05-05 after the first backend optimization pass.

## Summary

The FastAPI backend is small and predictable: route handlers delegate to services, services acquire short-lived database connections, and repositories hold the SQL. The main health finding is good: no paid AI call is made while a database connection is held.

This pass made four low-risk optimizations:

- `project_intake` conversation saves now use one `INSERT ... ON CONFLICT DO UPDATE` instead of SELECT-then-write.
- `onboarding_state` saves now use one `INSERT ... ON CONFLICT DO UPDATE` instead of SELECT-then-write.
- Foundation autosave skips the write when the JSON payload is unchanged.
- Project nav lists now return only `id`, `name`, and `slug`, matching the frontend contract.

## Shared Request Cost

Every authenticated FastAPI endpoint has common overhead before its service runs:

| Layer | Work |
| --- | --- |
| Next.js caller | `getBackendAccessToken()` calls Clerk `auth()` and `currentUser()` for each backend call. |
| FastAPI auth | Verifies the signed token, then resolves the local user. Usually 1 query by `clerk_user_id`; first-time or migrated users can take 2-3 queries. |

This is acceptable for the current request volume. If backend traffic grows, the first shared optimization should be a short request-local/session token path that includes the local `users.id`, not per-endpoint micro-optimization.

## Endpoint Cost Map

Query counts below exclude the shared auth cost.

| Endpoint | Queries / Writes | AI Calls | Notes |
| --- | ---: | ---: | --- |
| `GET /healthz` | 0 | 0 | Public health check. |
| `GET /v1/dashboard/latest-project` | 1 | 0 | Lightweight latest-project lookup. |
| `GET /v1/projects` | 1 | 0 | Now returns nav fields only. |
| `POST /v1/projects` | 3 | 0 | Duplicate slug check, project insert, empty intake insert in one transaction. |
| `GET /v1/projects/{project_id}` | 1 | 0 | Ownership-scoped lookup. |
| `PATCH/PUT /v1/projects/{project_id}` | 2 | 0 | Ownership lookup, then update. Could become one ownership-scoped update later. |
| `DELETE /v1/projects/{project_id}` | 2 | 0 | Ownership lookup, then delete. Could become one ownership-scoped delete later. |
| `GET /v1/projects/by-slug/{slug_or_id}` | 2-3 | 0 | Slug lookup may fall back to id lookup, then foundation existence check. |
| `GET /v1/projects/{project_id}/workspace-summary` | 2 | 0 | Current project plus project nav list. |
| `GET /v1/projects/{project_id}/foundation-view` | 3 | 0 | Project, latest foundation, and intake conversation. |
| `PATCH /v1/projects/{project_id}/foundation` | 2 | 0 | Ownership lookup plus no-op-aware foundation update. |
| `GET /v1/projects/{project_id}/intake` | 2-3 | 0 | Project lookup plus intake get/create. |
| `POST /v1/projects/{project_id}/intake/chat` | 3, plus 1 write after streaming when no foundation exists | 1 streaming | Connection released before streaming. |
| `POST /v1/projects/{project_id}/onboarding/chat` | 4-5 base, plus branch-specific writes | 0-2 | Base context loads project, session, state, and messages. AI generation happens outside DB connections. |
| `GET /v1/people/{person_id}/call-brief` | 2 | 0 | Owned person plus current call prep. |
| `POST /v1/people/{person_id}/call-brief/refresh` | 2 reads, then 3 write statements | 1 | Reads person/foundation, releases connection, calls AI, then advisory-lock replace. |
| `POST /v1/people/{person_id}/outreach/refresh` | 2 reads, then 3 write statements | 1 | Same connection shape as call prep. |

## Connection Hygiene

Good patterns:

- `call_prep.refresh_call_brief` and `outreach.refresh_outreach` release the read connection before calling AI, then reacquire for the current-row replacement.
- `intake.stream_chat` releases its read connection before streaming AI tokens.
- `onboarding.process_onboarding_request` performs AI extraction/generation outside transaction blocks, then persists the result.
- Current-row replacement uses advisory locks plus partial unique indexes for `call_prep` and `outreach`.

Remaining watchpoint:

- `onboarding.chat` intentionally performs several small writes per turn. That is fine for now, but this is the most branchy backend service and should be the first one to get integration tests.

## Response Shape

Fixed in this pass:

- `GET /v1/projects` no longer returns full project rows when the frontend only needs project nav items.

Still acceptable:

- `workspace-summary` returns one full current project plus nav-sized project list.
- `foundation-view` returns the intake conversation because `ProjectChat` needs it for context.
- Call brief and outreach return only the current generated row fields used by the UI.

Later cleanup:

- Add explicit Pydantic response models to `POST/PATCH/DELETE /v1/projects` and the people generation endpoints. The current shapes are stable in practice, but explicit models would make Phase 8 contract drift easier.

## Error Codes

Backend structured codes currently raised:

| Code | Backend Source | Frontend Consumer |
| --- | --- | --- |
| `foundation_required` | `call_prep.refresh_call_brief`, `outreach.refresh_outreach` | `PersonDetailClient`, `CRMPersonCard` |
| `generation_failed` | `outreach.refresh_outreach` | `PersonDetailClient` |

Generic `BadRequestError` messages are used for form/control errors in projects and onboarding. That is fine because the current UI treats those as generic failures.

Phase 8 should promote these strings to shared enums or mirrored constants once the error surface grows beyond these two codes.

## Deferred To Later Phases

- DB indexes belong in Phase 7. The code commonly filters by `projects.user_id`, `projects.slug`, `people.project_id`, `project_foundations.project_id`, and current-row predicates; verify with `EXPLAIN` before adding indexes.
- AI prompt size, retries, caching, and model selection belong in Phase 6.
- The duplicate `_person_payload` helper in call prep/outreach is still below the abstraction threshold. Keep it local unless a third consumer appears.
