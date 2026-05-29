# Foundry Overlay installer

Inno Setup script that packages [`desktop/native/build/Release/foundry_overlay.exe`](../native/) plus its `assets/` folder into a per-user installer for Windows.

## Prereqs

- **Inno Setup 6+** — install from <https://jrsoftware.org/isdl.php>. The `iscc.exe` compiler ends up at `C:\Program Files (x86)\Inno Setup 6\ISCC.exe`.
- Release build of the overlay must exist at `desktop/native/build/Release/`.

## Build

```pwsh
# 1. Compile the overlay
cd desktop\native
cmake --build build --config Release

# 2. (Optional but recommended) sign the exe with the dev cert
powershell -ExecutionPolicy Bypass -File .\scripts\Sign-Dev.ps1

# 3. Compile the installer
cd ..\installer
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" foundry-overlay.iss
```

Output: `desktop/installer/dist/foundry-overlay-setup-<version>.exe`.

## Sign the installer (optional)

```pwsh
signtool sign /n "Foundry Overlay Dev" /fd SHA256 `
  /tr http://timestamp.digicert.com /td SHA256 `
  dist\foundry-overlay-setup-*.exe
```

The dev cert is created/trusted by `desktop/native/scripts/Sign-Dev.ps1`. End users not on this machine will still see a SmartScreen prompt — that's a code-signing-reputation problem we accept until we have an EV cert.

## What it installs

- `%LOCALAPPDATA%\Programs\FoundryOverlay\foundry_overlay.exe`
- `%LOCALAPPDATA%\Programs\FoundryOverlay\assets\*.html`
- Start Menu shortcut (opt-out checkbox during install)
- Startup-folder shortcut for sign-in autostart (opt-in checkbox during install)
- `HKCU\Software\Classes\foundry` registry keys so `foundry://` URLs route to the exe with the full URL as `argv[1]`

User-data files (`%LOCALAPPDATA%\foundry\token.json`, `desktop-settings.json`) are intentionally left alone on uninstall.

## Publish

For v1, upload the signed installer to a stable release URL, S3 object, or
other static host, then set the root Next app env var:

```env
FOUNDRY_OVERLAY_INSTALLER_URL=https://example.com/downloads/foundry-overlay-setup.exe
```

The `/download` page and settings card intentionally do not point at a repo
local `public/downloads` file anymore. If the env var is unset, the app shows an
"installer not published yet" state instead of a broken `.exe` link.
