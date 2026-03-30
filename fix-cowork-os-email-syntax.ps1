param(
  [switch]$Apply,
  [switch]$Plan
)

$ErrorActionPreference = "Stop"

if (-not $Apply -and -not $Plan) { $Plan = $true }

$target = Join-Path $env:APPDATA "npm\\node_modules\\cowork-os\\dist\\electron\\electron\\gateway\\channel-registry.js"
if (-not (Test-Path -LiteralPath $target)) {
  throw "File not found: $target"
}

$before = Get-Content -LiteralPath $target -Raw -Encoding UTF8

$after = $before -replace 'Transport protocol: "imap-smtp" \(default\) or "loom"', 'Transport protocol: "imap-smtp" (default), "loom", or "ms-graph"'

$after = [regex]::Replace(
  $after,
  '(microsoftExpiresAt:\s*\{[\s\S]*?\r?\n\s*\},)\s*\r?\n\s*\},\s*\r?\n\s*(imapHost:)',
  '$1' + "`r`n" + '                        ' + '$2',
  1
)

if ($after -eq $before) {
  Write-Output "No change needed (or pattern not found)."
  exit 0
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = "$target.bak.$stamp"

if ($Plan) {
  Write-Output "PLAN:"
  Write-Output " - Backup: $backup"
  Write-Output " - Patch:  $target"
  exit 0
}

Copy-Item -LiteralPath $target -Destination $backup -Force
Set-Content -LiteralPath $target -Value $after -Encoding UTF8

Write-Output "Applied:"
Write-Output " - Backup: $backup"
Write-Output " - Patched: $target"
