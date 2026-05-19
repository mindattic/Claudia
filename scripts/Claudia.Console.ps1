<#
.SYNOPSIS
    Claudia console - local builder tasks + remote Pi (claudebox) configuration.

.DESCRIPTION
    Single entry point for both:
      - Local dev: install Node deps, render PDFs, bump guide versions.
      - Remote Pi: auto-detect "claudebox" on the LAN, then edit its .env
        (wake word, Claude model, system prompt), tail logs, restart the
        chatbot service, or run the on-device healthcheck.

    Run without arguments to get an interactive menu. Run with a command name
    to dispatch directly. Commands are dispatch-table-driven so adding new
    ones (set-tts, set-stt, update-image) is one entry away.

.PARAMETER Command
    The command to run. See 'help' for the current list.

.PARAMETER Rest
    Positional arguments for the command.

.EXAMPLE
    .\scripts\Claudia.Console.ps1                       # interactive menu
    .\scripts\Claudia.Console.ps1 detect                # find the Pi on the LAN
    .\scripts\Claudia.Console.ps1 set-wakeword "hey claudia"
    .\scripts\Claudia.Console.ps1 set-model claude-sonnet-4-6
    .\scripts\Claudia.Console.ps1 logs
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Command,

    [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
    [string[]]$Rest
)

$ErrorActionPreference = 'Stop'
$repoRoot   = Split-Path -Parent $PSScriptRoot
$configDir  = Join-Path $repoRoot 'config'
$statePath  = Join-Path $configDir 'console.json'

# Windows PowerShell 5.1's "-Encoding UTF8" writes UTF-8 *with* BOM, which
# breaks JSON parsers (npm, node, jq). Use this helper for every JSON / file
# write so output is portable.
function Write-Utf8NoBom([string]$Path, [string]$Content) {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

# --- Pretty output --------------------------------------------------------
function Write-Info($msg) { Write-Host ('-> ' + $msg) -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host ('OK  ' + $msg) -ForegroundColor Green }
function Write-Warn2($msg) { Write-Host ('!!  ' + $msg) -ForegroundColor Yellow }
function Write-Err2($msg)  { Write-Host ('XX  ' + $msg) -ForegroundColor Red }

# --- State (which Pi we talk to) ------------------------------------------
function Get-State {
    if (Test-Path $statePath) {
        try { return Get-Content $statePath -Raw | ConvertFrom-Json } catch {}
    }
    return [pscustomobject]@{
        host    = 'claudebox.local'
        user    = 'pi'
        envPath = '/home/pi/whisplay-ai-chatbot/.env'
    }
}

function Save-State($state) {
    if (-not (Test-Path $configDir)) { New-Item -ItemType Directory -Path $configDir | Out-Null }
    Write-Utf8NoBom -Path $statePath -Content ($state | ConvertTo-Json -Depth 5)
}

# --- Pi discovery ---------------------------------------------------------
function Test-PiReachable($hostName) {
    try { $null = Resolve-DnsName -Name $hostName -ErrorAction Stop -QuickTimeout } catch { return $false }
    try {
        $tcp = New-Object Net.Sockets.TcpClient
        $iar = $tcp.BeginConnect($hostName, 22, $null, $null)
        $ok  = $iar.AsyncWaitHandle.WaitOne(2500, $false)
        if ($ok -and $tcp.Connected) { $tcp.EndConnect($iar); $tcp.Close(); return $true }
        $tcp.Close()
    } catch {}
    return $false
}

function Find-Pi {
    $state = Get-State
    $candidates = @($state.host, 'claudebox.local', 'raspberrypi.local') | Select-Object -Unique
    foreach ($name in $candidates) {
        Write-Info "probing $name ..."
        if (Test-PiReachable $name) {
            Write-Ok "found Claudia at $name"
            $state.host = $name
            Save-State $state
            return $name
        }
    }
    Write-Err2 "no Pi reachable. Power it on, wait ~60s, confirm the same Wi-Fi, and retry."
    Write-Warn2 "tip: find its IP in your router admin page, then: Claudia.Console set-host <ip>"
    return $null
}

# --- SSH helpers ----------------------------------------------------------
function Require-Ssh {
    if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
        throw "OpenSSH client not found on PATH. Windows: 'Add optional feature -> OpenSSH Client'."
    }
}

