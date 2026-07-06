# Transcript Ingestion Roadmap

> **North Star**: Desktop audio or user-provided transcript text -> unified
> `transcript_turn` boundary -> checklist matching + saved transcript.

The supported ingestion paths are local desktop audio capture and manual
transcript upload/pasted turns.

---

## Architecture Principle

All transcript input feeds the same ingestion path:

```text
desktop audio transcription or manual transcript text
  -> POST /v1/desktop/live-sessions/{sessionId}/transcript-turns
       or
     _handle_transcript_turn(session, source, text, speaker=..., external_turn_id=...)
  -> LiveTranscriptTurn persisted + SSE emitted + bridge.send_labeled_turn()
```

The checklist bridge only sees `NormalizedTurn` objects, which are
speaker-labeled text lines.

---

## Supported Capture Providers

`capture_provider` is limited to:

- `desktop_audio`: starts local mic + loopback capture and source transcription.
- `manual_upload`: starts a live session without local audio capture; transcript
  turns arrive through upload or paste flows.

Any other value should be rejected by FastAPI.

---

## Manual Transcript Upload

Users can upload `.txt`, `.vtt`, or `.srt` transcript files and map speakers
before ingesting turns.

```http
POST /v1/desktop/live-sessions/{session_id}/transcript-upload
Content-Type: multipart/form-data
  file: <transcript file>
  speakerMap: optional JSON string, e.g. {"Speaker 1": "Founder", "Speaker 2": "Interviewee"}
```

Flow:

1. Accept file and detect format from extension.
2. Parse into speaker-labeled turns.
3. Apply the optional speaker map.
4. Call `_handle_transcript_turn(session, source="manual_upload", ...)` for each
   parsed turn.
5. Return `{ turnsIngested: N, turns: [...] }`.

Acceptance criteria:

- `.txt` files parse with newline splitting.
- `.vtt` files parse with speaker detection.
- `.srt` files parse with basic speaker heuristics.
- Uploaded turns appear in the overlay live through SSE.
- Checklist auto-cross-off works against uploaded turns.
- Uploaded turns are saved with the session transcript.

---

## Desktop Paste Transcript

The desktop app can submit pasted transcript text as individual turns:

```http
POST /v1/desktop/live-sessions/{session_id}/transcript-turns
Authorization: Bearer LIVE_TOKEN
Content-Type: application/json

{
  "source": "manual_upload",
  "speaker": "Speaker",
  "text": "Transcript text"
}
```

This path shares the same persistence, SSE, and checklist matching behavior as
file upload.

---

## Production Gaps

- Persist live-session state outside process memory.
- Make end-session save transactional and idempotent by `liveSessionId`.
- Store desktop auth with OS credential storage.
- Publish signed installers from stable object storage/CDN with checksums.
- Add observability for capture, transcription, checklist latency, and failures.
