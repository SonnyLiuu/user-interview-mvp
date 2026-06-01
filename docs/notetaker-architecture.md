# Notetaker Architecture Direction

## Current Shape

The current notetaker is a Windows companion app. It does not join Zoom as a
participant. It starts a live session, renders a visible checklist overlay, and
can stream local mic plus system loopback audio to FastAPI. FastAPI transcribes
those sources, sends source-labeled transcript turns to the checklist matcher,
and returns checklist updates over SSE.

That is useful for local MVP validation, but the core product contract should
not be "capture Windows audio." The core contract should be:

1. Start a live interview session for a person.
2. Feed source-labeled transcript turns into the session.
3. Let the checklist matcher mark covered goals/questions.
4. Save final topics, notes, transcript, and session metadata.

The desktop app, Zoom RTMS, or a Meeting SDK bot should all plug into that same
contract.

## Clean Replacement Target

The cleanest implementation is:

- Keep the visible desktop checklist as the founder control surface.
- Move production transcript capture to Zoom RTMS when possible.
- Use a Meeting SDK participant only if the product truly needs a visible bot in
  the meeting.
- Treat local Windows audio capture as a fallback adapter, not the primary
  production path.

## Shared Backend Boundary

FastAPI owns the live-session state machine and checklist matching. Ingestion
adapters should only submit transcript turns:

```http
POST /v1/desktop/live-sessions/{sessionId}/transcript-turns
Authorization: Bearer {liveToken}
Content-Type: application/json

{
  "source": "rtms",
  "speaker": "Customer",
  "text": "The customer said onboarding takes two hours every Monday."
}
```

The existing local-audio path now feeds the same internal transcript-turn
handler after transcription. A Zoom RTMS adapter can do the same after receiving
Zoom transcript events. A Meeting SDK bot can do the same after receiving its
own transcript or transcription output.

## Responsibilities

Desktop overlay:

- Auth, person selection, visible checklist, manual overrides, end-session save.
- Optional local-audio fallback.
- No Zoom SDK ownership unless a future product decision requires it.

FastAPI live-session service:

- Session lifecycle, transcript turn ingestion, checklist matching, SSE events.
- In-memory state in the MVP; Redis/Postgres-backed state before production.

Next.js app:

- User/project/person authorization.
- Desktop launch token and final save endpoint.
- Installer/download routing.

Zoom RTMS adapter:

- Zoom app authorization and webhook/event verification.
- Meeting-to-person/session mapping.
- Participant-aware transcript normalization.
- Calls the transcript-turn boundary.

Meeting SDK bot adapter:

- Bot launch/join lifecycle and meeting authorization.
- Bot identity, consent, failure handling, and transcript normalization.
- Calls the transcript-turn boundary.

## Production Gaps Before Either Path

- Persist live-session state outside process memory.
- Make end-session save transactional and idempotent by `liveSessionId`.
- Store desktop auth with DPAPI or OS credential storage.
- Publish a signed installer from stable object storage/CDN with checksums.
- Add observability for capture/transcription/checklist latency and failures.
- Add explicit participant consent/disclosure UX for recorded/transcribed calls.
