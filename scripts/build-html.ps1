<#
.SYNOPSIS
    Render Claudia.md to a self-contained Claudia.htm.

.DESCRIPTION
    Thin wrapper around scripts/build-html.js. The Node script produces ONE
    file with inlined CSS, inlined JS, and a light/dark theme toggle - no
    external CDN, no <link>, no <script src>. Modeled on mindattic.com's
    single-file site convention.

.PARAMETER Source
    Optional path to a specific .md. Defaults to Claudia.md in the repo root.
#>
[CmdletBinding()]
param(
    [string]$Source
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js not found on PATH. Install from https://nodejs.org, then run Claudia.Console update."
}

$builder = Join-Path $PSScriptRoot 'build-html.js'
if (-not (Test-Path $builder)) {
    Write-Error "Missing builder: $builder"
}

Push-Location $repoRoot
try {
    if ($Source) {
        & node $builder $Source
    } else {
        & node $builder
    }
    if ($LASTEXITCODE -ne 0) { Write-Error "build-html exited with $LASTEXITCODE" }
}
finally { Pop-Location }
