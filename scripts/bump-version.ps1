<#
.SYNOPSIS
    Stamp Claudia.md with a new revision date and regenerate Claudia.htm.

.DESCRIPTION
    The build guide lives at the stable path Claudia.md so external links
    don't rot. The revision date is embedded *inside* the file - in the H1
    title, the "What's new in <date>" heading, and the footer line. This
    script rewrites all three to a new date in place.

    Historical revisions are accessible via git history (each bump is one
    commit).

.PARAMETER To
    Target date in YYYY.MM.DD form. Defaults to today.

.EXAMPLE
    .\scripts\bump-version.ps1
    .\scripts\bump-version.ps1 -To 2026.06.01
#>
[CmdletBinding()]
param(
    [string]$To
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$mdPath = Join-Path $repoRoot 'Claudia.md'

if (-not (Test-Path $mdPath)) { Write-Error "Claudia.md not found at $mdPath" }

$newDate = if ($PSBoundParameters.ContainsKey('To') -and $To) { $To } else { (Get-Date -Format 'yyyy.MM.dd') }
if ($newDate -notmatch '^\d{4}\.\d{2}\.\d{2}$') {
    Write-Error "Target '$newDate' is not in YYYY.MM.DD form."
}

$content = Get-Content -Path $mdPath -Raw

# Find the current date in the H1 - that's the authoritative "current" stamp.
if ($content -notmatch '#\s+Claudia\s+[—\-]\s+Build Guide\s+\((\d{4}\.\d{2}\.\d{2})\)') {
    Write-Error "Could not find 'Build Guide (<YYYY.MM.DD>)' in the H1 of Claudia.md"
}
$oldDate = $Matches[1]

if ($oldDate -eq $newDate) {
    Write-Host "No change - Claudia.md is already stamped $newDate."
    exit 0
}

Write-Host "-> Bumping date $oldDate -> $newDate"

# Three known locations of the date stamp.
$content = $content.Replace("Build Guide ($oldDate)",     "Build Guide ($newDate)")
$content = $content.Replace("What's new in $oldDate",     "What's new in $newDate")
$content = $content.Replace("(vs. $oldDate)",             "(vs. $oldDate)")  # left as a back-reference; not bumped
# Refresh "(vs. previous)" placeholders so they point at the now-previous date.
$content = $content.Replace("What's new in $newDate (vs. previous)", "What's new in $newDate (vs. $oldDate)")
# Footer line: "*Built for MindAttic LLC — <date>*"
$content = $content -replace [regex]::Escape("— $oldDate"), "— $newDate"

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($mdPath, $content, $utf8NoBom)
Write-Host "OK  rewrote Claudia.md"

Write-Host "-> Regenerating Claudia.htm"
& (Join-Path $PSScriptRoot 'build-html.ps1')