function Invoke-Pi($remoteCommand) {
    Require-Ssh
    $state = Get-State
    if (-not (Test-PiReachable $state.host)) {
        Write-Warn2 "$($state.host) not reachable - running detect ..."
        if (-not (Find-Pi)) { throw "Pi unreachable." }
        $state = Get-State
    }
    & ssh -o ConnectTimeout=5 ($state.user + '@' + $state.host) $remoteCommand
}

# Set or replace a KEY=value line in the remote .env.
function Set-RemoteEnv($key, $value) {
    $state = Get-State
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($value))

    $template = @'
set -e
F='__ENV__'
[ -f "$F" ] || (echo "missing $F" && exit 1)
V=$(echo '__B64__' | base64 -d)
grep -v '^__KEY__=' "$F" > "$F.tmp" || true
printf '%s=%s\n' '__KEY__' "$V" >> "$F.tmp"
mv "$F.tmp" "$F"
echo "set __KEY__"
'@
    $remote = $template.Replace('__ENV__', $state.envPath).Replace('__B64__', $b64).Replace('__KEY__', $key)
    Invoke-Pi $remote
}

# --- Command implementations ---------------------------------------------
function Cmd-Detect      { Find-Pi | Out-Null }

function Cmd-SetHost($a) {
    if (-not $a -or $a.Count -lt 1) { throw "Usage: set-host <name-or-ip> [user]" }
    $state = Get-State
    $state.host = $a[0]
    if ($a.Count -ge 2) { $state.user = $a[1] }
    Save-State $state
    Write-Ok ("host = {0}, user = {1}" -f $state.host, $state.user)
}

function Cmd-Shell {
    Require-Ssh
    $state = Get-State
    & ssh ($state.user + '@' + $state.host)
}

function Cmd-Status  { Invoke-Pi 'sudo systemctl status chatbot.service --no-pager || true' }
function Cmd-Restart { Invoke-Pi 'sudo systemctl restart chatbot.service && echo restarted' }
function Cmd-Logs    { Invoke-Pi 'journalctl -u chatbot.service -f -n 50' }

function Cmd-Healthcheck {
    Require-Ssh
    $state = Get-State
    $local = Join-Path $PSScriptRoot 'healthcheck.sh'
    if (-not (Test-Path $local)) { throw "healthcheck.sh not found at $local" }
    Write-Info "uploading healthcheck.sh"
    & scp $local ($state.user + '@' + $state.host + ':/home/' + $state.user + '/healthcheck.sh')
    if ($LASTEXITCODE -ne 0) { throw "scp failed" }
    Invoke-Pi "chmod +x ~/healthcheck.sh && bash ~/healthcheck.sh"
}

function Cmd-SetWakeword($a) {
    if (-not $a -or $a.Count -lt 1) { throw 'Usage: set-wakeword "hey claudia"' }
    $word = ($a -join ' ').Trim('"').Trim()
    Set-RemoteEnv 'WAKE_WORD' $word
    Write-Warn2 'wake-word activation needs the wake-word engine - see Part 9 of the guide.'
}

function Cmd-SetModel($a) {
    if (-not $a -or $a.Count -lt 1) { throw 'Usage: set-model claude-haiku-4-5-20251001' }
    Set-RemoteEnv 'ANTHROPIC_MODEL' $a[0]
    Write-Warn2 'restart the service for it to take effect:  Claudia.Console restart'
}

function Cmd-SetPrompt($a) {
    if (-not $a -or $a.Count -lt 1) { throw 'Usage: set-prompt "You are a concise voice assistant..."' }
    $text = ($a -join ' ').Trim('"')
    Set-RemoteEnv 'SYSTEM_PROMPT' $text
}

function Cmd-SetApiKey($a) {
    if (-not $a -or $a.Count -lt 1) { throw 'Usage: set-apikey sk-ant-...' }
    Set-RemoteEnv 'ANTHROPIC_API_KEY' $a[0]
    Write-Ok 'key updated. Restart:  Claudia.Console restart'
}

function Cmd-ShowConfig {
    Invoke-Pi 'sed -E "s/(ANTHROPIC_API_KEY=)(sk-[A-Za-z0-9_-]{4}).*/\1\2...(masked)/" $HOME/whisplay-ai-chatbot/.env'
}

