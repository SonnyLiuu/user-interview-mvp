# Transcript Provider Roadmap

> **North Star**: Any transcript source → unified `transcript_turn` boundary →
> checklist matching + saved transcript. The desktop audio capture is one provider;
> uploaded files, meeting bots, and webhook integrations are peers.

---

## Architecture Principle

All providers feed the same ingestion path:

```
Provider → transcript text + speaker label + optional external_turn_id
         → POST /v1/desktop/live-sessions/{sessionId}/transcript-turns
              or
           _handle_transcript_turn(session, source, text, speaker=..., external_turn_id=...)
         → LiveTranscriptTurn persisted + SSE emitted + bridge.send_labeled_turn()
```

No provider touches the AI checklist bridge directly. The bridge only sees
`NormalizedTurn` objects, which are speaker-labeled text lines.

---

## Phase 0 — Foundation (current sprint, solidify before Phase 1)

### 0.1 Expand `capture_provider` enum

**Current**: `"zoom_rtms"` | `"desktop_audio"` — validated in `_capture_provider()`.

**Change**: Accept additional values through the system without rejecting them.

```
services/api/app/services/live_sessions.py
  _capture_provider() — add: "manual_upload", "recall_ai", "fireflies", "otter"
  _speaker_for_source()  — add mappings for new source labels
```

**DB**: `capture_provider` is already `TEXT` (no enum constraint), so no migration needed.

### 0.2 Decouple `audio_capture_enabled` from `capture_provider`

**Current**: `audio_capture_enabled = (capture_provider == "desktop_audio")`.

**Problem**: This boolean controls whether the `SourceTranscriptionBridge` starts.
A session with `capture_provider = "recall_ai"` should NOT start local audio capture.

**Change**: Make `audio_capture_enabled` an explicit parameter on session start,
defaulting to `True` only for `"desktop_audio"`. Other providers get `False`.

### 0.3 Add `provider_metadata` JSONB column (optional, for Phase 2+)

A single `metadata` JSONB column already exists on `live_call_sessions`. Providers
can store provider-specific state there (Recall bot ID, Fireflies meeting URL, etc.).
No schema change needed — just document the convention:

```json
{
  "provider": "recall_ai",
  "recall": { "botId": "bot_abc123", "meetingUrl": "https://..." },
  "fireflies": { "meetingId": "ff_xyz", "webhookSecret": "..." }
}
```

---

## Phase 1 — Manual Transcript Upload (.txt, .vtt, .srt)

**Goal**: User pastes or uploads a transcript file into the web app (or overlay),
it's parsed into labeled turns, and the checklist matches against it.

### 1.1 File parsing library (FastAPI)

Add parsing for three formats:

| Format | Parser | Complexity |
|--------|--------|------------|
| `.txt` | Split on newlines, infer speaker from `Name:` prefix or treat as raw | Trivial |
| `.vtt` | Parse WebVTT timestamps + cue text, speaker from `<v Name>` tags or cues | Medium |
| `.srt` | Parse SRT index + timestamps + text blocks, speaker heuristics | Medium |

**Library**: `webvtt-py` (pure Python, well-maintained) handles both `.vtt` and `.srt`.

```
services/api/app/services/transcript_parser.py   ← new file
```

Exports a single function:

```python
async def parse_transcript_file(
    content: str | bytes,
    filename: str,          # used to detect format via extension
) -> list[ParsedTurn]:      # [{speaker, text, start_ms, end_ms}]
```

### 1.2 Upload endpoint

```
POST /v1/desktop/live-sessions/{session_id}/transcript-upload
Content-Type: multipart/form-data
  file: <transcript file>
  speaker_map: optional JSON string, e.g. {"Speaker 1": "Founder", "Speaker 2": "Interviewee"}
```

**Flow**:
1. Accept file, detect format from extension
2. Parse into `ParsedTurn` list
3. Apply speaker map
4. For each turn: call `_handle_transcript_turn(session, source="manual_upload", ...)`
5. Return `{ turnsIngested: N, turns: [...] }`

### 1.3 Web app upload UI (Next.js)

