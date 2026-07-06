# User Interview Notetaker for macOS

Native macOS companion app for User Interview Notetaker. It shares the same
desktop AI architecture as the Windows app:

- Next.js owns desktop auth, launch tokens, person authorization, and final save.
- FastAPI owns live-session state, transcript-turn ingestion, Realtime checklist
  matching, SSE updates, and manual topic overrides.
- The macOS app stores only User Interview desktop tokens and live-session
  tokens. It never stores model-provider API keys.

## Runtime Scope

macOS v1 is a desktop-audio capture client:

- Production live auto-cross-off uses `captureProvider: "desktop_audio"` with
  local microphone capture plus ScreenCaptureKit system-audio loopback.
- The app streams both local mic audio and system audio to FastAPI, where
  realtime transcription feeds the checklist matcher and SSE updates.
- The app exposes a transcript paste fallback for sessions where local audio
  capture is unavailable or permission is denied.

## Build

```sh
cd desktop/macos
swift build -c release
```

The executable is produced by SwiftPM under `.build/release`.

## Tests

```sh
cd desktop/macos
swift run UserInterviewNotetakerTests
```

The tests are a plain executable target (not a SwiftPM test target) because
the Command Line Tools toolchain has no XCTest; this keeps them runnable
without a full Xcode install.

## Package A DMG

From the repo root:

```sh
npm run package:mac
```

(or `sh UserInterviewNotetaker/Packaging/build-dmg.sh` from `desktop/macos`).

Output:

```text
desktop/macos/dist/User-Interview-Notetaker-0.1.0-macOS.dmg
```

The DMG contains the app plus an /Applications symlink for drag-to-install.

## Download Pipeline

The web app serves the packaged DMG at `/downloads/notetaker/macos`
(`src/app/downloads/notetaker/[platform]/route.ts`), which streams
`desktop/macos/dist/User-Interview-Notetaker-<version>-macOS.dmg` from the
host running Next.js. The "Download for Mac" button on the Insights page
links there. Run `npm run package:mac` on the serving host after changing
the app; the route returns 404 with the expected path until the DMG exists.

Unsigned builds are blocked by Gatekeeper on first open — users must
right-click the app > Open (or approve it in System Settings > Privacy &
Security). Provide the signing/notarization environment variables below to
ship a build that opens cleanly.

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
6. Confirm the session starts with `captureProvider: desktop_audio`.
7. Grant Microphone and Screen Recording permissions when prompted, then restart
   the app if macOS requires it.
8. Speak a checklist question and play call audio through the Mac speakers or
   active output device.
9. Confirm topic auto-checks arrive through SSE and manual toggles sync.
10. End the session and confirm the dashboard records the interaction,
   transcript, and `desktop_call_session_saved` event.

## File Layout

```text
desktop/macos/
├── Package.swift
├── UserInterviewNotetakerCore/       # library target: testable contracts and clients
│   ├── Models/                       # Topic, DesktopPerson, DesktopSettings, LiveSession
│   ├── Networking/                   # API clients, wire DTOs, SSE parser, HTTP support
│   ├── Audio/                        # mic capture, system-audio loopback, audio WebSocket
│   └── Support/                      # deep links, settings store, URL normalization
├── UserInterviewNotetaker/           # AppKit/SwiftUI executable target
│   ├── App/                          # entry point and AppDelegate wiring
│   ├── Session/                      # session orchestration, audio coordination, SSE decode
│   ├── State/                        # AppViewModel (observable UI state)
│   ├── Views/                        # overlay window and all SwiftUI screens
│   ├── Support/                      # keychain token store
│   ├── Resources/
│   └── Packaging/
└── UserInterviewNotetakerTests/      # executable test runner (swift run UserInterviewNotetakerTests)
```
