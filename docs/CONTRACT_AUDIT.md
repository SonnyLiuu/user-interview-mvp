# Type And Contract Drift Audit

Phase 8 audit for `wip/pre-audit-baseline`.
Updated on 2026-05-05 after tightening shared contracts.

## Summary

The main cross-stack contracts are now aligned:

- FastAPI project/workspace response models match the TypeScript payload types.
- Onboarding chat now has an explicit FastAPI response model.
- Frontend onboarding slot keys now match backend slot keys.
- Backend error codes are mirrored as constants on the Python and TypeScript sides.
- CRM stage and board-status values now have shared TypeScript constants and runtime validation.

## Fixed In This Phase

### Onboarding Slot Keys

The frontend `SlotKey` union still described an older onboarding model:

- `problem`
- `target_customer`
- `current_alternatives`
- `value_proposition`
- `channels`

The backend sends the current foundation keys:

- `ideaSummary`
- `targetUser`
- `painPoint`
- `valueProp`
- `idealPeopleTypes`
- `differentiation`
- `disqualifiers`

`OnboardingChat.tsx` now uses the backend/current keys, and FastAPI now validates responses with `OnboardingChatResponse`.

### Error Codes

Structured backend error codes are now defined in:

- `services/api/app/error_codes.py`
- `src/lib/error-codes.ts`

Current codes:

| Code | Meaning | Consumers |
| --- | --- | --- |
| `foundation_required` | Project foundation is needed before generation. | Call brief and outreach UI. |
| `generation_failed` | Outreach generation returned no usable body. | Outreach UI. |

This is still mirrored, not generated from one source. That is enough for two codes; Phase 8’s goal was to stop scattered ad hoc strings.

### CRM Status Values

`src/lib/crm.ts` now exports:

- `CRM_STAGE_IDS`
- `BOARD_STATUS_VALUES`
- `BoardStatus`

The stage update API now validates incoming JSON with Zod instead of trusting a TypeScript cast. `updatePersonSchema` also no longer accepts the stale `contacted` board status value.

### Project Payload Types

`ProjectRecord` in `src/lib/backend-types.ts` now matches the Pydantic model more closely. Fields that the backend response model does not expose, such as `user_id`, `created_at`, and `updated_at`, were removed from that type.

## Current Contract Map

| Contract | Python Source | TypeScript Source | Status |
| --- | --- | --- | --- |
| Project nav/latest/workspace payloads | `services/api/app/schemas/projects.py` | `src/lib/backend-types.ts` | Aligned. |
| Foundation view payload | `services/api/app/schemas/workspace.py` | `src/lib/backend-types.ts` | Aligned enough; foundation remains `dict` on Python side. |
| Onboarding chat payload | `services/api/app/schemas/onboarding.py` | `src/components/onboarding/OnboardingChat.tsx` | Aligned. |
| Backend error codes | `services/api/app/error_codes.py` | `src/lib/error-codes.ts` | Mirrored constants. |
| CRM stages/board status | N/A, Next local API only | `src/lib/crm.ts`, `src/lib/validation.ts` | Centralized and runtime-validated. |

## Remaining Watchpoints

- Foundation shape is still typed strongly in TypeScript but only as `dict` in Pydantic. If foundation editing grows, add a Pydantic `Foundation` model.
- Next local API routes return Drizzle rows directly. That is acceptable for internal app routes, but response schemas would help if desktop or external clients grow.
- Onboarding request bodies are still untyped `dict` in FastAPI. Response drift is now guarded; request validation can wait until the request surface stabilizes.
- Error constants are mirrored manually. If codes grow beyond a handful, generate them from a small shared JSON file.
