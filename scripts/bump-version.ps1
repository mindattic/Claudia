<#
.SYNOPSIS
    Bump Claudia_vN.md to the next version and regenerate the PDF.

.DESCRIPTION
    Finds the highest-numbered Claudia_v*.md, copies it to Claudia_v(N+1).md,
    rewrites the "(vN)" / "v3"-style tags inside the new file, then invokes
    build-pdf.ps1 to produce the matching .pdf.

    The previous version is left untouched so you have a permanent diff target.

.PARAMETER To
    Optional explicit target version number (e.g. -To 5). Defaults to latest+1.

.EXAMPLE
    .\scripts\bump-version.ps1
    .\scripts\bump-version.ps1 -To 5
#>
[CmdletBinding()]
param(
    [int]$To
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

$guides = Get-ChildItem -Path $repoRoot -Filter 'Claudia_v*.md' -File | ForEach-Object {
    if ($_.BaseName -match 'Claudia_v(\d+)$') {
        [pscustomobject]@{ Version = [int]$Matches[1]; File = $_ }
    }
} | Sort-Object Version

if (-not $guides) { Write-Error "No Claudia_v*.md found in $repoRoot" }

$current = $guides[-1]
$nextVersion = if ($PSBoundParameters.ContainsKey('To')) { $To } else { $current.Version + 1 }

if ($nextVersion -le $current.Version) {
    Write-Error "Target version v$nextVersion is not greater than current v$($current.Version)."
}

$newName = "Claudia_v$nextVersion.md"
$newPath = Join-Path $repoRoot $newName

if (Test-Path $newPath) {
    Write-Error "$newName already exists. Delete it or pick a different -To."
}

Write-Host "-> Bumping v$($current.Version) -> v$nextVersion"
Copy-Item -Path $current.File.FullName -Destination $newPath

# Rewrite version references inside the new file.
$content = Get-Content -Path $newPath -Raw

$replacements = @{
    "Build Guide (v$($current.Version))" = "Build Guide (v$nextVersion)"
    "What's new in v$($current.Version)" = "What's new in v$nextVersion"
    "(vs. v$(($current.Version) - 1))" = "(vs. v$($current.Version))"
    "— v$($current.Version),"           = "— v$nextVersion,"
}
foreach ($k in $replacements.Keys) {
    $content = $content.Replace($k, $replacements[$k])
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($newPath, $content, $utf8NoBom)
Write-Host "OK  Wrote $newName"

Write-Host "-> Regenerating .htm for v$nextVersion"
& (Join-Path $PSScriptRoot 'build-html.ps1') -Source $newPath
