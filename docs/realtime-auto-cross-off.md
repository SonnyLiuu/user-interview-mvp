# Realtime Auto-Cross-Off

The desktop notepad can auto-check call-brief goals and questions while a live
Zoom/Meet call is in progress. This is a V1 server-side OpenAI Realtime
integration: the desktop app never receives an OpenAI API key.

## Runtime Flow

1. Native starts a session by POSTing to
   `/api/desktop/sessions/live/start` on the Next app.
2. Next authenticates the desktop user, signs a backend token, and forwards to
   FastAPI `/v1/desktop/live-sessions`.
3. FastAPI loads the current call prep, converts goals/questions/signals into
   live topics, starts `RealtimeBridge`, and returns:
   - `sessionId`
   - `liveToken`
   - `foundryBaseUrl`
   - initial `topics`
4. Native opens:
   - SSE: `/v1/desktop/live-sessions/{sessionId}/events`
   - audio WebSocket: `/v1/desktop/live-sessions/{sessionId}/audio`
5. Native captures Windows default output audio plus default communications mic,
   converts chunks to 24 kHz mono PCM, tags each chunk as `loopback` or `mic`,
   and streams binary chunks to FastAPI.
6. FastAPI routes `mic` audio into a Founder transcription stream and `loopback`
   audio into an Interviewee transcription stream. Legacy `mixed` audio is
   accepted for compatibility but is not used for source-labeled matching.
7. Completed source transcripts are stored as live transcript turns and sent to
   the checklist Realtime session as text items like `Founder: ...` and
   `Interviewee: ...`.
8. The checklist Realtime session has `mark_item_covered` and
   `mark_items_covered` tools. When the model sees clear labeled evidence that
   one or more listed goals/questions were covered, FastAPI marks each accepted
   topic as checked and emits a `topic_checked` SSE event per topic.
8. Native applies the event to the overlay. The row gets a checkmark and
   strikethrough.

## Required OpenAI Setup

Set these in `services/foundry-api/.env.local`:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=...
CHECKLIST_AI_PROVIDER=openai
OPENAI_REALTIME_API_KEY=sk-...
OPENAI_REALTIME_MODEL=gpt-realtime
```

`AI_PROVIDER` is for the general onboarding/session-advisor AI flows and can be
`gemini`, `anthropic`, or `openai`. `CHECKLIST_AI_PROVIDER` is separate. Use
`openai` for public OpenAI Realtime matching, `azure` for Azure OpenAI
Realtime, or `mock` for local no-key smoke tests.

`OPENAI_REALTIME_API_KEY` is optional if `OPENAI_API_KEY` is already set; the
Realtime bridge will fall back to `OPENAI_API_KEY`. The OpenAI key must stay on
FastAPI. The native app uses Foundry's `liveToken`, not an OpenAI credential.

For Azure OpenAI / Azure AI Foundry realtime, set these instead:

```env
CHECKLIST_AI_PROVIDER=azure
AZURE_OPENAI_REALTIME_ENDPOINT=https://YOUR_RESOURCE.openai.azure.com/openai/v1
AZURE_OPENAI_REALTIME_API_KEY=YOUR_AZURE_OPENAI_KEY
AZURE_OPENAI_REALTIME_DEPLOYMENT=gpt-realtime-1.5
AZURE_OPENAI_TRANSCRIPTION_DEPLOYMENT=
```

Use the Azure OpenAI endpoint ending in `openai.azure.com`, not the project
endpoint ending in `services.ai.azure.com/api/projects/...`. The deployment
value is the deployment name you chose in Azure AI Foundry; it may be the same
as the model name, but it does not have to be. If
`AZURE_OPENAI_TRANSCRIPTION_DEPLOYMENT` is set, source transcription uses that
Azure deployment for `input_audio_transcription`. If it is blank, source
transcription uses Azure's `whisper-1` input transcription model on the realtime
connection.

## No-Key Smoke Test

Set this in `services/foundry-api/.env.local`:

```env
CHECKLIST_AI_PROVIDER=mock
```

With mock mode, FastAPI does not connect to OpenAI and no OpenAI key is needed.
Every received live audio chunk marks the next unchecked goal/question with mock
evidence. This validates the native audio WebSocket, FastAPI live-session state,
SSE event stream, and overlay strikethrough behavior. It does not validate
Realtime transcription or semantic matching quality.

## What Is Hooked Up

- Live session creation from desktop through Next to FastAPI.
- Server-side Realtime WebSocket to OpenAI.
- 24 kHz mono PCM audio streaming from native to FastAPI with source tags.
- Separate live transcription streams for founder mic and interviewee loopback.
- Labeled transcript turns are streamed to the checklist matcher and included
  in the saved end-session transcript.
- Realtime tool calling with `mark_item_covered` and bulk
  `mark_items_covered`.
- SSE updates back to the native overlay.
- Manual topic overrides in the overlay. Manual overrides block later auto-checks
  for that topic.
- Local `mock` checklist mode for no-key smoke tests.

## V1 Gaps

- Signal rows are intentionally not auto-checked.
- Realtime status is mostly visible through console logs and error events, not a
  polished overlay state.
- The session store is in-memory. Restarting FastAPI drops active live sessions.
- Speaker diarization is not implemented, so checks are based on whether the
  topic was clearly covered, not on a guaranteed speaker label.
