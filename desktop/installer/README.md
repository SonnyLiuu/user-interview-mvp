# User Interview Notetaker installer

Inno Setup script that packages [`desktop/native/build/Release/foundry_overlay.exe`](../native/) plus its `assets/` folder into the User Interview Notetaker per-user installer for Windows.

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

## Production signed build

Use `Build-SignedInstaller.ps1` when you have a real Authenticode code-signing
certificate. The script builds the native Release exe, signs it, creates the
installer, signs the installer, and verifies both signatures. It refuses to use
the local self-signed dev certificates.

Certificate already installed in the Windows certificate store:

```pwsh
$env:FOUNDRY_CODESIGN_THUMBPRINT = "<real-code-signing-cert-thumbprint>"
powershell -ExecutionPolicy Bypass -File .\Build-SignedInstaller.ps1
```

Certificate as a PFX file:

```pwsh
$env:FOUNDRY_CODESIGN_PFX_PATH = "C:\secure\user-interview-codesign.pfx"
$env:FOUNDRY_CODESIGN_PFX_PASSWORD = "<password>"
powershell -ExecutionPolicy Bypass -File .\Build-SignedInstaller.ps1
```

If Inno Setup is installed, the script uses it. Otherwise it falls back to the
local IExpress package builder.

## Local fallback build

If Inno Setup is not installed, use the Windows built-in IExpress fallback to
create a local MVP installer with the same output name:

```pwsh
powershell -ExecutionPolicy Bypass -File .\build-iexpress.ps1
```

This packages the release exe and assets, installs them under
`%LOCALAPPDATA%\Programs\FoundryOverlay`, registers the `foundry://` protocol,
creates a Start Menu shortcut, and launches the notetaker.

## Sign the installer (optional)

```pwsh
signtool sign /n "User Interview Notetaker Dev" /fd SHA256 `
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
