param(
    [string]$Version = "0.1.0",
    [string]$CertificateThumbprint = $env:FOUNDRY_CODESIGN_THUMBPRINT,
    [string]$PfxPath = $env:FOUNDRY_CODESIGN_PFX_PATH,
    [string]$PfxPassword = $env:FOUNDRY_CODESIGN_PFX_PASSWORD,
    [string]$TimestampUrl = "http://timestamp.digicert.com"
)

$ErrorActionPreference = "Stop"

$installerRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $installerRoot "..\..")
$nativeRoot = Join-Path $repoRoot "desktop\native"
$nativeRelease = Join-Path $nativeRoot "build\Release"
$exePath = Join-Path $nativeRelease "foundry_overlay.exe"
$issPath = Join-Path $installerRoot "foundry-overlay.iss"
$distDir = Join-Path $installerRoot "dist"
$installerPath = Join-Path $distDir "foundry-overlay-setup-$Version.exe"

function Find-SignTool {
    $tool = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin" `
        -Recurse `
        -Filter signtool.exe `
        -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -like "*\x64\signtool.exe" } |
        Sort-Object FullName -Descending |
        Select-Object -First 1

    if (-not $tool) {
        throw "signtool.exe was not found. Install the Windows SDK or Visual Studio C++ Desktop workload."
    }
    return $tool.FullName
}

function Find-InnoCompiler {
    $cmd = Get-Command iscc -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $default = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
    if (Test-Path $default) { return $default }

    return $null
}

function Assert-ProductionCertificate {
    if ($CertificateThumbprint) {
        $cert = Get-ChildItem Cert:\CurrentUser\My, Cert:\LocalMachine\My |
            Where-Object { $_.Thumbprint -eq $CertificateThumbprint -and $_.HasPrivateKey } |
            Select-Object -First 1
        if (-not $cert) {
            throw "No code-signing certificate with thumbprint $CertificateThumbprint and private key was found."
        }
        if ($cert.Subject -match "\bDev\b|Self-Signed|Foundry Overlay Dev|User Interview Notetaker Dev") {
            throw "Refusing to use a dev/self-signed certificate for the production signing path: $($cert.Subject)"
        }
        Write-Host "Using certificate thumbprint $CertificateThumbprint ($($cert.Subject))"
        return
    }

    if ($PfxPath) {
        if (-not (Test-Path $PfxPath)) {
            throw "PFX file was not found: $PfxPath"
        }
        Write-Host "Using PFX certificate at $PfxPath"
        return
    }

    throw @"
No production code-signing certificate was configured.

Set one of:
  FOUNDRY_CODESIGN_THUMBPRINT=<thumbprint of a real code-signing cert in Cert:\CurrentUser\My or Cert:\LocalMachine\My>
  FOUNDRY_CODESIGN_PFX_PATH=<path to .pfx>
  FOUNDRY_CODESIGN_PFX_PASSWORD=<pfx password>
"@
}

function Invoke-CodeSign([string]$Path) {
    $signtool = Find-SignTool
    $resolved = Resolve-Path $Path

    if ($CertificateThumbprint) {
        & $signtool sign `
            /fd SHA256 `
            /sha1 $CertificateThumbprint `
            /tr $TimestampUrl `
            /td SHA256 `
            $resolved
    } else {
        $args = @(
            "sign",
            "/fd", "SHA256",
            "/f", $PfxPath,
            "/tr", $TimestampUrl,
            "/td", "SHA256"
        )
        if ($PfxPassword) {
            $args += @("/p", $PfxPassword)
        }
        $args += $resolved
        & $signtool @args
    }

    & $signtool verify /pa /v $resolved
    Get-AuthenticodeSignature $resolved | Format-List Status,StatusMessage,SignerCertificate,Path
}

Assert-ProductionCertificate

Write-Host "Building native Release executable"
cmake --build (Join-Path $nativeRoot "build") --config Release

if (-not (Test-Path $exePath)) {
    throw "Native Release executable was not found: $exePath"
}

Write-Host "Signing native executable"
Invoke-CodeSign $exePath

New-Item -ItemType Directory -Force $distDir | Out-Null
$iscc = Find-InnoCompiler
if ($iscc) {
    Write-Host "Building Inno Setup installer"
    & $iscc /DMyAppVersion=$Version $issPath
} else {
    Write-Host "Inno Setup was not found; building IExpress fallback installer"
    powershell -ExecutionPolicy Bypass -File (Join-Path $installerRoot "build-iexpress.ps1") -Version $Version
}

if (-not (Test-Path $installerPath)) {
    throw "Installer was not created: $installerPath"
}

Write-Host "Signing installer"
Invoke-CodeSign $installerPath

Write-Host "Signed installer ready:"
Get-Item $installerPath