function Cmd-Update($a) {
    $clean = $a -contains '--clean'

    if (-not (Get-Command node -ErrorAction SilentlyContinue) -or
        -not (Get-Command npm  -ErrorAction SilentlyContinue)) {
        throw "Node.js / npm not found on PATH. Install from https://nodejs.org."
    }
    Write-Info ("node {0}   npm {1}" -f (& node --version), (& npm --version))

    $pkgPath = Join-Path $repoRoot 'package.json'
    if (-not (Test-Path $pkgPath)) {
        Write-Info 'creating package.json'
        $pkgJson = @'
{
  "name": "claudia-build-tools",
  "version": "1.0.0",
  "private": true,
  "description": "Local builder deps for the Claudia voice assistant box guide (markdown -> self-contained HTML).",
  "scripts": {
    "build:html": "node scripts/build-html.js",
    "bump":       "powershell -ExecutionPolicy Bypass -File scripts/bump-version.ps1"
  },
  "dependencies": {
    "marked": "^4.3.0",
    "highlight.js": "^11.9.0"
  }
}
'@
        Write-Utf8NoBom -Path $pkgPath -Content $pkgJson
    }

    Push-Location $repoRoot
    try {
        if ($clean) {
            $nm   = Join-Path $repoRoot 'node_modules'
            $lock = Join-Path $repoRoot 'package-lock.json'
            if (Test-Path $nm)   { Write-Info 'removing node_modules';      Remove-Item $nm -Recurse -Force }
            if (Test-Path $lock) { Write-Info 'removing package-lock.json'; Remove-Item $lock -Force }
        }
        Write-Info 'npm install'
        & npm install --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw "npm install failed (exit $LASTEXITCODE)" }
    } finally { Pop-Location }
    Write-Ok 'deps ready'
}

function Cmd-BuildHtml($a) {
    $script = Join-Path $PSScriptRoot 'build-html.ps1'
    if ($a -and $a.Count -gt 0) { & $script -Source $a[0] } else { & $script }
}

function Cmd-FetchImages($a) {
    # Force-refreshes every part image from its remote URL, ignoring the
    # local cache. Useful when the cache was poisoned by 404s the first time
    # and the vendor has since restored the asset. Local overrides under
    # config/images/ still win over fetched results.
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw "Node.js not found on PATH."
    }
    $builder = Join-Path $PSScriptRoot 'build-html.js'
    Push-Location $repoRoot
    try {
        & node $builder --refresh-images
        if ($LASTEXITCODE -ne 0) { throw "build-html --refresh-images failed (exit $LASTEXITCODE)" }
    } finally { Pop-Location }
    Write-Ok 'image cache refreshed.'
}

function Cmd-Bump($a) {
    $script = Join-Path $PSScriptRoot 'bump-version.ps1'
    if ($a -and $a.Count -gt 0) { & $script -To ([int]$a[0]) } else { & $script }
}

# --- Deal-finder ----------------------------------------------------------
function Read-PartsCatalog {
    $path = Join-Path $configDir 'parts.json'
    if (-not (Test-Path $path)) { throw "config/parts.json not found." }
    return Get-Content $path -Raw | ConvertFrom-Json
}

function Write-PartsCatalog($catalog) {
    $path = Join-Path $configDir 'parts.json'
    Write-Utf8NoBom -Path $path -Content ($catalog | ConvertTo-Json -Depth 10)
}

function Open-Url($url) {
    if (-not $url) { return }
    Start-Process $url | Out-Null
    Start-Sleep -Milliseconds 350   # let the browser breathe between tabs
}

