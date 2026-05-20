<#
.SYNOPSIS
    Stamp Claudia.md with a new revision date and regenerate Claudia.htm.

.DESCRIPTION
    The build guide lives at the stable path Claudia.md so external links
    don't rot. The revision date is embedded *inside* the file - in the
    "Last updated:" line just under the GitHub link, and in the footer
    ("Built for MindAttic LLC - <date>"). This script rewrites both to a
    new date in place.

    Historical revisions are accessible via git history (each bump is one
    commit).

.PARAMETER To
    Target date in YYYY.MM.DD form. Defaults to today.

.EXAMPLE
    .\scripts\cli\bump-version.ps1
    .\scripts\cli\bump-version.ps1 -To 2026.06.01
#>
[CmdletBinding()]
param(
    [string]$To
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$mdPath = Join-Path $repoRoot 'Claudia.md'

if (-not (Test-Path $mdPath)) { Write-Error "Claudia.md not found at $mdPath" }

$newDate = if ($PSBoundParameters.ContainsKey('To') -and $To) { $To } else { (Get-Date -Format 'yyyy.MM.dd') }
if ($newDate -notmatch '^\d{4}\.\d{2}\.\d{2}$') {
    Write-Error "Target '$newDate' is not in YYYY.MM.DD form."
}

$content = Get-Content -Path $mdPath -Raw

# Find the current date in the "*Last updated: YYYY.MM.DD*" line.
if ($content -notmatch '\*Last updated:\s*(\d{4}\.\d{2}\.\d{2})\*') {
    Write-Error "Could not find '*Last updated: <YYYY.MM.DD>*' line in Claudia.md"
}
$oldDate = $Matches[1]

if ($oldDate -eq $newDate) {
    Write-Host "No change - Claudia.md is already stamped $newDate."
    exit 0
}

Write-Host "-> Bumping date $oldDate -> $newDate"

# Only one location of the date stamp now: the "*Last updated: <date>*" line
# under the GitHub link. The Update Notes section is hand-edited per release.
$content = $content.Replace("*Last updated: $oldDate*", "*Last updated: $newDate*")

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($mdPath, $content, $utf8NoBom)
Write-Host "OK  rewrote Claudia.md"

Write-Host "-> Regenerating Claudia.htm"
& (Join-Path $PSScriptRoot 'build-html.ps1')
