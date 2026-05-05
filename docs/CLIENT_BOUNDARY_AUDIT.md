# Client Boundary Audit

Phase 4 audit for `wip/pre-audit-baseline`.
Updated on 2026-05-05.

## Summary

The app now has 13 explicit client entrypoints. The remaining boundaries are justified by hooks, browser APIs, Clerk client APIs, drag/drop, editor state, or direct server-component imports.

This phase removed redundant nested boundaries and one pure wrapper component:

- Deleted `ProjectPageClient`; the server page now renders `ProjectChat` directly.
- Removed redundant `'use client'` from nested board components.
- Removed redundant `'use client'` from nested people-card components.
- Removed redundant `'use client'` from the pure `backend-client-utils` helper.

## Remaining Client Entrypoints

| File | Why It Stays Client |
| --- | --- |
| `src/app/(app)/dashboard/[slug]/(workspace)/board/BoardPageClient.tsx` | Drag/drop state and optimistic stage updates. Imported by server board page. |
| `src/app/(app)/dashboard/[slug]/(workspace)/people/[personId]/PersonDetailClient.tsx` | Person action state, clipboard, hash scrolling, generation actions. Imported by server detail page. |
| `src/app/(app)/dashboard/[slug]/(workspace)/people/PeoplePageClient.tsx` | Local sort/filter state, polling, before-unload guard. Imported by server people page. |
| `src/app/(app)/onboarding/[slug]/SetupPageClient.tsx` | Setup stage state and delayed redirect after completion. Imported by server onboarding page. |
| `src/app/(app)/onboarding/OnboardingForm.tsx` | Project creation form state and client navigation. Imported by server onboarding page. |
| `src/app/desktop-auth/page.tsx` | Clerk `useAuth`, browser WebView bridge, and status state. Page itself must be client. |
| `src/components/app-nav/AppNav.tsx` | Project switcher state, modals, localStorage, Clerk client user/signout, pathname. Imported by server workspace layout. |
| `src/components/brief/FoundationContext.tsx` | Editor reducer, autosave timers, undo/redo keyboard handling. Imported by server foundation page. |
| `src/components/brief/FoundationView.tsx` | Editable textareas and context-driven editor controls. Imported by server foundation page. |
| `src/components/landing/HeroTabs.tsx` | Landing-page tab state. Imported by server landing page. |
| `src/components/onboarding/OnboardingChat.tsx` | Chat state, focus/scroll effects, backend sends. Imported by `SetupPageClient`. |
| `src/components/project/ProjectChat.tsx` | Intake chat state and backend sends. Imported by server foundation page. |
| `src/lib/backend-client.ts` | Client-side proxy fetch helper used by client components. |

## Boundaries Removed

| File | Reason |
| --- | --- |
| `src/app/(app)/dashboard/[slug]/(workspace)/foundation/ProjectPageClient.tsx` | Pure wrapper around `ProjectChat`; deleted. |
| `src/components/board/BoardColumn.tsx` | Nested under `BoardPageClient`; not a server import boundary. |
| `src/components/board/CRMPersonCard.tsx` | Nested under `BoardPageClient`; not a server import boundary. |
| `src/components/people/BookmarkButton.tsx` | Nested under client people/detail components. |
| `src/components/people/PersonCard.tsx` | Nested under `PeoplePageClient`. |
| `src/components/people/PersonGrid.tsx` | Nested under `PeoplePageClient`. |
| `src/components/people/UrlInputForm.tsx` | Nested under client people/detail components. |
| `src/lib/backend-client-utils.ts` | Pure path normalization helper. |

## Later Refactor Candidates

- `PersonDetailClient.tsx`: split stage actions, transcripts, call brief, outreach, and context recrawl into local widgets. This will not reduce the top-level client boundary yet, but will make Phase 5/6 audits easier.
- `AppNav.tsx`: split project switcher and profile menu into smaller client widgets. This may eventually allow static nav shell markup to be server-rendered.
- `FoundationView.tsx` and `FoundationContext.tsx`: already justified as client, but can be split by editor sections for maintainability.
- `CRMPersonCard.tsx`: now not a client entrypoint, but it still mixes display, schedule/ineffective actions, and call-brief generation.
