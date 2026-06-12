# User Interview Notetaker (Windows-first)

Single native exe (`foundry_overlay.exe`) for the User Interview Notetaker that manages:

- **Overlay window** — draggable topmost Direct2D notepad checklist. The
  checklist is intentionally visible during screen shares.
- **Tray icon** — start/settings/quit menu via `Shell_NotifyIcon`.
- **WebView2 windows** — auth, session picker, settings, and end-session form.
- **Native API calls** — WinHTTP calls the Next.js desktop endpoints with the
  saved Clerk bearer token.

No injection, no DLL, no Electron.

## Build

```pwsh
cd desktop\native
cmake -B build -A x64
cmake --build build --config Release
```

Outputs:
- `build\Release\foundry_overlay.exe`
- `build\Release\assets\*.html` (copied from `assets/` post-build)

Requires:
- Visual Studio 2022 Build Tools, C++ Desktop workload
- CMake 3.20+
- Windows SDK 10.0.19041+
- WebView2 Runtime — preinstalled on Windows 11; on older Windows install
  from <https://developer.microsoft.com/microsoft-edge/webview2/>

The first `cmake -B build` fetches the WebView2 NuGet package (~5 MB).

## Dev signing

If Windows blocks the unsigned exe with an Application Control policy, use the
dev signing script:

```pwsh
cd desktop\native
cmake --build build --config Release
powershell -ExecutionPolicy Bypass -File .\scripts\Sign-Dev.ps1 -CopyToRunDir
cd $env:LOCALAPPDATA\foundry-dev
.\foundry_overlay.exe
```

The script creates/reuses a CurrentUser code-signing cert named
`User Interview Notetaker Dev`, trusts it for CurrentUser TrustedPublisher and
TrustedPeople, signs the Release exe, verifies the signature, and copies it to
`%LOCALAPPDATA%\foundry-dev`.

If the signed copy is still blocked, the machine is enforcing a stricter WDAC /
AppLocker / Smart App Control policy. Try the explicit root-trust path next:

```pwsh
powershell -ExecutionPolicy Bypass -File .\scripts\Sign-Dev.ps1 -CopyToRunDir -TrustRoot
```

Windows may show a certificate trust confirmation for `-TrustRoot`; accept it
to continue. If that hangs or is blocked, the remaining options are an IT/policy
allowlist for the dev cert/folder or a real trusted code-signing cert.

## Manual MVP gate

Prereqs:

1. Run the Next.js app from repo root:

   ```pwsh
   npm run dev
   ```

2. Run the FastAPI service from repo root:

   ```pwsh
   cd services\api
   .\.venv\Scripts\python.exe app/main.py
   cd ..\..
   ```

   `services/api/.env.local` must include realtime checklist
   credentials. For Azure, set `CHECKLIST_AI_PROVIDER=azure`,
   `AZURE_OPENAI_REALTIME_ENDPOINT`, `AZURE_OPENAI_REALTIME_API_KEY`, and
   `AZURE_OPENAI_REALTIME_DEPLOYMENT`. For public OpenAI, set
   `CHECKLIST_AI_PROVIDER=openai` and either `OPENAI_REALTIME_API_KEY` or
   `OPENAI_API_KEY`. The root `.env.local` must point `FOUNDRY_API_BASE_URL`
   at this service, usually `http://127.0.0.1:8001`. In deployed
   environments, set `FOUNDRY_DESKTOP_API_PUBLIC_URL` to the public FastAPI
   URL that the Windows overlay can reach for SSE and WebSocket traffic.

3. Build and run the signed desktop copy:

   ```pwsh
   cd desktop\native
   cmake --build build --config Release
   powershell -ExecutionPolicy Bypass -File .\scripts\Sign-Dev.ps1 -CopyToRunDir
   cd $env:LOCALAPPDATA\foundry-dev
   .\foundry_overlay.exe
   ```

Gate:

1. Confirm a draggable notepad overlay appears top-right and the tray icon is
   active.
2. Open **Settings** from the tray or overlay button.
3. Set **API base URL** to `http://localhost:3000`, click **Save settings**,
   then click **Auth self-test**.
4. If auth is not saved, click **Start Session** from the tray. The auth WebView
   opens to `<base>/desktop-auth`; sign in with Clerk. Native saves
   `%LOCALAPPDATA%\foundry\token.json`.
5. Click **Start Session** with a saved token. The picker fetches
   `<base>/api/desktop/people` and lists people.
