# DB Schema Audit

Phase 7 audit for `wip/pre-audit-baseline`.
Updated on 2026-05-05 after adding query indexes.

## Summary

The Drizzle schema, hand-written migrations, and live dev Neon database are now aligned for the active query paths.

This pass added:

- `drizzle/0008_query_indexes.sql`
- matching index definitions in `src/lib/db/schema.ts`
- an `outreach_one_current_per_person` partial unique index, matching the current-row pattern already used by `call_prep`
- query-shape indexes for project nav, people lists, foundation lookup, onboarding messages, transcripts, and person events

`npm run db:migrate` applied the migration successfully to the dev Neon database, and a read-only index check verified all new indexes exist.

## Migration State

Current migration sequence:

| Migration | Purpose |
| --- | --- |
| `0000_redundant_gauntlet.sql` | Initial tables and foreign keys. |
| `0001_right_annihilus.sql` | Clerk user id. |
| `0002_cheerful_mauler.sql` | Onboarding/foundation tables, project slug, intake conversation. |
| `0003_people_ttl_depth.sql` | People relevance/depth/TTL fields. |
| `0004_crm_tables.sql` | CRM outcome/contact fields, transcripts, person events. |
| `0005_call_prep.sql` | JSON `call_prep.content` backfill. |
| `0006_current_row_guards.sql` | Current-row cleanup and unique guards for call prep/project briefs. |
| `0007_drop_outreach_channel.sql` | Drop dead outreach channel column. |
| `0008_query_indexes.sql` | Current-row guard for outreach and query indexes. |

The repo still uses SQL-only migrations after `0002`; no new Drizzle snapshots were generated. That is consistent with the existing project pattern, but it should be a deliberate team convention.

## Indexes Added

| Index | Query Shape Covered |
| --- | --- |
| `outreach_one_current_per_person` | Current outreach lookup/replacement by `person_id`. |
| `projects_active_user_created_at_idx` | Project nav/latest-project queries by user and active status. |
| `projects_active_user_slug_idx` | Project lookup and duplicate prevention for active user slugs. |
| `people_project_created_at_idx` | People page list by project ordered by creation time. |
| `people_project_updated_at_idx` | Board/desktop people list by project ordered by update time. |
| `project_foundations_project_generated_at_idx` | Latest foundation lookup by project. |
| `onboarding_messages_session_created_at_idx` | Onboarding transcript load by session ordered by creation time. |
| `transcripts_person_created_at_idx` | Person transcripts by person ordered by creation time. |
| `person_events_person_created_at_idx` | Person event history by person ordered by creation time. |

## Schema Notes

Good:

- Current-row tables now have explicit guards for `call_prep`, `project_briefs`, and `outreach`.
- One-row-per-project tables use unique constraints: `project_intake`, `onboarding_sessions`, and `onboarding_state`.
- FastAPI upserts added in Phase 5 are backed by those unique constraints.
- Foreign keys exist for the active ownership graph.

Watchpoints:

- `projects_active_user_slug_idx` will surface duplicate active slugs if they ever exist. That is a good invariant, but production migration should be run after a duplicate check.
- `project_briefs`, `debriefs`, `interactions`, and `insights` are still mostly legacy/future surfaces. Keep them until product direction is clear; do not spend index/refactor time there yet.
- Timestamp indexes were created ascending. Postgres can scan btree indexes backward for `ORDER BY ... DESC`, so separate descending indexes are unnecessary right now.

## Live DB Verification

Verified against dev Neon after `npm run db:migrate`:

- all new indexes from `0008` exist
- migration table accepted `0008`
- prior Phase 0 fresh-migration check had already verified `0000` through `0007`

Not done in this pass:

- no fresh destructive reset after `0008`
- no meaningful `EXPLAIN ANALYZE`, because the dev database does not have production-shaped row counts

## Later Work

- Run a duplicate active-slug check before applying `0008` to any non-disposable database:
  `select user_id, slug, count(*) from projects where is_archived = false and slug is not null group by user_id, slug having count(*) > 1;`
- Re-run `EXPLAIN ANALYZE` once there are hundreds or thousands of people/transcripts/messages.
- Decide whether to regenerate Drizzle snapshots after `0008` or formalize SQL-only migrations in a short `docs/MIGRATIONS.md`.
