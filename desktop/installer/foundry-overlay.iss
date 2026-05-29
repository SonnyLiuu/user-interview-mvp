; Inno Setup script for Foundry Overlay.
;
; Build:
;   1. Build Release exe:    cd ..\native && cmake --build build --config Release
;   2. (Optional) sign exe:  powershell -ExecutionPolicy Bypass -File ..\native\scripts\Sign-Dev.ps1
;   3. Compile installer:    iscc desktop\installer\foundry-overlay.iss
;   4. (Optional) sign installer:
;        signtool sign /n "Foundry Overlay Dev" /fd SHA256 ^
;          /tr http://timestamp.digicert.com /td SHA256 ^
;          desktop\installer\dist\foundry-overlay-setup-*.exe
;
; Per-user install (no admin), drops into:
;   %LOCALAPPDATA%\Programs\FoundryOverlay\
; HKCU registers foundry:// so the protocol works without admin too.

#define MyAppName        "Foundry Overlay"
#define MyAppVersion     "0.1.0"
#define MyAppPublisher   "Foundry"
#define MyAppExeName     "foundry_overlay.exe"
#define MyAppURL         "https://foundry.local"
#define NativeBuildDir   "..\native\build\Release"

[Setup]
AppId={{B3F4A1C2-7E8D-4F5A-9C1D-FE8B0A9C2D3E}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppMutex=Foundry.Overlay.SingleInstance
DefaultDirName={localappdata}\Programs\FoundryOverlay
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=dist
OutputBaseFilename=foundry-overlay-setup-{#MyAppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
UninstallDisplayIcon={app}\{#MyAppExeName}
SetupLogging=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "startmenu";  Description: "Create a Start Menu shortcut";    GroupDescription: "Shortcuts:"
Name: "autostart";  Description: "Start Foundry Overlay when I sign in to Windows"; GroupDescription: "Startup:"; Flags: unchecked

[Files]
Source: "{#NativeBuildDir}\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#NativeBuildDir}\assets\*";        DestDir: "{app}\assets"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: startmenu
Name: "{userstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: autostart

[Registry]
; Register the foundry:// custom URL scheme under HKCU so no admin rights
; are needed. "%1" is replaced by Windows with the full URL (including
; query string) when the protocol is invoked from a browser or Run dialog.
Root: HKCU; Subkey: "Software\Classes\foundry"; \
  ValueType: string; ValueName: ""; ValueData: "URL:Foundry Protocol"; \
  Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\foundry"; \
  ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\foundry\DefaultIcon"; \
  ValueType: string; ValueName: ""; ValueData: "{app}\{#MyAppExeName},0"
Root: HKCU; Subkey: "Software\Classes\foundry\shell\open\command"; \
  ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName} now"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Best-effort: kill any running instance before files are removed so the
; lock on foundry_overlay.exe releases.
Filename: "{cmd}"; Parameters: "/C taskkill /IM {#MyAppExeName} /F"; Flags: runhidden; RunOnceId: "KillOverlay"
