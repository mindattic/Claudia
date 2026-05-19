<#
.SYNOPSIS
    PostToolUse hook: regenerate the matching .htm when a Claudia_<date>.md is edited.

.DESCRIPTION
    Reads the hook's JSON payload from stdin, checks whether the touched path is
    a Claudia_<YYYY.MM.DD>.md in this repo, and if so re-runs build-html.ps1 on it.

    Silent and non-blocking on the no-op path so it doesn't spam the session.
#>
$ErrorActionPreference = 'SilentlyContinue'

try {
    $payload = [Console]::In.ReadToEnd()
    if (-not $payload) { exit 0 }
    $json = $payload | ConvertFrom-Json -ErrorAction Stop
} catch {
    exit 0
}

$path = $json.tool_input.file_path
if (-not $path) { exit 0 }

# Only react to Claudia_<YYYY.MM.DD>.md edits inside this repo.
$repoRoot = Split-Path -Parent $PSScriptRoot
$leaf = Split-Path -Leaf $path
if ($leaf -notmatch '^Claudia_\d{4}\.\d{2}\.\d{2}\.md$') { exit 0 }

try {
    $full = (Resolve-Path -LiteralPath $path -ErrorAction Stop).Path
} catch { exit 0 }

if (-not $full.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) { exit 0 }

# Re-render the HTML page. Log to a file so the session stays clean.
$log = Join-Path $repoRoot '.claude\html-rebuild.log'
$stamp = (Get-Date).ToString('s')
Add-Content -Path $log -Value "[$stamp] rebuilding $leaf"

& (Join-Path $PSScriptRoot 'build-html.ps1') -Source $full *>> $log
Add-Content -Path $log -Value "[$stamp] exit $LASTEXITCODE"
exit 0
