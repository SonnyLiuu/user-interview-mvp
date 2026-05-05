# Desktop Overlay (Windows-first)

Single native exe (`foundry_overlay.exe`) that manages:

- **Overlay window** — draggable topmost Direct2D notepad checklist, hidden from
  screen capture via `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`.
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
- Windows SDK 10.0.19041+ (for `WDA_EXCLUDEFROMCAPTURE`)
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
`Foundry Overlay Dev`, trusts it for CurrentUser TrustedPublisher and
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

2. Build and run the signed desktop copy:

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
6. Select a person. Native fetches
   `<base>/api/desktop/people/[personId]/call-brief`, extracts goals,
   questions, and signals, and renders them in the overlay.
7. Click overlay topic rows to check/uncheck them. Checked rows show a checkmark
   and strikethrough.
8. Drag the overlay somewhere obvious, quit, and relaunch. The position should
   restore from `%LOCALAPPDATA%\foundry\desktop-settings.json`.
9. Click **Reset overlay position** in Settings. The overlay should return to
   the default top-right location.
10. Click **End** on the overlay. The end-session form opens with checked and
   unchecked topic summaries.
11. Paste notes or transcript text and click **Save**. Native POSTs to
    `<base>/api/desktop/sessions/end`.
12. On success, the form shows saved, the overlay returns to idle, and the web
    app database has:
    - an `interactions` row with `notes_raw`, `transcript_raw`, and
      `completed_at`
    - a `person_events` row with type `desktop_call_session_saved`
13. Click **Quit** in the tray menu. The app exits cleanly.

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
    ├── overlay/                   ← Direct2D capture-excluded notepad
    │   ├── window.{h,cpp}
    │   └── renderer.{h,cpp}
    ├── tray/
    │   └── tray.{h,cpp}
    └── webview/
        └── webview_window.{h,cpp}
```

Future audio/transcription/auto-matching work should extend `src/common/` and
keep platform-specific capture/windowing under `src/windows/`.
