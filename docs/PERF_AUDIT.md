# Build And Performance Audit

Phase 9 audit for `wip/pre-audit-baseline`.
Updated on 2026-05-05.

## Summary

This pass did not run `npm run build` from the agent shell because that command has stalled in this environment while completing quickly in the user's local PowerShell. Instead, it inspected the existing `.next` build artifact, source imports, route manifests, images, CSS sizes, and client boundaries.

Current performance posture is healthy for the MVP:

- no route-specific app chunk is large enough to justify urgent code splitting
- no raw `<img>` tags were found
- the main remaining client bundle weight is structural: Clerk and the workspace `AppNav`
- API fan-out and client-boundary work from Phases 3 and 4 already removed the bigger avoidable costs

## Existing Build Artifact Snapshot

From `.next/app-build-manifest.json` and emitted `.next/static/chunks` files:

| Route | Approx Total KB | Route/CSS KB | Notes |
| --- | ---: | ---: | --- |
| `/dashboard/[slug]/(workspace)/layout` | 490.8 | 22.9 | Shared workspace layout, includes AppNav/Clerk chunks. |
| `/dashboard/[slug]/board` | 412.4 | 15.4 | Includes dnd-kit chunks; expected for drag/drop. |
| `/dashboard/[slug]/people/[personId]` | 402.4 | 52.5 | Largest route-owned chunk; `PersonDetailClient` remains the main split candidate. |
| `/dashboard/[slug]/people` | 391.9 | 42.1 | People page + card UI. |
| `/` | 367.6 | 17.7 | Landing route is modest. |
| `/dashboard/[slug]/foundation` | 365.2 | 23.7 | Foundation editor/chat. |
| `/onboarding/[slug]` | 358.6 | 17.1 | Onboarding chat. |
| `/onboarding` | 345.1 | 3.6 | Project creation form. |

The biggest emitted chunks are shared framework/runtime chunks, not individual app routes:

- `framework-*.js`: 185 KB
- shared app chunks: 169 KB and 168.5 KB
- `main-*.js`: 118.9 KB
- `polyfills-*.js`: 110 KB
- Clerk-related shared chunk: 104.4 KB

These are not unexpected for a Next + React + Clerk app.

## Source Findings

### Images

No raw `<img>` tags were found under `src`. `AppNav` uses `next/image` for Clerk/user images, and `next.config.ts` allows the current Clerk/Google remote image hosts.

### Client Boundaries

The remaining client boundaries are the same ones justified in Phase 4. The largest maintenance and bundle candidates are still:

- `src/app/(app)/dashboard/[slug]/(workspace)/people/[personId]/PersonDetailClient.tsx`
- `src/components/app-nav/AppNav.tsx`
- `src/components/onboarding/OnboardingChat.tsx`
- `src/components/board/CRMPersonCard.tsx`

Splitting these would improve maintainability first and bundle size second. None need emergency splitting based on current emitted chunk sizes.

### CSS

Largest CSS modules:

| File | Size |
| --- | ---: |
| `PersonDetailClient.module.css` | 13.3 KB |
| `AppNav.module.css` | 10.8 KB |
| `LandingPage.module.css` | 10.6 KB |
| `PersonCard.module.css` | 6.2 KB |
| `BriefView.module.css` | 6.2 KB |
| `OnboardingChat.module.css` | 5.8 KB |

This is acceptable. The CSS refactor target should follow component splits, not precede them.

### Middleware

`src/middleware.ts` is simple and excludes `_next` assets plus static file extensions. It protects app/API routes through Clerk and leaves login/signup/desktop/webhook paths public. No middleware refactor is needed now.

## Recommendations

Near-term:

- Have the user run `npm run build` locally after this phase and compare the output against this baseline.
- Keep the existing route-level split; no route chunk currently demands dynamic imports.
- Do not add a bundle analyzer dependency yet. The route-owned chunks are small enough that the simpler manifest audit is sufficient.

Later:

- Split `PersonDetailClient` into smaller widgets: stage/actions, context recrawl, transcripts, call brief, outreach.
- Split `AppNav` into project switcher, profile menu, and nav shell if the workspace layout chunk becomes a pain.
- Add Web Vitals/Lighthouse only when there is a deployed or locally served representative dataset.
- Revisit dnd-kit only if board route size grows; it is correctly isolated to the board route today.

## Verification

Run locally after pulling this branch:

```powershell
npm run typecheck
npm run build
```

The agent verified source-level checks but intentionally skipped a fresh build in its shell because of prior local runner stalls.
