@echo off
setlocal

set "INSTALL_DIR=%LOCALAPPDATA%\Programs\FoundryOverlay"
set "ASSET_DIR=%INSTALL_DIR%\assets"
set "START_MENU=%APPDATA%\Microsoft\Windows\Start Menu\Programs"

mkdir "%INSTALL_DIR%" >nul 2>&1
mkdir "%ASSET_DIR%" >nul 2>&1

copy /Y "%~dp0foundry_overlay.exe" "%INSTALL_DIR%\foundry_overlay.exe" >nul
copy /Y "%~dp0end_session.html" "%ASSET_DIR%\end_session.html" >nul
copy /Y "%~dp0session_picker.html" "%ASSET_DIR%\session_picker.html" >nul
copy /Y "%~dp0settings.html" "%ASSET_DIR%\settings.html" >nul

reg add HKCU\Software\Classes\foundry /ve /d "URL:User Interview Protocol" /f >nul
reg add HKCU\Software\Classes\foundry /v "URL Protocol" /d "" /f >nul
reg add HKCU\Software\Classes\foundry\DefaultIcon /ve /d "\"%INSTALL_DIR%\foundry_overlay.exe\",0" /f >nul
reg add HKCU\Software\Classes\foundry\shell\open\command /ve /d "\"%INSTALL_DIR%\foundry_overlay.exe\" \"%%1\"" /f >nul

powershell -NoProfile -ExecutionPolicy Bypass -Command "$shortcut=(New-Object -ComObject WScript.Shell).CreateShortcut([IO.Path]::Combine($env:APPDATA,'Microsoft\Windows\Start Menu\Programs\User Interview Notetaker.lnk')); $shortcut.TargetPath=[IO.Path]::Combine($env:LOCALAPPDATA,'Programs\FoundryOverlay\foundry_overlay.exe'); $shortcut.WorkingDirectory=[IO.Path]::Combine($env:LOCALAPPDATA,'Programs\FoundryOverlay'); $shortcut.Save()"

start "" "%INSTALL_DIR%\foundry_overlay.exe"
exit /b 0
