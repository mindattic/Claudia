# pull-latest-finisher.ps1
# Spawned (detached + hidden) by Claudia.Console pull-latest.
# Waits for the Console PowerShell process to exit so it can release file
# handles on Claudia.Console.ps1, then mirrors the staged tree over the repo.

param(
    [Parameter(Mandatory)] [int]    $WaitPid,
    [Parameter(Mandatory)] [string] $Stage,
    [Parameter(Mandatory)] [string] $Repo,
    [Parameter(Mandatory)] [string] $Log
)

$ErrorActionPreference = 'Continue'

function Write-Log([string]$msg) {
    ('[' + (Get-Date -Format s) + '] ' + $msg) | Add-Content -Path $Log
}

Write-Log "helper start. waiting on PID $WaitPid"

# Wait for the launching PowerShell to release file handles.
$tries = 0
while ($tries -lt 240) {   # ~2 minutes max
    if (-not (Get-Process -Id $WaitPid -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 500
    $tries++
}
Write-Log ("parent gone after " + $tries + " waits. copying " + $Stage + " -> " + $Repo)

# Robocopy mirror, but skip .git / node_modules / .vs (they shouldn't roundtrip
# through the temp clone, and skipping them keeps the pull idempotent and fast).
$rc = Start-Process -FilePath robocopy -ArgumentList @(
    ('"' + $Stage + '"'),
    ('"' + $Repo  + '"'),
    '/E', '/XO',
    '/XD', '.git', 'node_modules', '.vs',
    '/R:2', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS'
) -NoNewWindow -Wait -PassThru

Write-Log ("robocopy exit " + $rc.ExitCode + " - codes 0..7 mean success")

Remove-Item -LiteralPath $Stage -Recurse -Force -ErrorAction SilentlyContinue
Write-Log 'done.'