6. Select a person. Native creates a live FastAPI session through
   `<base>/api/desktop/sessions/live/start`. FastAPI loads the current call
   brief, starts an OpenAI Realtime WebSocket, and returns the checklist,
   `sessionId`, `liveToken`, and FastAPI base URL.
7. Join a Zoom/Meet call using the normal Windows default speaker/mic devices.
   Native streams default system audio and microphone audio to
   `<foundryBaseUrl>/v1/desktop/live-sessions/[sessionId]/audio`; FastAPI
   forwards 24 kHz mono PCM chunks to OpenAI Realtime.
8. Ask one of the displayed questions, or cover one of the displayed goals.
   A clearly covered goal/question should auto-check with strikethrough after
   the Realtime model calls `mark_item_covered`. Signal rows are intentionally
   not auto-checked in this V1.
9. Click overlay topic rows to check/uncheck them. Checked rows show a checkmark
   and strikethrough.
10. Drag the overlay somewhere obvious, quit, and relaunch. The position should
   restore from `%LOCALAPPDATA%\foundry\desktop-settings.json`.
11. Click **Reset overlay position** in Settings. The overlay should return to
   the default top-right location.
12. Click **End** on the overlay. The end-call view shows checked-topic counts
    and whether a live transcript has been captured.
13. Click **Save call**. Native saves checked topics plus the captured
    transcript by POSTing to `<base>/api/desktop/sessions/end`.
14. On success, the overlay returns to idle, and the web
    app database has:
    - an `interactions` row with `notes_raw`, `transcript_raw`, and
      `completed_at`
    - a `transcripts` row when transcript text or notes were captured
    - a `person_events` row with type `desktop_call_session_saved`
15. Click **Quit** in the tray menu. The app exits cleanly.

## Troubleshooting

- **Application Control blocks the exe** — run the dev signing flow above. If the
  signed copy is still blocked, try `-TrustRoot` manually in a visible
  PowerShell window, then rerun from `%LOCALAPPDATA%\foundry-dev`.
- **Auth self-test returns 401** — click **Clear auth**, then **Start Session**
  and sign in again. Verify the API base URL points to the running Next app.
- **Picker is empty** — confirm the signed-in user has people in the web app and
  `/api/desktop/people` returns rows for that account.
- **Call brief fails to load** — check the Next.js terminal for
  `/api/desktop/people/[personId]/call-brief` errors. Brief generation may fail
  if AI provider keys are missing.
- **Auto-cross-off does not start** — confirm FastAPI is running, root
  `FOUNDRY_API_BASE_URL` points to it, and the FastAPI console does not show a
  Realtime error. For Azure matching, set `CHECKLIST_AI_PROVIDER=azure` plus
  the `AZURE_OPENAI_REALTIME_*` variables. For public OpenAI matching, set
  `CHECKLIST_AI_PROVIDER=openai` and either `OPENAI_REALTIME_API_KEY` or
  `OPENAI_API_KEY`. For no-key smoke tests, set `CHECKLIST_AI_PROVIDER=mock`.
- **Audio connects but nothing crosses off** — confirm Zoom audio is playing
  through the Windows default output device and your mic is the default
  communications input. The Realtime prompt only marks existing goal/question
  rows when evidence is clear.
- **Save fails** — keep the end-session form open, check the displayed error,
  and inspect the Next.js terminal for `/api/desktop/sessions/end`. The session
  remains active until save succeeds.
- **Overlay is misplaced** — open Settings and click **Reset overlay position**.

## Layout

```
desktop/native/
├── CMakeLists.txt
├── assets/
│   ├── settings.html              ← copied next to exe at build time
│   ├── session_picker.html
│   └── end_session.html
├── scripts/
│   └── Sign-Dev.ps1
├── src/common/
│   └── app_state.h                ← native MVP session/settings state
└── src/windows/
    ├── main.cpp                   ← entry, COM init, message loop
    ├── app_paths.{h,cpp}          ← app data paths
    ├── http/                      ← WinHTTP helper for API calls
    ├── overlay/                   ← Direct2D visible notepad
    │   ├── window.{h,cpp}
    │   └── renderer.{h,cpp}
    ├── tray/
    │   └── tray.{h,cpp}
    └── webview/
        └── webview_window.{h,cpp}
```

Future audio/transcription/auto-matching work should extend `src/common/` and
keep platform-specific capture/windowing under `src/windows/`.