- Add an "Upload transcript" button in the session detail / end-call view
- Drag-and-drop zone accepting `.txt`, `.vtt`, `.srt`
- Preview parsed turns before confirming ingestion
- Show speaker mapping UI if names differ from Founder/Interviewee

### 1.4 Overlay "paste transcript" (desktop C++)

- Add a "Paste transcript" menu item or button in the overlay
- Opens a text area where user can paste raw transcript text
- POSTs to the same `/transcript-upload` endpoint as plain text
- This is the quickest path for ad-hoc use

**Acceptance criteria**:
- [ ] `.txt` files parse with newline splitting
- [ ] `.vtt` files parse with speaker detection
- [ ] `.srt` files parse with basic speaker heuristics
- [ ] Uploaded turns appear in the overlay live (SSE)
- [ ] Checklist auto-cross-off works against uploaded turns
- [ ] Uploaded turns are saved with the session transcript

---

## Phase 2 — Recall.ai Bot Provider

**Goal**: User starts a session, a Recall.ai bot joins the meeting, and real-time
transcript turns stream into the checklist automatically.

### 2.1 Recall.ai integration (FastAPI)

Recall.ai provides:
- REST API to create/control bots
- Webhook callbacks for `bot.status_change`, `transcript.data`, etc.
- Real-time transcript via WebSocket (optional)

**New file**: `services/api/app/services/recall_provider.py`

```python
class RecallProvider:
    async def create_bot(self, meeting_url: str, session_id: str) -> str: ...
    async def stop_bot(self, bot_id: str) -> None: ...
    async def handle_webhook(self, payload: dict) -> None: ...
```

**Webhook endpoint**:
```
POST /v1/recall/webhook
```
Handles:
- `bot.status_change` → update session metadata, set realtime status
- `transcript.data` → parse Recall's transcript format into turns, call `_handle_transcript_turn()`

### 2.2 Session creation flow

```
Web app → "Start with Recall.ai"
  → POST /api/desktop/sessions/live/start  { capture_provider: "recall_ai", meeting_url: "..." }
  → FastAPI starts session, creates Recall bot
  → Returns sessionId + bot join status
  → Recall webhooks stream transcript turns as they arrive
```

### 2.3 Recall.ai config & secrets

```env
# services/api/.env.local
RECALL_API_KEY=rk_...
RECALL_REGION=us-west-2     # or eu-central-1
RECALL_WEBHOOK_SECRET=whsec_...   # for verifying webhook signatures
```

### 2.4 Web app UI

- "Meeting URL" input field when selecting Recall provider
- Bot status indicator (joining → in meeting → recording)
- "Stop bot" button in overlay

**Acceptance criteria**:
- [ ] Recall bot joins a Google Meet / Zoom meeting when session starts
- [ ] Transcript turns stream in real-time via webhooks
- [ ] Speaker labels map correctly (Recall provides per-participant transcripts)
- [ ] Bot stops when session ends
- [ ] Fallback: if webhook is delayed, turns still arrive when they do

---

## Phase 3 — Fireflies.ai Import & Webhook

**Goal**: User records a call with Fireflies, then imports the transcript. Or
Fireflies webhook pushes transcripts automatically.

### 3.1 Fireflies import (pull-based)

User pastes a Fireflies meeting URL or uploads a Fireflies export.

```
POST /v1/desktop/live-sessions/{session_id}/fireflies-import
Body: { "meetingUrl": "https://app.fireflies.ai/view/..." }
```

**Flow**:
1. FastAPI calls Fireflies API to fetch transcript
2. Parse Fireflies' JSON transcript format → turns
3. Ingest via `_handle_transcript_turn()`

### 3.2 Fireflies webhook (push-based)

```
POST /v1/fireflies/webhook
```

Fireflies can POST transcripts when a meeting completes. Parse + ingest.

### 3.3 Fireflies config

```env
FIREFLIES_API_KEY=ff_...
FIREFLIES_WEBHOOK_SECRET=...
```

**Acceptance criteria**:
- [ ] Paste a Fireflies meeting URL → transcript imports
- [ ] Fireflies webhook → auto-import on meeting complete
- [ ] Speaker labels preserved from Fireflies data

