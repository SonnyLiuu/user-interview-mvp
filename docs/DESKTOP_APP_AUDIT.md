# Desktop App Audit

## What It Does

The desktop app is a Windows-first native overlay, not Electron. The native exe
owns the tray icon, a topmost capture-excluded checklist window, WebView2 auth
and form windows, persisted local settings, audio capture, and direct HTTP/SSE/
WebSocket calls into the web and FastAPI backends.

Core user flow:

1. The user signs into the Next.js app through a WebView2 `/desktop-auth` page.
2. The native app stores the Clerk bearer token in `%LOCALAPPDATA%\foundry`.
3. Start Session opens a person picker loaded from `/api/desktop/people`, or a
   `foundry://call/start` deep link starts directly with a short-lived launch
   token.
4. Next.js validates the desktop user, checks the launch token, signs a backend
   token, and asks FastAPI to create a live desktop session.
5. FastAPI returns checklist topics, a live session token, and the public API
   base URL for SSE and audio WebSocket traffic.
6. The native app displays goals/questions/signals, streams tagged mic and
   loopback PCM frames, listens for Realtime checklist events, and lets the user
   manually check/uncheck rows.
7. End Session posts checked/unchecked topic summaries, notes, and transcript
   text to `/api/desktop/sessions/end`, which writes interaction, transcript,
   person status, and event records.

## High-Value Test Surface

The lightweight suite focuses on contracts that are cheap to run and expensive
to break:

- Desktop launch tokens must only work for the intended Clerk user and person,
  reject tampering, and expire quickly.
- The live-session response must return a normalized FastAPI base URL the native
  app can use for SSE and WebSocket paths.
- End-session notes must produce stable checked/unchecked topic summaries and
  append user notes predictably.

These tests avoid WebView2, Windows audio devices, Clerk, the database, and a
running FastAPI process, so they can run as fast unit tests during normal web
app development.

## Gaps To Cover Next

- Native C++ URL parsing and audio frame tagging are still untested because the
  helpers currently live inside `main.cpp`.
- FastAPI live-session token verification, SSE formatting, and tagged audio
  splitting are good candidates for a small Python `unittest` suite.
- Route-level tests for desktop endpoints would need dependency injection or a
  mockable database/auth layer.
