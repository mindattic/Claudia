<#
.SYNOPSIS
  Codex CLI for the Claudia repo - `doctor` (validate the canon) and `digest` (regenerate
  docs/BIBLE.digest.md). No build step; runs on Windows PowerShell 5.1 and PowerShell 7+.

.USAGE
  powershell -NoProfile -ExecutionPolicy Bypass -File tools/codex.ps1 doctor
  powershell -NoProfile -ExecutionPolicy Bypass -File tools/codex.ps1 digest
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('doctor', 'digest')]
  [string]$Command = 'doctor'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Repo root = parent of the tools/ dir this script lives in.
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$DocsDir  = Join-Path $RepoRoot 'docs'
$DigestPath = Join-Path $DocsDir 'BIBLE.digest.md'
$BiblePath  = Join-Path $DocsDir 'BIBLE.md'

# Status emoji as runtime chars so this source file stays pure ASCII (PS 5.1 reads the
# file as Win-1252 and would otherwise corrupt literal emoji).
$EMO_DONE    = [char]::ConvertFromUtf32(0x2705)    # white heavy check mark
$EMO_PARTIAL = [char]::ConvertFromUtf32(0x1F7E1)   # yellow circle
$EMO_PLANNED = [char]::ConvertFromUtf32(0x2B1C)    # white large square
$EMO_CUT     = [char]::ConvertFromUtf32(0x1F5D1)   # wastebasket

$script:Errors   = New-Object System.Collections.Generic.List[string]
$script:Warnings = New-Object System.Collections.Generic.List[string]
function Add-Err ($m)  { $script:Errors.Add($m) }
function Add-Warn ($m) { $script:Warnings.Add($m) }

# ---- helpers ---------------------------------------------------------------

# Read a file as UTF-8 regardless of PS edition (PS 5.1 -Raw defaults to the ANSI codepage,
# which corrupts emoji/box-drawing). Always use this for canon docs.
function Read-Utf8 ($path) {
  return [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
}

function Get-RelPath ($full) {
  $r = $full.Replace($RepoRoot, '').TrimStart('\', '/')
  return ($r -replace '\\', '/')
}

# Parse a leading YAML front-matter block (--- ... ---). Returns a hashtable or $null.
function Get-FrontMatter ($text) {
  $bom = [char]0xFEFF
  if ($text -notmatch ('^' + $bom + '?---\r?\n')) { return $null }
  $lines = $text -split "\r?\n"
  # find the line index of the first '---' and the closing '---'
  $start = -1; $end = -1
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].TrimStart([char]0xFEFF) -eq '---') { $start = $i; break }
  }
  if ($start -lt 0) { return $null }
  for ($i = $start + 1; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -eq '---') { $end = $i; break }
  }
  if ($end -lt 0) { return $null }
  $map = @{}
  for ($i = $start + 1; $i -lt $end; $i++) {
    $line = $lines[$i]
    if ($line -match '^\s*([A-Za-z0-9_]+)\s*:\s*(.*)$') {
      $map[$matches[1]] = $matches[2].Trim()
    }
  }
  return $map
}

$ValidLayers   = @('bible', 'stories', 'amendments', 'rfc', 'data', 'houserules')
$ValidStatuses = @('living', 'done', 'partial', 'planned', 'cut')

function Test-FrontMatter ($fm, $rel) {
  if ($null -eq $fm) { Add-Err "$rel : missing or malformed YAML front-matter"; return }
  foreach ($k in @('codex', 'project', 'code', 'layer', 'status', 'updated')) {
    if (-not $fm.ContainsKey($k)) { Add-Err "$rel : front-matter missing key '$k'" }
  }
  if ($fm.ContainsKey('codex')  -and $fm['codex'] -ne '1') { Add-Err "$rel : front-matter 'codex' must be 1" }
  if ($fm.ContainsKey('layer')  -and ($ValidLayers -notcontains $fm['layer']))     { Add-Err "$rel : invalid layer '$($fm['layer'])'" }
  if ($fm.ContainsKey('status') -and ($ValidStatuses -notcontains $fm['status']))  { Add-Err "$rel : invalid status '$($fm['status'])'" }
  if ($fm.ContainsKey('updated') -and ($fm['updated'] -notmatch '^\d{4}-\d{2}-\d{2}$')) { Add-Err "$rel : 'updated' must be YYYY-MM-DD" }
}