function Cmd-FindDeals($a) {
    $catalog = Read-PartsCatalog
    $filterCategory = $null
    if ($a -and $a.Count -ge 1 -and $a[0] -ne '--all') { $filterCategory = $a[0] }

    $parts = $catalog.parts
    if ($filterCategory) {
        $parts = $parts | Where-Object { $_.category -eq $filterCategory }
        if (-not $parts) { Write-Warn2 "no parts in category '$filterCategory'"; return }
    }

    Write-Info ("walking " + $parts.Count + " parts. Priority: Search-for -> Amazon -> Official -> Reputable.")
    Write-Warn2 "browser tabs will open per part. Pick the best deal, then paste the URL back here."
    Write-Host ""

    if (-not $catalog.chosen) { $catalog | Add-Member -NotePropertyName chosen -NotePropertyValue ([pscustomobject]@{}) -Force }

    foreach ($p in $parts) {
        Write-Host ""
        Write-Host ("=== " + $p.name + "  [" + $p.category + "]") -ForegroundColor Cyan
        if ($p.note) { Write-Host ("    note: " + $p.note) -ForegroundColor DarkGray }

        # 1. Search-for label (always first)
        if ($p.searchFor) {
            Write-Host "    Search for ... (opening)"
            Open-Url $p.searchFor
        }

        # 2. Tier links in declared order (amazon -> official -> reputable)
        $byTier = $p.tiers | Group-Object tier | ForEach-Object { @{ Key = $_.Name; Items = $_.Group } }
        foreach ($tierName in @('amazon', 'official', 'reputable')) {
            $bucket = $byTier | Where-Object { $_.Key -eq $tierName }
            if (-not $bucket) { continue }
            foreach ($t in $bucket.Items) {
                Write-Host ("    " + $tierName.PadRight(10) + " " + $t.url)
                Open-Url $t.url
            }
        }

        $pick = Read-Host "    pick (paste URL, ENTER to skip, 's' to stop)"
        if ($pick -eq 's' -or $pick -eq 'stop') { break }
        if ($pick) {
            # Save chosen URL keyed by part id.
            $catalog.chosen | Add-Member -NotePropertyName $p.id -NotePropertyValue $pick -Force
            Write-Ok ("saved " + $p.id + " -> " + $pick)
        }
    }

    Write-PartsCatalog $catalog
    Write-Host ""
    Write-Ok "choices saved to config/parts.json. Run 'apply-deals' to stamp them into the guide."
}

function Cmd-ApplyDeals {
    $catalog = Read-PartsCatalog
    if (-not $catalog.chosen -or -not $catalog.chosen.PSObject.Properties.Name.Count) {
        Write-Warn2 "no chosen URLs yet. Run 'find-deals' first."
        return
    }

    # Find newest Claudia_v*.md
    $guide = Get-ChildItem -Path $repoRoot -Filter 'Claudia_v*.md' -File |
        Sort-Object { if ($_.BaseName -match 'Claudia_v(\d+)$') { [int]$Matches[1] } else { 0 } } |
        Select-Object -Last 1
    if (-not $guide) { throw "no Claudia_v*.md found." }
    Write-Info ("editing " + $guide.Name)

    $content = Get-Content $guide.FullName -Raw
    $changed = 0; $skipped = 0

    foreach ($p in $catalog.parts) {
        $url = $catalog.chosen.($p.id)
        if (-not $url) { continue }
        $match = $p.match
        if (-not $content.Contains($match)) {
            Write-Warn2 ("not found in guide: " + $match)
            $skipped++
            continue
        }
        $replacement = "[$match]($url)"
        # If it was already turned into a link, skip.
        if ($content -match [regex]::Escape("[$match](")) {
            # update the URL in the existing link
            $pattern = "\[" + [regex]::Escape($match) + "\]\([^)]+\)"
            $content = [regex]::Replace($content, $pattern, $replacement)
        } else {
            $content = $content.Replace($match, $replacement)
        }
        Write-Ok ($p.id + " -> linked")
        $changed++
    }

    if ($changed -gt 0) {
        Write-Utf8NoBom -Path $guide.FullName -Content $content
        Write-Info ("rewrote " + $guide.Name + " with " + $changed + " links (skipped " + $skipped + ").")
        Write-Info "HTML will auto-rebuild via the .claude hook, or run:  build-html"
    } else {
        Write-Warn2 "nothing changed."
    }
}

