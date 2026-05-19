<#
.SYNOPSIS
    Bump the guide to a new dated revision and regenerate the .htm.

.DESCRIPTION
    Finds the latest Claudia_<YYYY.MM.DD>.md, copies it to a new file stamped
    with today's date (or -To <date> if you want to forward-date), rewrites
    the in-file date tags, then invokes build-html.ps1 to produce the
    matching .htm.

    The previous dated file is left untouched so you have a permanent diff
    target.

.PARAMETER To
    Optional target date in YYYY.MM.DD form. Defaults to today.

.PARAMETER Force
    Overwrite if Claudia_<target>.md already exists.

.EXAMPLE
    .\scripts\bump-version.ps1
    .\scripts\bump-version.ps1 -To 2026.06.01
#>
[CmdletBinding()]
param(
    [string]$To,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

# Discover existing dated guides.
$guides = Get-ChildItem -Path $repoRoot -Filter 'Claudia_*.md' -File | ForEach-Object {
    if ($_.BaseName -match '^Claudia_(\d{4}\.\d{2}\.\d{2})$') {
        [pscustomobject]@{ Date = $Matches[1]; File = $_ }
    }
} | Sort-Object Date

if (-not $guides) { Write-Error "No Claudia_<YYYY.MM.DD>.md found in $repoRoot" }

$current = $guides[-1]
$newDate = if ($PSBoundParameters.ContainsKey('To') -and $To) { $To } else { (Get-Date -Format 'yyyy.MM.dd') }

if ($newDate -notmatch '^\d{4}\.\d{2}\.\d{2}$') {
    Write-Error "Target '$newDate' is not in YYYY.MM.DD form."
}
if ($newDate -le $current.Date -and -not $Force) {
    Write-Error "Target $newDate is not newer than current $($current.Date). Re-run with -Force to override."
}

$newName = "Claudia_$newDate.md"
$newPath = Join-Path $repoRoot $newName

if ((Test-Path $newPath) -and -not $Force) {
    Write-Error "$newName already exists. Re-run with -Force to overwrite."
}

Write-Host "-> Bumping $($current.Date) -> $newDate"
Copy-Item -Path $current.File.FullName -Destination $newPath -Force

# Rewrite version-tag references inside the new file.
$content = Get-Content -Path $newPath -Raw

$replacements = @{
    "Build Guide ($($current.Date))" = "Build Guide ($newDate)"
    "What's new in $($current.Date)" = "What's new in $newDate"
    "(vs. $($current.Date))"         = "(vs. $($current.Date))"   # left as a useful back-reference
    "— $($current.Date)"             = "— $newDate"
}
foreach ($k in $replacements.Keys) {
    $content = $content.Replace($k, $replacements[$k])
}

# Update "(vs. previous)" placeholder to point at the actual previous date.
$content = $content.Replace("What's new in $newDate (vs. previous)", "What's new in $newDate (vs. $($current.Date))")

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($newPath, $content, $utf8NoBom)
Write-Host "OK  Wrote $newName"

Write-Host "-> Regenerating .htm for $newDate"
& (Join-Path $PSScriptRoot 'build-html.ps1') -Source $newPath