---

## Phase 4 — Otter.ai (on request only)

Same pattern as Fireflies: import URL + optional webhook. Only build if users
specifically need it — Fireflies + Recall cover 90%+ of use cases.

---

## Session Lifecycle with Multiple Providers

```
┌──────────────┐
│  Web App     │  "Start call" → picks provider
└──────┬───────┘
       │ POST /api/desktop/sessions/live/start
       │ { capture_provider: "recall_ai" | "desktop_audio" | "manual_upload" | ... }
       ▼
┌──────────────┐
│  FastAPI     │  Creates session, sets capture_provider
│              │  If desktop_audio → starts SourceTranscriptionBridge
│              │  If recall_ai    → creates Recall bot
│              │  If manual_upload → waits for file upload
│              │  All paths → starts checklist bridge (RealtimeBridge or RestChecklistBridge)
└──────┬───────┘
       │ SSE /events stream
       ▼
┌──────────────┐
│  Overlay     │  Receives transcript_turn events in real-time
│  (C++)       │  Receives topic_checked events
│              │  Shows provider status
└──────────────┘
```

---

## DB Migration Summary

| Phase | Migration needed? | Details |
|-------|-------------------|---------|
| 0.1 | No | `capture_provider` is TEXT, no enum constraint |
| 0.2 | No | Logic-only change |
| 0.3 | No | `metadata` JSONB already exists |
| 1 | No | Transcript turns already support any source |
| 2 | No | Recall state goes in `metadata` JSONB |
| 3 | No | Fireflies state goes in `metadata` JSONB |

**No new DB columns needed through Phase 3.** The existing schema was designed
with provider flexibility in mind.

---

## File Changes by Phase

### Phase 0 (Foundation)
| File | Change |
|------|--------|
| `services/api/app/services/live_sessions.py` | Expand `_capture_provider()` enum, decouple `audio_capture_enabled` |
| `services/api/app/services/live_sessions.py` | Add source→speaker mappings in `_speaker_for_source()` |

### Phase 1 (Manual Upload)
| File | Change |
|------|--------|
| `services/api/app/services/transcript_parser.py` | **New** — parse .txt, .vtt, .srt |
| `services/api/app/routers/live_sessions.py` | Add `POST .../transcript-upload` route |
| `services/api/app/schemas/live_sessions.py` | Add upload request/response schemas |
| `requirements.txt` | Add `webvtt-py` |
| `src/app/(app)/...` | Upload UI component |
| `desktop/native/src/...` | Paste transcript dialog / menu item |

### Phase 2 (Recall.ai)
| File | Change |
|------|--------|
| `services/api/app/services/recall_provider.py` | **New** — Recall API client |
| `services/api/app/routers/recall.py` | **New** — webhook endpoint |
| `services/api/app/routers/live_sessions.py` | Add Recall provider to session start |
| `services/api/.env.local` | Add `RECALL_API_KEY`, etc. |
| `src/app/(app)/...` | Meeting URL input, bot status UI |
| `docs/` | Recall setup guide |

### Phase 3 (Fireflies)
| File | Change |
|------|--------|
| `services/api/app/services/fireflies_provider.py` | **New** — Fireflies API client |
| `services/api/app/routers/fireflies.py` | **New** — import + webhook endpoints |
| `services/api/.env.local` | Add `FIREFLIES_API_KEY` |
| `src/app/(app)/...` | Fireflies import UI |
| `docs/` | Fireflies setup guide |

---

## Risks & Gotchas

1. **Recall.ai pricing**: Per-minute bot usage. Make this clear in UI before starting.
2. **Fireflies API rate limits**: Free tier may have tight limits. Cache transcripts.
3. **Speaker mapping**: Every provider names speakers differently. The speaker map
   step in Phase 1 should be reusable across all providers.
4. **In-memory sessions**: FastAPI restart kills active sessions. All providers
   need a "reconnect" path — for Phase 0, document this; for later, persist bridge
   state to DB.
5. **VTT/SRT timestamp alignment**: Uploaded files may have timestamps from a
   different clock. Timestamps are informational only; the checklist bridge doesn't
   use them for matching.
