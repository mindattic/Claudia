<#
  SessionStart hook: inject docs/BIBLE.digest.md as additionalContext so the agent
  starts every session with Claudia's authoritative laws + state.

  Emits Claude Code hook JSON on stdout. Non-ASCII is escaped to \uXXXX so the output
  is safe under Windows PowerShell 5.1 / Win-1252. If the digest is missing or empty,
  emits {} (a no-op).
#>
$ErrorActionPreference = 'Stop'

try {
  $here   = Split-Path -Parent $MyInvocation.MyCommand.Path
  $repo   = Split-Path -Parent (Split-Path -Parent $here)
  $digest = Join-Path $repo 'docs\BIBLE.digest.md'

  if (-not (Test-Path $digest)) { Write-Output '{}'; exit 0 }
  $body = Get-Content -LiteralPath $digest -Raw
  if ([string]::IsNullOrWhiteSpace($body)) { Write-Output '{}'; exit 0 }

  $preamble = @"
The following is the AUTHORITATIVE Codex digest for the Claudia project (source of truth:
docs/BIBLE.md). Treat its laws and state as binding. When a fact here conflicts with code or
memory, the digest wins; the latest amendment (docs/AMENDMENTS.md) wins over the bible. Keep a
single home per fact and cite ids ({#CLA-...}, part.<slug>) rather than restating.

"@

  $context = $preamble + $body

  # JSON-encode with ASCII-only escaping (no external assemblies needed).
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $context.ToCharArray()) {
    $code = [int]$ch
    switch ($ch) {
      '"'  { [void]$sb.Append('\"') ; continue }
      '\'  { [void]$sb.Append('\\') ; continue }
      "`b" { [void]$sb.Append('\b') ; continue }
      "`f" { [void]$sb.Append('\f') ; continue }
      "`n" { [void]$sb.Append('\n') ; continue }
      "`r" { [void]$sb.Append('\r') ; continue }
      "`t" { [void]$sb.Append('\t') ; continue }
      default {
        if ($code -lt 32 -or $code -gt 126) {
          [void]$sb.Append('\u')
          [void]$sb.Append($code.ToString('x4'))
        } else {
          [void]$sb.Append($ch)
        }
      }
    }
  }
  $escaped = $sb.ToString()

  $json = '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"' + $escaped + '"}}'
  Write-Output $json
}
catch {
  # Never break a session start on hook failure.
  Write-Output '{}'
}
