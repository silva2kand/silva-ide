param(
  [string]$Prefix = "silva-ide-v2-upgraded/silva-ide-v2",
  [string]$RemoteName = "silva-ide-v2",
  [string]$RemoteUrl = "https://github.com/silva2kand/silva-ide-v2.git",
  [string]$Branch = "silva-ide-v2-split",
  [string]$RemoteBranch = "main"
)

$ErrorActionPreference = "Stop"

function Exec([string]$Cmd) {
  Write-Host $Cmd
  & powershell -NoProfile -Command $Cmd
  if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE): $Cmd" }
}

Exec "git rev-parse --show-toplevel | Out-Host"

if (-not (Test-Path -LiteralPath $Prefix)) {
  throw "Prefix path does not exist: $Prefix"
}

$current = (git status --porcelain=v1)
if ($current) {
  Write-Host "Working tree is dirty. This is OK for subtree split, but do NOT commit unintended files." -ForegroundColor Yellow
}

try { Exec "git branch -D $Branch 2>`$null" } catch {}

Exec "git subtree split --prefix=`"$Prefix`" -b $Branch"

$remoteExists = (git remote) -contains $RemoteName
if (-not $remoteExists) {
  Exec "git remote add $RemoteName `"$RemoteUrl`""
} else {
  Exec "git remote set-url $RemoteName `"$RemoteUrl`""
}

Exec "git push -u $RemoteName $Branch`:$RemoteBranch"
