# Desktop Live Session Contract

The Windows and macOS desktop apps share the same server-side AI architecture.
Native clients do not receive OpenAI, Azure, Gemini, or Anthropic credentials.

## Start

Desktop clients start from either a person picker or this web-issued deep link:

```text
foundry://call/start?personId=PERSON_ID&token=LAUNCH_TOKEN&zoomMeetingIdentifier=ZOOM_ID
```

The desktop app posts to the Next.js bridge:

```http
POST /api/desktop/sessions/live/start
Authorization: Bearer DESKTOP_AUTH_TOKEN
Content-Type: application/json

{
  "personId": "PERSON_ID",
  "launchToken": "LAUNCH_TOKEN",
  "captureProvider": "desktop_audio",
  "zoomMeetingIdentifier": "ZOOM_ID"
}
```

The response includes `sessionId`, `liveToken`, `foundryBaseUrl`, topics, and
the active capture provider. Only `desktop_audio` enables local audio streaming.

## Live Updates

Desktop clients subscribe to:

```http
GET {foundryBaseUrl}/v1/desktop/live-sessions/{sessionId}/events?token={liveToken}
```

Clients must handle these event types:

- `session_snapshot`
- `topic_checked`
- `topic_updated`
- `realtime_status`
- `realtime_error`

When SSE disconnects, clients should reconnect with backoff and poll:

```http
GET {foundryBaseUrl}/v1/desktop/live-sessions/{sessionId}
Authorization: Bearer LIVE_TOKEN
```

## Manual Overrides

```http
POST {foundryBaseUrl}/v1/desktop/live-sessions/{sessionId}/topics/{topicId}/override
Authorization: Bearer LIVE_TOKEN
Content-Type: application/json

{ "checked": true }
```

Manual overrides are authoritative for the native UI and prevent later
auto-checks from silently replacing the user choice.

## Transcript Fallback

macOS v1 may upload user-provided transcript files or pasted turns:

```http
POST {foundryBaseUrl}/v1/desktop/live-sessions/{sessionId}/transcript-upload
Authorization: Bearer LIVE_TOKEN
```

or:

```http
POST {foundryBaseUrl}/v1/desktop/live-sessions/{sessionId}/transcript-turns
Authorization: Bearer LIVE_TOKEN
Content-Type: application/json

{
  "source": "manual_upload",
  "speaker": "Speaker",
  "text": "Transcript text"
}
```

## End

Desktop clients first close the FastAPI live session, refresh the snapshot, then
save through Next.js:

```http
POST /api/desktop/sessions/end
Authorization: Bearer DESKTOP_AUTH_TOKEN
Content-Type: application/json

{
  "personId": "PERSON_ID",
  "startedAt": "ISO_DATE",
  "endedAt": "ISO_DATE",
  "liveSessionId": "SESSION_ID",
  "liveToken": "LIVE_TOKEN",
  "topics": [],
  "notesRaw": "",
  "transcriptRaw": ""
}
```
