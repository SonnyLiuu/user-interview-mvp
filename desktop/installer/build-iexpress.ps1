param(
    [string]$Version = "0.1.0"
)

$ErrorActionPreference = "Stop"

$installerRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $installerRoot "..\..")
$nativeRelease = Join-Path $repoRoot "desktop\native\build\Release"
$assetsDir = Join-Path $nativeRelease "assets"
$distDir = Join-Path $installerRoot "dist"
$target = Join-Path $distDir "foundry-overlay-setup-$Version.exe"
$sedPath = Join-Path $distDir "foundry-overlay-iexpress.sed"
$iexpress = Join-Path $env:WINDIR "System32\iexpress.exe"

if (-not (Test-Path $iexpress)) {
    throw "IExpress was not found at $iexpress"
}

$requiredFiles = @(
    (Join-Path $nativeRelease "foundry_overlay.exe"),
    (Join-Path $assetsDir "end_session.html"),
    (Join-Path $assetsDir "session_picker.html"),
    (Join-Path $assetsDir "settings.html"),
    (Join-Path $installerRoot "install-notetaker.cmd")
)

foreach ($file in $requiredFiles) {
    if (-not (Test-Path $file)) {
        throw "Missing required installer input: $file"
    }
}

New-Item -ItemType Directory -Force $distDir | Out-Null
if (Test-Path $target) {
    Remove-Item -LiteralPath $target -Force
}

$nativeReleaseSed = $nativeRelease.TrimEnd("\") + "\"
$assetsDirSed = $assetsDir.TrimEnd("\") + "\"
$installerRootSed = $installerRoot.TrimEnd("\") + "\"

$sed = @"
[Version]
Class=IEXPRESS
SEDVersion=3

[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=0
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=1
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=%InstallPrompt%
DisplayLicense=%DisplayLicense%
FinishMessage=%FinishMessage%
TargetName=%TargetName%
FriendlyName=%FriendlyName%
AppLaunched=%AppLaunched%
PostInstallCmd=%PostInstallCmd%
AdminQuietInstCmd=%AdminQuietInstCmd%
UserQuietInstCmd=%UserQuietInstCmd%
SourceFiles=SourceFiles

[Strings]
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=$target
FriendlyName=User Interview Notetaker
AppLaunched=install-notetaker.cmd
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
FILE0="foundry_overlay.exe"
FILE1="end_session.html"
FILE2="session_picker.html"
FILE3="settings.html"
FILE4="install-notetaker.cmd"

[SourceFiles]
SourceFiles0=$nativeReleaseSed
SourceFiles1=$assetsDirSed
SourceFiles2=$installerRootSed

[SourceFiles0]
%FILE0%=

[SourceFiles1]
%FILE1%=
%FILE2%=
%FILE3%=

[SourceFiles2]
%FILE4%=
"@

Set-Content -LiteralPath $sedPath -Value $sed -Encoding ASCII

$process = Start-Process `
    -FilePath $iexpress `
    -ArgumentList @("/N", "/Q", $sedPath) `
    -Wait `
    -PassThru

if ($process.ExitCode -ne 0) {
    throw "IExpress failed with exit code $($process.ExitCode)"
}

$deadline = (Get-Date).AddSeconds(20)
$packagedOutput = $null
while (-not $packagedOutput) {
    $packagedOutput = Get-ChildItem -LiteralPath $distDir -File -Filter "RC*.tmp" |
        Where-Object { $_.Length -gt 200KB } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if ((Get-Date) -gt $deadline) {
        break
    }
    if (-not $packagedOutput) {
        Start-Sleep -Milliseconds 250
    }
}

if (-not $packagedOutput) {
    throw "IExpress completed but did not create a self-contained package"
}

$packagedOutput.Attributes = "Normal"
Copy-Item -LiteralPath $packagedOutput.FullName -Destination $target -Force

Get-ChildItem -LiteralPath $distDir -File |
    Where-Object { $_.Name -like "~foundry-overlay-setup-$Version.*" -or $_.Name -like "CAB*.TMP" -or $_.Name -like "RC*.tmp" } |
    ForEach-Object {
        try {
            $_.Attributes = "Normal"
            Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop
        } catch {
            Write-Warning "Unable to remove IExpress scratch file $($_.FullName): $($_.Exception.Message)"
        }
    }

Get-ChildItem -LiteralPath $installerRoot -File |
    Where-Object { $_.Name -like "CAB*.TMP" } |
    ForEach-Object {
        try {
            $_.Attributes = "Normal"
            Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop
        } catch {
            Write-Warning "Unable to remove IExpress scratch file $($_.FullName): $($_.Exception.Message)"
        }
    }

Get-Item $target