# ---- collect markdown canon files -----------------------------------------

function Get-CanonMarkdown {
  $files = @()
  foreach ($n in @('BIBLE.md', 'USER_STORIES.md', 'AMENDMENTS.md')) {
    $p = Join-Path $DocsDir $n
    if (Test-Path $p) { $files += $p }
  }
  $rfcDir = Join-Path $DocsDir 'rfc'
  if (Test-Path $rfcDir) {
    $files += (Get-ChildItem $rfcDir -Filter '*.md' -File | ForEach-Object { $_.FullName })
  }
  return $files
}

# ---- DOCTOR ----------------------------------------------------------------

function Invoke-Doctor {
  Write-Host ''
  Write-Host 'Codex doctor - Claudia' -ForegroundColor Cyan
  Write-Host '======================'

  if (-not (Test-Path $BiblePath)) { Add-Err 'docs/BIBLE.md not found' }

  $mdFiles = Get-CanonMarkdown
  $allText = @{}

  # 1. front-matter on every canon markdown file
  foreach ($f in $mdFiles) {
    $rel  = Get-RelPath $f
    $text = Read-Utf8 $f
    $allText[$f] = $text
    Test-FrontMatter (Get-FrontMatter $text) $rel
  }

  # 2. anchors: collect all {#...} ids; assert uniqueness
  $anchorOwners = @{}   # id -> file rel
  foreach ($f in $mdFiles) {
    $rel = Get-RelPath $f
    $sect = [char]0x00A7
    $anchorRe = '\{#([A-Za-z0-9' + $sect + '\-]+)\}'
    foreach ($m in [regex]::Matches($allText[$f], $anchorRe)) {
      $id = $m.Groups[1].Value
      if ($anchorOwners.ContainsKey($id)) {
        Add-Err "duplicate anchor {#$id} in $rel (already in $($anchorOwners[$id]))"
      } else {
        $anchorOwners[$id] = $rel
      }
    }
  }

  # 3. cross-refs: every markdown link target with a #fragment must resolve.
  #    Link forms: (path#frag) or (#frag). 'path' is relative to the file's dir.
  foreach ($f in $mdFiles) {
    $rel = Get-RelPath $f
    $dir = Split-Path -Parent $f
    foreach ($m in [regex]::Matches($allText[$f], '\]\(([^)\s]+)\)')) {
      $target = $m.Groups[1].Value
      if ($target -match '^[a-z]+://') { continue }     # external URL
      $path = $target; $frag = $null
      if ($target -match '^(.*?)#(.+)$') { $path = $matches[1]; $frag = $matches[2] }
      # resolve the file part (if any) relative to this doc
      if ($path -ne '') {
        $resolved = [System.IO.Path]::GetFullPath((Join-Path $dir $path))
        if (-not (Test-Path $resolved)) {
          Add-Err "$rel : link to missing file '$path'"
          continue
        }
      }
      if ($null -ne $frag) {
        if ($path -eq '') {
          # same-file anchor
          if (-not $anchorOwners.ContainsKey($frag)) {
            # tolerate plain GitHub-style section anchors only if no {#..} system in play -> still error for our ids
            if ($frag -ne 'stories') { Add-Err "$rel : link to unknown anchor #$frag" }
          }
        } else {
          $resolved = [System.IO.Path]::GetFullPath((Join-Path $dir $path))
          $tgtName  = [System.IO.Path]::GetFileName($resolved)
          # only validate fragments that look like our {#..} ids (contain CLA-, HOUSE-, or section sign)
          $fragRe = '(CLA-|HOUSE-|' + [char]0x00A7 + ')'
          if ($frag -match $fragRe) {
            if (-not $anchorOwners.ContainsKey($frag)) {
              # the target file may be outside the canon md set (e.g. HouseRules); check it directly
              if (Test-Path $resolved) {
                $tgtText = Read-Utf8 $resolved
                if ($tgtText -notmatch [regex]::Escape("{#$frag}")) {
                  Add-Err "$rel : link to unknown anchor #$frag in $tgtName"
                }
              } else {
                Add-Err "$rel : link to unknown anchor #$frag (target $tgtName missing)"
              }
            }
          }
        }
      }
    }
  }

  # 4. JSON data files: valid JSON; front-matter (as //front-matter) on registry; schema validation
  $dataDir = Join-Path $DocsDir 'data'
  $partsIndex = Join-Path $dataDir 'parts.index.json'
  $partSchema = Join-Path $dataDir '_schema\part.schema.json'
  $catalog    = Join-Path $RepoRoot 'config\parts.json'

  $indexObj = $null
  if (Test-Path $partsIndex) {
    try {
      $indexObj = (Read-Utf8 $partsIndex) | ConvertFrom-Json
    } catch { Add-Err "docs/data/parts.index.json : invalid JSON - $($_.Exception.Message)" }
    if ($indexObj -and $indexObj.PSObject.Properties.Name -contains '//front-matter') {
      $fm = @{}
      foreach ($p in $indexObj.'//front-matter'.PSObject.Properties) { $fm[$p.Name] = "$($p.Value)" }
      Test-FrontMatter $fm 'docs/data/parts.index.json'
    } else { Add-Err 'docs/data/parts.index.json : missing //front-matter block' }
  } else { Add-Err 'docs/data/parts.index.json not found' }

  $schemaObj = $null
  if (Test-Path $partSchema) {
    try { $schemaObj = (Read-Utf8 $partSchema) | ConvertFrom-Json }
    catch { Add-Err "docs/data/_schema/part.schema.json : invalid JSON - $($_.Exception.Message)" }
  } else { Add-Err 'docs/data/_schema/part.schema.json not found' }

  # 5. validate config/parts.json against the part schema + unique ids
  $catalogIds = @{}
  if (Test-Path $catalog) {
    $catObj = $null
    try { $catObj = (Read-Utf8 $catalog) | ConvertFrom-Json }
    catch { Add-Err "config/parts.json : invalid JSON - $($_.Exception.Message)" }
    if ($catObj) {
      if (-not ($catObj.PSObject.Properties.Name -contains 'pricesAsOf')) {
        Add-Err 'config/parts.json : missing dated pricesAsOf (CLA-LAW-3)'
      }
      if ($catObj.PSObject.Properties.Name -contains 'parts') {
        $catCfgAxes = @()
        if ($catObj.PSObject.Properties.Name -contains 'configAxes') {
          $catCfgAxes = @($catObj.configAxes | ForEach-Object { $_.key })
        }
        foreach ($part in $catObj.parts) {
          Test-PartAgainstSchema $part $schemaObj
          if ($part.PSObject.Properties.Name -contains 'id') {
            if ($catalogIds.ContainsKey($part.id)) { Add-Err "config/parts.json : duplicate part id '$($part.id)'" }
            else { $catalogIds[$part.id] = $true }
          }
          # CLA-LAW-4: a part 'when' key must be a known config axis
          if ($part.PSObject.Properties.Name -contains 'when') {
            foreach ($wk in $part.when.PSObject.Properties.Name) {
              if ($catCfgAxes -notcontains $wk) {
                Add-Err "config/parts.json : part '$($part.id)' when-gate key '$wk' is not a configAxis (CLA-LAW-4)"
              }
            }
          }
        }
      } else { Add-Err 'config/parts.json : no parts[] array' }
    }
  } else { Add-Err 'config/parts.json not found (catalog is the L5 canon store)' }

  # 6. parts.index ids match catalog ids (mirror in sync)
  if ($indexObj -and ($indexObj.PSObject.Properties.Name -contains 'entities')) {
    $seen = @{}
    foreach ($e in $indexObj.entities) {
      if ($seen.ContainsKey($e.id)) { Add-Err "parts.index.json : duplicate entity id '$($e.id)'" }
      else { $seen[$e.id] = $true }
      $slug = $e.id -replace '^part\.', ''
      if (-not $catalogIds.ContainsKey($slug)) {
        Add-Err "parts.index.json : entity '$($e.id)' has no matching part in config/parts.json"
      }
    }
    foreach ($cid in $catalogIds.Keys) {
      if (-not $seen.ContainsKey("part.$cid")) {
        Add-Err "parts.index.json : catalog part '$cid' is not registered (add 'part.$cid')"
      }
    }
  }

  # 7. config/versions.json valid
  $versions = Join-Path $RepoRoot 'config\versions.json'
  if (Test-Path $versions) {
    try { (Read-Utf8 $versions) | ConvertFrom-Json | Out-Null }
    catch { Add-Err "config/versions.json : invalid JSON - $($_.Exception.Message)" }
  }

  # 8. every 'done' story cites a verifying token, and is best-effort findable
  $storiesPath = Join-Path $DocsDir 'USER_STORIES.md'
  if (Test-Path $storiesPath) {
    $sText = $allText[$storiesPath]
    if (-not $sText) { $sText = Read-Utf8 $storiesPath }
    $doneRe = '\*\*(CLA-US-[A-Za-z0-9]+)\s*' + [regex]::Escape($EMO_DONE) + '\*\*([^\n]*\n(?:[^\n]*\n)*?)(?=- \*\*CLA-US-|\r?\n## |\r?\n### |\Z)'
    foreach ($m in [regex]::Matches($sText, $doneRe)) {
      $sid  = $m.Groups[1].Value
      $body = $m.Groups[2].Value
      if ($body -notmatch '(verified by|`[^`]+`)') {
        Add-Err "USER_STORIES.md : story $sid is done but cites no verifying check/test token"
      }
    }
  }

  # 9. cited repo paths in the bible exist
  if (Test-Path $BiblePath) {
    $bText = $allText[$BiblePath]
    if (-not $bText) { $bText = Read-Utf8 $BiblePath }
    $citedPaths = New-Object System.Collections.Generic.HashSet[string]
    foreach ($m in [regex]::Matches($bText, '`((?:config|scripts|tools|docs)/[A-Za-z0-9_./*-]+)`')) {
      [void]$citedPaths.Add($m.Groups[1].Value)
    }
    foreach ($cp in $citedPaths) {
      if ($cp -match '[*]') { continue }   # globs
      $full = Join-Path $RepoRoot ($cp -replace '/', '\')
      if (-not (Test-Path $full)) { Add-Err "BIBLE.md : cited path '$cp' does not exist" }
    }
  }

  # 10. digest freshness: regenerate to temp and compare; warn if stale
  if (Test-Path $BiblePath) {
    $fresh = Build-DigestText
    if (Test-Path $DigestPath) {
      $current = Read-Utf8 $DigestPath
      if ($current.TrimEnd() -ne $fresh.TrimEnd()) {
        Add-Warn "docs/BIBLE.digest.md is out of date - run: codex.ps1 digest"
      }
      # generatedFrom staleness: BIBLE mtime must be <= digest mtime
      $bMt = (Get-Item $BiblePath).LastWriteTimeUtc
      $dMt = (Get-Item $DigestPath).LastWriteTimeUtc
      if ($bMt -gt $dMt) { Add-Warn "docs/BIBLE.digest.md is older than BIBLE.md (regenerate)" }
    } else {
      Add-Err 'docs/BIBLE.digest.md missing - run: codex.ps1 digest'
    }
  }

  # ---- report ----
  Write-Host ''
  if ($script:Warnings.Count -gt 0) {
    Write-Host "Warnings ($($script:Warnings.Count)):" -ForegroundColor Yellow
    foreach ($w in $script:Warnings) { Write-Host "  ! $w" -ForegroundColor Yellow }
    Write-Host ''
  }
  if ($script:Errors.Count -gt 0) {
    Write-Host "FAILED - $($script:Errors.Count) error(s):" -ForegroundColor Red
    foreach ($e in $script:Errors) { Write-Host "  x $e" -ForegroundColor Red }
    Write-Host ''
    exit 1
  }
  Write-Host 'doctor: all checks passed.' -ForegroundColor Green
  exit 0
}

# Minimal JSON-schema validator: handles the subset used by part.schema.json
function Test-PartAgainstSchema ($part, $schema) {
  if (-not $schema) { return }
  $label = if ($part.PSObject.Properties.Name -contains 'id') { $part.id } else { '<no-id>' }
  foreach ($req in $schema.required) {
    if (-not ($part.PSObject.Properties.Name -contains $req)) {
      Add-Err "config/parts.json : part '$label' missing required field '$req'"
    }
  }
  $props = $schema.properties
  foreach ($pn in $part.PSObject.Properties.Name) {
    if (-not ($props.PSObject.Properties.Name -contains $pn)) { continue }
    $spec = $props.$pn
    $val  = $part.$pn
    if ($spec.PSObject.Properties.Name -contains 'type') {
      switch ($spec.type) {
        'string'  { if ($val -isnot [string])  { Add-Err "config/parts.json : part '$label'.$pn must be string" } }
        'integer' { if (-not ($val -is [int] -or $val -is [long])) { Add-Err "config/parts.json : part '$label'.$pn must be integer" } }
        'array'   { if ($val -isnot [System.Array] -and $null -ne $val) { } }
      }
    }
    if ($spec.PSObject.Properties.Name -contains 'enum') {
      if ($spec.enum -notcontains $val) { Add-Err "config/parts.json : part '$label'.$pn = '$val' not in enum [$($spec.enum -join ', ')]" }
    }
    if ($spec.PSObject.Properties.Name -contains 'pattern' -and $val -is [string]) {
      if ($val -notmatch $spec.pattern) { Add-Err "config/parts.json : part '$label'.$pn = '$val' fails pattern $($spec.pattern)" }
    }
  }
  # tiers minItems / inner required
  if ($part.PSObject.Properties.Name -contains 'tiers') {
    if (@($part.tiers).Count -lt 1) { Add-Err "config/parts.json : part '$label' must have >=1 tier" }
    foreach ($t in $part.tiers) {
      foreach ($k in @('tier', 'url')) {
        if (-not ($t.PSObject.Properties.Name -contains $k)) { Add-Err "config/parts.json : part '$label' tier missing '$k'" }
      }
      if (($t.PSObject.Properties.Name -contains 'tier') -and (@('amazon','official','reputable') -notcontains $t.tier)) {
        Add-Err "config/parts.json : part '$label' tier '$($t.tier)' invalid"
      }
    }
  }
}

# ---- DIGEST ----------------------------------------------------------------

# Extract a top-level section's body by its leading number. Matches the heading line
# "## N. Title {#..}" (number anchored, rest of the line consumed without crossing the
# newline) and returns everything up to the next "## " heading.
function Get-Section ($text, $sectionNumber) {
  $pat = '(?m)^##[ \t]+' + $sectionNumber + '\.[^\r\n]*\r?\n(?<body>[\s\S]*?)(?=^##[ \t]|\Z)'
  $m = [regex]::Match($text, $pat)
  if ($m.Success) { return $m.Groups['body'].Value.Trim() }
  return ''
}

function Build-DigestText {
  $b = Read-Utf8 $BiblePath

  $one   = Get-Section $b '1'
  $isnot = Get-Section $b '3'
  $laws  = Get-Section $b '5'
  $gloss = Get-Section $b '9'

  # status index from USER_STORIES.md
  $done = 0; $partial = 0; $planned = 0; $cut = 0
  $sp = Join-Path $DocsDir 'USER_STORIES.md'
  if (Test-Path $sp) {
    $s = Read-Utf8 $sp
    $done    = ([regex]::Matches($s, 'CLA-US-[A-Za-z0-9]+\s*' + [regex]::Escape($EMO_DONE))).Count
    $partial = ([regex]::Matches($s, 'CLA-US-[A-Za-z0-9]+\s*' + [regex]::Escape($EMO_PARTIAL))).Count
    $planned = ([regex]::Matches($s, 'CLA-US-[A-Za-z0-9]+\s*' + [regex]::Escape($EMO_PLANNED))).Count
    $cut     = ([regex]::Matches($s, 'CLA-US-[A-Za-z0-9]+\s*' + [regex]::Escape($EMO_CUT))).Count
  }

  # latest amendment head
  $amendHead = ''
  $ap = Join-Path $DocsDir 'AMENDMENTS.md'
  if (Test-Path $ap) {
    $a = Read-Utf8 $ap
    $am = [regex]::Match($a, '(?ms)^##\s+(CLA-A\d+[^\r\n]*)\r?\n(.*?)(?=^##\s|\Z)')
    if ($am.Success) {
      $head = $am.Groups[1].Value.Trim()
      $body = ($am.Groups[2].Value.Trim() -split "\r?\n" | Select-Object -First 4) -join "`n"
      $amendHead = "## $head`n$body"
    }
  }

  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine('AUTHORITATIVE - full detail in docs/BIBLE.md')
  [void]$sb.AppendLine("<!-- generatedFrom: docs/BIBLE.md -->")
  [void]$sb.AppendLine('')
  [void]$sb.AppendLine('# Claudia - Codex digest')
  [void]$sb.AppendLine('')
  [void]$sb.AppendLine('## 1. The one sentence')
  [void]$sb.AppendLine($one)
  [void]$sb.AppendLine('')
  [void]$sb.AppendLine('## What it is NOT')
  [void]$sb.AppendLine($isnot)
  [void]$sb.AppendLine('')
  [void]$sb.AppendLine('## The Laws')
  [void]$sb.AppendLine($laws)
  [void]$sb.AppendLine('')
  [void]$sb.AppendLine('## Glossary')
  [void]$sb.AppendLine($gloss)
  [void]$sb.AppendLine('')
  [void]$sb.AppendLine('## Story status index')
  [void]$sb.AppendLine("- done: $done")
  [void]$sb.AppendLine("- partial: $partial")
  [void]$sb.AppendLine("- planned: $planned")
  [void]$sb.AppendLine("- cut: $cut")
  if ($amendHead -ne '') {
    [void]$sb.AppendLine('')
    [void]$sb.AppendLine('## Latest amendment')
    [void]$sb.AppendLine($amendHead)
  }
  return $sb.ToString()
}

function Invoke-Digest {
  if (-not (Test-Path $BiblePath)) { Write-Error 'docs/BIBLE.md not found'; exit 1 }
  $text = Build-DigestText
  # write UTF-8 (no BOM) so the hook reads it cleanly
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($DigestPath, $text, $enc)
  Write-Host "Wrote $((Get-RelPath $DigestPath))" -ForegroundColor Green
}

# ---- dispatch --------------------------------------------------------------
switch ($Command) {
  'doctor' { Invoke-Doctor }
  'digest' { Invoke-Digest }
}
