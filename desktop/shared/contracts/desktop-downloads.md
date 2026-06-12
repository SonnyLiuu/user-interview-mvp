# Desktop Download Contract

The web app exposes platform-specific desktop artifacts while keeping the
legacy Windows route available.

## Environment

- `FOUNDRY_OVERLAY_WINDOWS_INSTALLER_URL`: hosted Windows `.exe`.
- `FOUNDRY_OVERLAY_MACOS_DMG_URL`: hosted macOS `.dmg`.
- `FOUNDRY_OVERLAY_INSTALLER_URL`: deprecated Windows fallback.

## Local Routes

- `/downloads/notetaker/windows`
- `/downloads/notetaker/macos`
- `/downloads/notetaker`: legacy Windows alias.

When a hosted URL is configured, UI links point directly to that hosted artifact.
When it is not configured, UI links point to the local route and return a clear
404 until the artifact exists.

## Local Artifact Paths

- Windows: `desktop/installer/dist/foundry-overlay-setup-0.1.0.exe`
- macOS: `desktop/macos/dist/User-Interview-Notetaker-0.1.0-macOS.dmg`