function Cmd-PullLatest($a) {
    # `git pull` is safe - git overwrites tracked files directly. But the
    # *current* Claudia.Console.ps1 file is held open by THIS PowerShell
    # process while it runs, which causes a "file is locked" error if the
    # pull touches it. Work around it like an installer would:
    #   1. git fetch + (optional) git stash
    #   2. clone-style diff into a temp dir
    #   3. spawn a detached helper that waits for THIS PID to exit, then
    #      copies the temp tree over the repo, then exits.
    # The user re-launches the Console afterwards.
    $force = $a -contains '--force'

    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw "git not found on PATH."
    }

    Push-Location $repoRoot
    try {
        Write-Info 'git fetch'
        & git fetch --all --prune
        if ($LASTEXITCODE -ne 0) { throw "git fetch failed (exit $LASTEXITCODE)" }

        # Figure out the upstream branch.
        $branch = (& git rev-parse --abbrev-ref HEAD).Trim()
        $upstream = & git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>$null
        if (-not $upstream) {
            Write-Warn2 "no upstream set for branch '$branch' - set one with: git branch --set-upstream-to=origin/$branch"
            return
        }
        Write-Info "branch: $branch   upstream: $upstream"

        $ahead  = [int]((& git rev-list --count "$upstream..HEAD")  -join '')
        $behind = [int]((& git rev-list --count "HEAD..$upstream")  -join '')
        Write-Info ("ahead $ahead   behind $behind")

        if ($behind -eq 0) {
            Write-Ok 'already up to date.'
            return
        }

        # Refuse to clobber dirty tree unless --force.
        $dirty = (& git status --porcelain) -join "`n"
        if ($dirty -and -not $force) {
            Write-Warn2 'working tree is dirty:'
            Write-Host $dirty
            Write-Warn2 're-run as `pull-latest --force` to overwrite, or commit/stash first.'
            return
        }
    }
    finally { Pop-Location }

    # Stage the new tree in TEMP, then hand off to a detached helper that
    # waits for *this* PID to die before clobbering the repo (so the live
    # .ps1 file isn't held open by us when the copy hits it).
    $stamp   = (Get-Date).ToString('yyyyMMdd_HHmmss')
    $stage   = Join-Path ([System.IO.Path]::GetTempPath()) ("claudia-update-" + $stamp)
    $helper  = Join-Path ([System.IO.Path]::GetTempPath()) ("claudia-update-" + $stamp + ".ps1")
    $logPath = Join-Path $repoRoot '.claude\pull-latest.log'
    if (-not (Test-Path (Split-Path $logPath))) { New-Item -ItemType Directory -Path (Split-Path $logPath) | Out-Null }

    Write-Info ("staging into " + $stage)
    & git clone --quiet --branch $branch "$repoRoot" "$stage"
    if ($LASTEXITCODE -ne 0) { throw "stage clone failed" }

    Push-Location $stage
    try {
        & git fetch origin --quiet
        & git reset --hard ("origin/" + $branch) | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "stage reset failed" }
    }
    finally { Pop-Location }

    $myPid = $PID
    # Copy the helper to TEMP so it survives even if the user nukes the repo.
    $finisherSrc = Join-Path $PSScriptRoot 'pull-latest-finisher.ps1'
    if (-not (Test-Path $finisherSrc)) { throw "missing helper: $finisherSrc" }
    Copy-Item -Path $finisherSrc -Destination $helper -Force

    Write-Ok 'staged. spawning detached helper to finish the copy after this process exits.'
    Write-Info ("helper script: " + $helper)
    Write-Info ("log file     : " + $logPath)

    Start-Process -FilePath 'powershell.exe' -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
        '-File', $helper,
        '-WaitPid', $myPid,
        '-Stage',   $stage,
        '-Repo',    $repoRoot,
        '-Log',     $logPath
    ) -WindowStyle Hidden | Out-Null

    Write-Warn2 'EXIT this Console now so locked files release. Then relaunch:'
    Write-Warn2 '    Claudia.Console.bat'
    Write-Warn2 "(Watch progress in $logPath)"
}

