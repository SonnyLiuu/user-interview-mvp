param(
    [string]$ExePath = "$PSScriptRoot\..\build\Release\foundry_overlay.exe",
    [string]$RunDir = "$env:LOCALAPPDATA\foundry-dev",
    [switch]$CopyToRunDir,
    [switch]$TrustRoot,
    [switch]$Timestamp
)

$ErrorActionPreference = "Stop"

$certSubject = "CN=User Interview Notetaker Dev"
$cert = Get-ChildItem Cert:\CurrentUser\My |
    Where-Object { $_.Subject -eq $certSubject -and $_.HasPrivateKey } |
    Sort-Object NotAfter -Descending |
    Select-Object -First 1

if (-not $cert) {
    Write-Host "Creating dev code-signing cert: $certSubject"
    $cert = New-SelfSignedCertificate `
        -Type CodeSigningCert `
        -Subject $certSubject `
        -CertStoreLocation Cert:\CurrentUser\My `
        -KeyUsage DigitalSignature `
        -KeyAlgorithm RSA `
        -KeyLength 2048 `
        -HashAlgorithm SHA256 `
        -NotAfter (Get-Date).AddYears(2)
}

$certFile = "$env:TEMP\foundry-overlay-dev.cer"

$trustedPublisher = Get-ChildItem Cert:\CurrentUser\TrustedPublisher |
    Where-Object { $_.Thumbprint -eq $cert.Thumbprint } |
    Select-Object -First 1

if (-not $trustedPublisher) {
    Write-Host "Trusting dev cert for CurrentUser TrustedPublisher"
    Export-Certificate -Cert $cert -FilePath $certFile | Out-Null
    Import-Certificate `
        -FilePath $certFile `
        -CertStoreLocation Cert:\CurrentUser\TrustedPublisher | Out-Null
}

$trustedPeople = Get-ChildItem Cert:\CurrentUser\TrustedPeople |
    Where-Object { $_.Thumbprint -eq $cert.Thumbprint } |
    Select-Object -First 1

if (-not $trustedPeople) {
    Write-Host "Trusting dev cert for CurrentUser TrustedPeople"
    Export-Certificate -Cert $cert -FilePath $certFile | Out-Null
    Import-Certificate `
        -FilePath $certFile `
        -CertStoreLocation Cert:\CurrentUser\TrustedPeople | Out-Null
}

if ($TrustRoot) {
    $trustedRoot = Get-ChildItem Cert:\CurrentUser\Root |
        Where-Object { $_.Thumbprint -eq $cert.Thumbprint } |
        Select-Object -First 1

    if (-not $trustedRoot) {
        Write-Host "Trusting dev cert for CurrentUser Root"
        Write-Host "Windows may show a certificate trust confirmation. Accept it to continue."
        Export-Certificate -Cert $cert -FilePath $certFile | Out-Null
        Import-Certificate `
            -FilePath $certFile `
            -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
    }
}

$signtool = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin" `
    -Recurse `
    -Filter signtool.exe `
    -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -like "*\x64\signtool.exe" } |
    Sort-Object FullName -Descending |
    Select-Object -First 1

if (-not $signtool) {
    throw "signtool.exe was not found. Install the Windows SDK or Visual Studio C++ Desktop workload."
}

$resolvedExe = Resolve-Path $ExePath
Write-Host "Signing $resolvedExe"
if ($Timestamp) {
    & $signtool.FullName sign /fd SHA256 /sha1 $cert.Thumbprint /tr http://timestamp.digicert.com /td SHA256 $resolvedExe
} else {
    & $signtool.FullName sign /fd SHA256 /sha1 $cert.Thumbprint $resolvedExe
}

Write-Host "Verifying signature"
& $signtool.FullName verify /pa /v $resolvedExe

if ($CopyToRunDir) {
    New-Item -ItemType Directory -Force $RunDir | Out-Null
    Copy-Item (Join-Path (Split-Path $resolvedExe -Parent) "*") $RunDir -Recurse -Force
    Write-Host "Copied signed build to $RunDir"
}

Get-AuthenticodeSignature $resolvedExe | Format-List Status,StatusMessage,SignerCertificate,Path
