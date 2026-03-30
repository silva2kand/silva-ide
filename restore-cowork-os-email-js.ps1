param(
  [string]$Version = "0.4.13",
  [switch]$Apply,
  [switch]$Plan
)

$ErrorActionPreference = "Stop"

if (-not $Apply -and -not $Plan) { $Plan = $true }

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$tgz = Join-Path $root ("cowork-os-" + $Version + ".tgz")
$extractDir = Join-Path $root "_cowork_os_pack"
$src = Join-Path $extractDir "package\\dist\\electron\\electron\\gateway\\channels\\email.js"
$dst = Join-Path $env:APPDATA "npm\\node_modules\\cowork-os\\dist\\electron\\electron\\gateway\\channels\\email.js"

if (-not (Test-Path -LiteralPath $tgz)) {
  throw "Missing tarball: $tgz (run: npm pack cowork-os@$Version)"
}
if (-not (Test-Path -LiteralPath $src)) {
  throw "Missing extracted file: $src (extract the tgz into $extractDir)"
}
if (-not (Test-Path -LiteralPath $dst)) {
  throw "Missing installed cowork-os file: $dst"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = "$dst.bak.$stamp"

if ($Plan) {
  Write-Output "PLAN:"
  Write-Output " - Backup: $backup"
  Write-Output " - Restore: $dst"
  Write-Output " - From: $src"
  exit 0
}

$contents = Get-Content -LiteralPath $src -Raw -Encoding UTF8
Copy-Item -LiteralPath $dst -Destination $backup -Force
Set-Content -LiteralPath $dst -Value $contents -Encoding UTF8

Write-Output "Applied:"
Write-Output " - Backup: $backup"
Write-Output " - Restored: $dst"