function Cmd-SelfUpdate($a) {
    # Three things age out and quietly break the build:
    #   1. node_modules (md-to-pdf + puppeteer security advisories)
    #   2. The parts catalog (vendors discontinue, newer revisions appear)
    #   3. The Claude model ID baked into env.template
    # Walk all three. Each step is independent so partial failure is fine.
    $skipDeps   = $a -contains '--no-deps'
    $skipParts  = $a -contains '--no-parts'
    $skipModels = $a -contains '--no-models'

    if (-not $skipDeps) {
        Write-Info '== Node dependencies =='
        if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
            Write-Warn2 'npm not on PATH - skipping dep refresh.'
        } else {
            Push-Location $repoRoot
            try {
                Write-Info 'npm outdated:'
                & npm outdated 2>&1 | Out-Host
                Write-Info 'npm update (respecting semver in package.json)'
                & npm update --no-audit --no-fund
                Write-Info 'npm audit fix (non-breaking only)'
                & npm audit fix 2>&1 | Out-Host
                Write-Ok 'deps refreshed'
            } finally { Pop-Location }
        }
    }

    if (-not $skipParts) {
        Write-Info ''
        Write-Info '== Parts catalog freshness =='
        Write-Info 'opening "is there a newer version of X?" searches for every part.'
        Write-Warn2 'review each tab. If a successor part exists, edit config/parts.json to point at it.'
        $catalog = Read-PartsCatalog
        foreach ($p in $catalog.parts) {
            $q = ('newer+version+of+' + ($p.name -replace ' ', '+') + '+2025+2026')
            $url = 'https://www.google.com/search?q=' + $q
            Write-Host ('    ' + $p.id + ' -> ' + $url) -ForegroundColor DarkGray
            Open-Url $url
        }
    }

    if (-not $skipModels) {
        Write-Info ''
        Write-Info '== Claude model catalog =='
        Write-Info 'official model list:'
        $url = 'https://docs.claude.com/en/docs/about-claude/models/overview'
        Write-Host ('    ' + $url) -ForegroundColor DarkGray
        Open-Url $url
        Write-Warn2 'If a newer model ID is available (e.g. Haiku 4.6+), update:'
        Write-Warn2 '  - config/env.template (ANTHROPIC_MODEL=...)'
        Write-Warn2 '  - Claudia_v3.md Part 6 table'
        Write-Warn2 '  - the Pi if a unit is deployed:  Claudia.Console set-model <id>'
    }

    Write-Info ''
    Write-Info '== Best-practice notes =='
    Write-Host '  - regenerate the PDF after editing the .md:    build-pdf'
    Write-Host '  - lockfile churn?  pull-latest --force         (re-syncs against origin/main)'
    Write-Host '  - dependabot-style nag without dependabot:     run self-update monthly'
    Write-Ok 'self-update walk done.'
}

function Cmd-ListParts {
    $catalog = Read-PartsCatalog
    foreach ($cat in $catalog.categories.PSObject.Properties.Name) {
        $catParts = $catalog.parts | Where-Object { $_.category -eq $cat }
        if (-not $catParts) { continue }
        Write-Host ""
        Write-Host ("[$cat] " + $catalog.categories.$cat) -ForegroundColor Cyan
        foreach ($p in $catParts) {
            $chosen = $catalog.chosen.($p.id)
            $status = if ($chosen) { 'chosen: ' + $chosen } else { '(no URL chosen yet)' }
            Write-Host ("  - " + $p.name)
            Write-Host ("      " + $status) -ForegroundColor DarkGray
        }
    }
    Write-Host ""
}

