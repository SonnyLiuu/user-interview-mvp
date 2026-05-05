# AI Cost Audit

Phase 6 audit for `wip/pre-audit-baseline`.
Updated on 2026-05-05 after the first AI cost-control pass.

## Summary

The codebase has two AI surfaces:

- Next.js research analysis: Firecrawl gathers content, then `analyzePerson` sends it to the configured AI provider.
- FastAPI generation: onboarding, intake chat, call prep, and outreach run through `services/foundry-api/app/ai.py`.

This pass made three low-risk cost and reliability improvements:

- Person analysis now caps crawled markdown at 24,000 characters before sending it to the model.
- FastAPI structured JSON calls retry once only when the provider returns invalid JSON or a non-object JSON payload.
- Next.js AI provider models are now configurable through the same `OPENAI_MODEL`, `ANTHROPIC_MODEL`, and `GEMINI_MODEL` env vars already used by FastAPI.

## AI Call Map

| Function | Trigger | Prompt Size | Output | Current Safeguards | Cache Potential | Model Tier |
| --- | --- | --- | --- | --- | --- | --- |
| `analyzePerson` | Person crawl/add-context flow | Large, now capped | JSON/tool object | Provider schema/tooling, 3-minute job timeout | High by `(source_urls, foundation, crawled_content hash)` | Cheap/fast structured model is usually enough. |
| `stream_intake_reply` | Foundation chat message | Medium to large | Streaming text | Streaming UX, provider timeout | Low | Conversational model; quality matters more than strict JSON. |
| `extract_kickoff_idea` | First onboarding answer | Small | JSON | One JSON retry | Low | Cheap/fast structured model. |
| `generate_next_question` | Onboarding next turn | Small to medium | JSON | Choice validation, one regeneration, fallback choices, one JSON retry | Low | Cheap/fast structured model. |
| `extract_custom_slot_answer` | Custom onboarding answer | Small | JSON | One JSON retry | Low | Cheap/fast structured model. |
| `generate_foundation` | Finish onboarding | Medium to large | JSON | One JSON retry | Low | Stronger structured model; this defines project context. |
| `generate_call_brief` | Call brief refresh | Medium | JSON | Fallback brief when normalized content is empty, one JSON retry | Medium by `(person, foundation, analysis hash)` | Cheap/fast structured model is acceptable. |
| `generate_outreach_message` | Outreach refresh | Medium | JSON | Empty-body error branch, one JSON retry | Medium by `(person, foundation, analysis hash)` | Stronger writing model if tone quality matters. |

## Fixed In This Phase

### Person Analysis Token Guard

`src/lib/ai/analyze-person.ts` now truncates crawled content before prompt assembly. This prevents one deep crawl from turning into an unbounded model request. The stored `crawled_content` remains complete; only the model input is capped.

Later improvement: chunk or summarize long crawls instead of taking the first 24,000 characters.

### Structured JSON Retry

`services/foundry-api/app/ai.py` now retries `_generate_json` once when parsing fails because the response is not a JSON object. It does not retry timeouts, missing API keys, provider failures, or other non-format errors.

This is a cost tradeoff in the right place: rare malformed provider responses cost one extra call, but the user avoids manual retries and repeated frontend actions.

### Model Env Alignment

FastAPI already read:

- `OPENAI_MODEL`
- `ANTHROPIC_MODEL`
- `GEMINI_MODEL`

The Next.js provider stack now reads those too. This makes person-analysis cost controllable without code edits.

## Current Cost Risks

### Firecrawl Deep Mode

`crawlUrls(..., "deep")` scrapes each submitted URL and follows up to two relevant outbound links per submitted URL. That is useful, but cost grows with every URL the user adds.

Recommended next step: cache scrape results by normalized URL for a short TTL. That would reduce repeated add-context and retry costs without changing user behavior.

### Regenerate Buttons

Call brief and outreach refreshes always create a new generation. That is correct for an explicit "Regenerate" action, but repeated rapid clicks can burn compute.

Recommended next step: add frontend button cooldowns or backend idempotency windows before adding a persistent generation cache.

### Intake Chat History

Foundation chat sends recent client messages when a foundation exists, and saved conversation when intake is still in progress. This is expected for conversation quality.

Recommended next step: if conversations get long, summarize older turns into a compact running memory instead of sending the full active history.

### Prompt Examples

`generate_outreach_message` includes a full example. This improves style reliability but adds fixed prompt tokens to every outreach generation.

Recommended next step: keep it until quality is stable, then test a shorter rubric-only prompt against real examples.

## Deferred Work

- Per-task model routing: now that model envs are aligned, the next step would be task-specific envs such as `AI_FAST_JSON_MODEL` and `AI_WRITING_MODEL`. Do that only after collecting rough latency/cost numbers.
- Prompt hashing cache: likely useful for person analysis and maybe call prep/outreach, but add it deliberately with invalidation rules.
- Streaming foundation generation: not urgent. It returns structured JSON and happens once per onboarding completion, so reliability is more important than partial UI updates.
- Provider observability: log provider, task name, elapsed time, and approximate input size. Avoid logging raw prompts.
