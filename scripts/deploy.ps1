# deploy.ps1 - Claudia FTP deploy.
#
# 1. Regenerates Claudia.htm from Claudia.md (build-html.js).
# 2. Stamps index.htm with a "Last Updated" comment.
# 3. Uploads Claudia.md, Claudia.htm, and index.htm to the FTP target
#    (defaults to /mindattic.com/claudia/) via curl.exe.
#
# Credentials live in scripts/deploy.settings.json (gitignored). Start from
# scripts/deploy.settings.json.template if you don't have one yet.

param (
    [string]$SettingsFile = "$PSScriptRoot\deploy.settings.json",
    [switch]$NoBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

# ---------------------------------------------------------------------------
# Load settings
# ---------------------------------------------------------------------------
if (-not (Test-Path $SettingsFile)) {
    Write-Error @"
deploy.settings.json not found at: $SettingsFile
Copy scripts\deploy.settings.json.template -> scripts\deploy.settings.json
and fill in your FTP credentials. The .gitignore already excludes the real file.
"@
    exit 1
}

$cfg = Get-Content -Raw -Path $SettingsFile | ConvertFrom-Json

$ftpHost    = $cfg.FtpHost
$ftpPort    = $cfg.FtpPort
$ftpUser    = $cfg.FtpUsername
$ftpPass    = $cfg.FtpPassword
$remotePath = $cfg.FtpRemotePath.TrimEnd('/')
$useSsl     = [bool]$cfg.FtpUseSsl
$usePassive = [bool]$cfg.FtpPassive

# ---------------------------------------------------------------------------
# Build Claudia.htm (skip with -NoBuild if you already just built it)
# ---------------------------------------------------------------------------
if (-not $NoBuild) {
    Write-Host "Building Claudia.htm ..."
    Push-Location $repoRoot
    try {
        & node (Join-Path $PSScriptRoot 'build-html.js')
        if ($LASTEXITCODE -ne 0) { Write-Error "build-html.js failed (exit $LASTEXITCODE)" }
    } finally { Pop-Location }
}

# ---------------------------------------------------------------------------
# Stamp index.htm
# ---------------------------------------------------------------------------
$indexFile = Join-Path $repoRoot 'index.htm'
if (Test-Path $indexFile) {
    $date    = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    $stamp   = "<!-- Last Updated: $date -->"
    $content = [System.IO.File]::ReadAllText($indexFile, [System.Text.Encoding]::UTF8)

    if ($content -match "(?s)^<!--\s*Last Updated:.*?-->(\r?\n)") {
        $content = $content -replace "(?s)^<!--\s*Last Updated:.*?-->(\r?\n)", "$stamp`$1"
    } else {
        $content = "$stamp`r`n$content"
    }

    [System.IO.File]::WriteAllText($indexFile, $content, [System.Text.Encoding]::UTF8)
    Write-Host "Stamped: $date"
}

# ---------------------------------------------------------------------------
# Collect local files to deploy
# ---------------------------------------------------------------------------
$wanted = @('Claudia.md', 'Claudia.htm', 'index.htm')
$files = @()
foreach ($name in $wanted) {
    $p = Join-Path $repoRoot $name
    if (-not (Test-Path $p)) {
        Write-Error "Required file missing: $p"
    }
    $files += Get-Item -Path $p
}

# ---------------------------------------------------------------------------
# Deploy via curl.exe
# ---------------------------------------------------------------------------
$curlArgs = @('--ftp-create-dirs', '--insecure')
if ($usePassive) { $curlArgs += '--ftp-pasv' }
if ($useSsl)     { $curlArgs += '--ssl-reqd' }

Write-Host ""
Write-Host "Deploying to ftp://${ftpHost}:${ftpPort}${remotePath}/ ..."
Write-Host ("-" * 60)

$success = 0
$failed  = 0

foreach ($file in $files) {
    $relative  = $file.Name
    $remoteUrl = "ftp://${ftpHost}:${ftpPort}${remotePath}/${relative}"

    $ErrorActionPreference = "Continue"
    $output = & curl.exe @curlArgs -u "${ftpUser}:${ftpPass}" -T $file.FullName $remoteUrl 2>&1
    $ErrorActionPreference = "Stop"

    if ($LASTEXITCODE -eq 0) {
        Write-Host ("  [OK] {0,-14} ({1:N0} bytes)" -f $relative, $file.Length)
        $success++
    } else {
        Write-Host "  [FAIL] $relative  - exit $LASTEXITCODE : $output" -ForegroundColor Red
        $failed++
    }
}

Write-Host ("-" * 60)
Write-Host "Done. $success uploaded, $failed failed."
Write-Host ""

if ($failed -gt 0) { exit 1 } else { exit 0 }