# --- Dispatch table -------------------------------------------------------
$commands = [ordered]@{
    'help'         = @{ Help = 'List available commands.';                                                                    Action = { Show-Help } }
    'detect'       = @{ Help = 'Find Claudia (the Pi) on the LAN. Saves the host for later commands.';                        Action = { Cmd-Detect } }
    'set-host'     = @{ Help = 'Override the Pi hostname/IP. Usage: set-host <name-or-ip> [user]';                            Action = { param($a) Cmd-SetHost $a } }
    'shell'        = @{ Help = 'Open an interactive SSH session to Claudia.';                                                 Action = { Cmd-Shell } }
    'status'       = @{ Help = 'Show chatbot.service status on Claudia.';                                                     Action = { Cmd-Status } }
    'restart'      = @{ Help = 'Restart chatbot.service on Claudia.';                                                         Action = { Cmd-Restart } }
    'logs'         = @{ Help = 'Tail Claudia chatbot logs (Ctrl+C to stop).';                                                 Action = { Cmd-Logs } }
    'healthcheck'  = @{ Help = 'Copy scripts/healthcheck.sh to Claudia and run it.';                                          Action = { Cmd-Healthcheck } }
    'set-wakeword' = @{ Help = 'Set WAKE_WORD on the Pi. Usage: set-wakeword "hey claudia"';                                  Action = { param($a) Cmd-SetWakeword $a } }
    'set-model'    = @{ Help = 'Set ANTHROPIC_MODEL on the Pi. Usage: set-model <model-id>';                                  Action = { param($a) Cmd-SetModel $a } }
    'set-prompt'   = @{ Help = 'Set SYSTEM_PROMPT on the Pi. Usage: set-prompt "<text>"';                                     Action = { param($a) Cmd-SetPrompt $a } }
    'set-apikey'   = @{ Help = 'Set ANTHROPIC_API_KEY on the Pi. Usage: set-apikey sk-ant-...';                               Action = { param($a) Cmd-SetApiKey $a } }
    'show-config'  = @{ Help = 'Print the remote .env (api key masked).';                                                     Action = { Cmd-ShowConfig } }
    'update'       = @{ Help = 'Install/refresh local Node deps. Add --clean to wipe node_modules.';                          Action = { param($a) Cmd-Update $a } }
    'build-html'   = @{ Help = 'Render the latest (or a specific) Claudia_v*.md to a self-contained .htm.';                  Action = { param($a) Cmd-BuildHtml $a } }
    'fetch-images' = @{ Help = 'Force-refresh every part image from its remote URL (ignores cache, keeps local overrides).'; Action = { param($a) Cmd-FetchImages $a } }
    'bump'         = @{ Help = 'Copy Claudia_vN.md to Claudia_v(N+1).md and rebuild the .htm.';                               Action = { param($a) Cmd-Bump $a } }
    'list-parts'   = @{ Help = 'List parts catalog + which have a chosen URL.';                                               Action = { Cmd-ListParts } }
    'find-deals'   = @{ Help = 'Open Amazon/official/reputable tabs per part; save your picks. [core|mic|portable|smarthome|--all]'; Action = { param($a) Cmd-FindDeals $a } }
    'apply-deals'  = @{ Help = 'Stamp chosen URLs into the latest Claudia_v*.md.';                                            Action = { Cmd-ApplyDeals } }
    'pull-latest'  = @{ Help = 'git fetch + overlay latest source. Add --force if working tree is dirty.';                    Action = { param($a) Cmd-PullLatest $a } }
    'self-update'  = @{ Help = 'Refresh node_modules + open "is there a newer version?" searches for every part / Claude model.'; Action = { param($a) Cmd-SelfUpdate $a } }
}

# --- UI ------------------------------------------------------------------
function Show-Help {
    Write-Host ""
    Write-Host "  Claudia Console" -ForegroundColor Cyan
    Write-Host "  ---------------"
    $state = Get-State
    Write-Host ("  target Pi  : " + $state.user + '@' + $state.host)
    Write-Host ""
    Write-Host "  Commands:" -ForegroundColor Yellow
    foreach ($k in $commands.Keys) {
        Write-Host ("    {0,-14} {1}" -f $k, $commands[$k].Help)
    }
    Write-Host ""
    Write-Host "  Examples:" -ForegroundColor Yellow
    Write-Host "    Claudia.Console detect"
    Write-Host "    Claudia.Console set-model claude-sonnet-4-6"
    Write-Host "    Claudia.Console logs"
    Write-Host ""
}

function Invoke-ClaudiaCommand([string]$Name, [string[]]$Args2) {
    if (-not $commands.Contains($Name)) {
        Write-Err2 "unknown command: $Name"
        Show-Help
        exit 2
    }
    & $commands[$Name].Action $Args2
}

function Show-Menu {
    while ($true) {
        Show-Help
        $pick = Read-Host "Command (or 'quit')"
        if (-not $pick -or $pick -eq 'quit' -or $pick -eq 'exit' -or $pick -eq 'q') { return }
        $parts = $pick.Trim() -split '\s+', 2
        $cmd   = $parts[0]
        $rest2 = if ($parts.Count -gt 1) { $parts[1] -split '\s+' } else { @() }
        try {
            Invoke-ClaudiaCommand -Name $cmd -Args2 $rest2
        } catch {
            Write-Err2 $_.Exception.Message
        }
        Write-Host ""
        Read-Host "press ENTER to continue" | Out-Null
    }
}

if (-not $Command) { Show-Menu; exit 0 }
Invoke-ClaudiaCommand -Name $Command -Args2 $Rest
