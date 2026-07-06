# Notetaker Architecture Direction

## Current Shape

The current notetaker is a Windows companion app. It does not join Zoom as a
participant. It starts a live session, renders a visible checklist overlay, and
can stream local mic plus system loopback audio to FastAPI. FastAPI transcribes
those sources, sends source-labeled transcript turns to the checklist matcher,
and returns checklist updates over SSE.

The core product contract is:

1. Start a live interview session for a person.
2. Feed source-labeled transcript turns into the session.
3. Let the checklist matcher mark covered goals/questions.
4. Save final topics, notes, transcript, and session metadata.

## Clean Replacement Target

The cleanest implementation is:

- Keep the visible desktop checklist as the founder control surface.
- Use local desktop audio capture as the production transcript source for the
  desktop notetaker.
- Keep manual transcript upload/turn ingestion as the fallback path.

## Shared Backend Boundary

FastAPI owns the live-session state machine and checklist matching. Manual
transcript ingestion submits transcript turns through the same boundary used by
local audio after transcription:

```http
POST /v1/desktop/live-sessions/{sessionId}/transcript-turns
Authorization: Bearer {liveToken}
Content-Type: application/json

{
  "source": "external",
  "speaker": "Customer",
  "text": "The customer said onboarding takes two hours every Monday."
}
```

The local-audio path feeds the internal transcript-turn handler after
transcription. Manual upload and pasted transcript turns use the public
transcript-turn boundary.

## Responsibilities

Desktop overlay:

- Auth, person selection, visible checklist, manual overrides, end-session save.
- Local mic and system-loopback audio capture.
- Manual transcript fallback.
- No Zoom SDK ownership unless a future product decision requires it.

FastAPI live-session service:

- Session lifecycle, transcript turn ingestion, checklist matching, SSE events.
- In-memory state in the MVP; Redis/Postgres-backed state before production.

Next.js app:

- User/project/person authorization.
- Desktop launch token and final save endpoint.
- Installer/download routing.

## Production Gaps Before Either Path

- Persist live-session state outside process memory.
- Make end-session save transactional and idempotent by `liveSessionId`.
- Store desktop auth with DPAPI or OS credential storage.
- Publish a signed installer from stable object storage/CDN with checksums.
- Add observability for capture/transcription/checklist latency and failures.
- Add explicit participant consent/disclosure UX for recorded/transcribed calls.
