param(
  [string]$Version = "0.4.13",
  [switch]$Apply,
  [switch]$Plan
)

$ErrorActionPreference = "Stop"

if (-not $Apply -and -not $Plan) { $Plan = $true }

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$extractDir = Join-Path $root "_cowork_os_pack"
$installedRoot = Join-Path $env:APPDATA "npm\\node_modules\\cowork-os\\dist\\electron\\electron"

$files = @(
  "utils\\validation.js",
  "utils\\loom.js",
  "ipc\\handlers.js",
  "gateway\\index.js",
  "gateway\\channel-registry.js",
  "gateway\\channels\\email.js"
)

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$actions = @()

foreach ($rel in $files) {
  $src = Join-Path $extractDir ("package\\dist\\electron\\electron\\" + $rel)
  $dst = Join-Path $installedRoot $rel

  if (-not (Test-Path -LiteralPath $src)) {
    throw "Missing extracted file: $src"
  }
  if (-not (Test-Path -LiteralPath $dst)) {
    throw "Missing installed file: $dst"
  }

  $actions += [pscustomobject]@{
    rel = $rel
    src = $src
    dst = $dst
    backup = "$dst.bak.$stamp"
  }
}

if ($Plan) {
  Write-Output "PLAN:"
  foreach ($a in $actions) {
    Write-Output (" - Restore: {0}" -f $a.rel)
    Write-Output ("   Backup:  {0}" -f $a.backup)
  }
  exit 0
}

foreach ($a in $actions) {
  $contents = Get-Content -LiteralPath $a.src -Raw -Encoding UTF8
  Copy-Item -LiteralPath $a.dst -Destination $a.backup -Force
  Set-Content -LiteralPath $a.dst -Value $contents -Encoding UTF8
}

Write-Output "Applied restores:"
foreach ($a in $actions) {
  Write-Output (" - {0}" -f $a.rel)
}
