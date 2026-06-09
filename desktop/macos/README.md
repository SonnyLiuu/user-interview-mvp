# User Interview Notetaker for macOS

Native macOS companion app for User Interview Notetaker. It shares the same
desktop AI architecture as the Windows app:

- Next.js owns desktop auth, launch tokens, person authorization, and final save.
- FastAPI owns live-session state, transcript-turn ingestion, Realtime checklist
  matching, SSE updates, and manual topic overrides.
- The macOS app stores only User Interview desktop tokens and live-session
  tokens. It never stores model-provider API keys.

## Runtime Scope

macOS v1 is a hybrid capture client:

- Production live auto-cross-off uses `captureProvider: "zoom_rtms"` and the
  existing transcript-turn boundary.
- The app exposes a transcript paste fallback for sessions where RTMS is not
  available.
- Local macOS system-audio capture is intentionally out of scope for v1.

## Build

```sh
cd desktop/macos
swift build -c release
```

The executable is produced by SwiftPM under `.build/release`.

## Package A DMG

```sh
cd desktop/macos
sh UserInterviewNotetaker/Packaging/build-dmg.sh
```

Output:

```text
desktop/macos/dist/User-Interview-Notetaker-0.1.0-macOS.dmg
```

Optional signing and notarization environment:

```sh
export FOUNDRY_MACOS_CODESIGN_IDENTITY="Developer ID Application: Example, Inc. (TEAMID)"
export FOUNDRY_MACOS_NOTARY_PROFILE="notarytool-keychain-profile"
sh UserInterviewNotetaker/Packaging/build-dmg.sh
```

The script signs the `.app` when a Developer ID identity is provided, creates a
compressed `.dmg`, submits it to Apple notary service when a notary profile is
configured, and staples the notarization ticket.

## Manual Gate

1. Build and install the `.dmg`.
2. Launch User Interview Notetaker.
3. Open Settings and sign in.
4. In the web dashboard, open a scheduled person and click Start call.
5. Confirm the `foundry://` link activates the macOS overlay.
6. Confirm the session starts with `captureProvider: zoom_rtms`.
7. Feed transcript turns through Zoom RTMS or Paste Transcript.
8. Confirm topic auto-checks arrive through SSE and manual toggles sync.
9. End the session and confirm the dashboard records the interaction,
   transcript, and `desktop_call_session_saved` event.

## File Layout

```text
desktop/macos/
├── Package.swift
├── UserInterviewNotetakerCore/       # testable contracts and clients
├── UserInterviewNotetaker/           # AppKit/WebKit/SwiftUI executable target
│   ├── App/
│   ├── Auth/
│   ├── Core/
│   ├── Overlay/
│   ├── Settings/
│   ├── Transcript/
│   ├── Resources/
│   └── Packaging/
└── UserInterviewNotetakerCoreSmokeTests/
```
