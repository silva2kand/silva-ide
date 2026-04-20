param(
  [string]$Prefix = "silva-ide-v2-upgraded/silva-ide-v2",
  [string]$Repo = "silva2kand/silva-ide-v2",
  [string]$RemoteName = "silva-ide-v2",
  [string]$RemoteUrl = "",
  [string]$Branch = "silva-ide-v2-split",
  [string]$RemoteBranch = "main",
  [ValidateSet("none","public","private")]
  [string]$CreateRepo = "none",
  [string]$Tag = "",
  [switch]$Force,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function ExecArgs([string]$Exe, [string[]]$ArgList) {
  $fmt = $ArgList | ForEach-Object { if ($_ -match '\\s') { '\"' + $_.Replace('\"','\"\"') + '\"' } else { $_ } }
  $line = "$Exe " + ($fmt -join " ")
  Write-Host $line
  if ($DryRun) { return "" }
  & $Exe @ArgList
  if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE): $line" }
  return ""
}

if (-not $RemoteUrl) {
  if (-not $Repo -or $Repo -notmatch "^[^/]+/[^/]+$") { throw "Repo must be in OWNER/REPO format." }
  $RemoteUrl = "https://github.com/$Repo.git"
}

ExecArgs "git" @("rev-parse","--show-toplevel")

if (-not (Test-Path -LiteralPath $Prefix)) { throw "Prefix path does not exist: $Prefix" }

if (-not $DryRun) {
  $current = (& git status --porcelain=v1)
  if ($current) { Write-Host "Working tree is dirty. This is OK for subtree split, but do NOT commit unintended files." -ForegroundColor Yellow }
}

if (-not $DryRun -and -not $Force) {
  $staged = (& git diff --name-only --cached)
  if ($staged) {
    $bad = @()
    foreach ($p in $staged) {
      if (-not $p) { continue }
      if ($p -notlike "$Prefix/*") { $bad += $p }
    }
    if ($bad.Count -gt 0) {
      throw "Staged changes exist outside prefix. Re-run with -Force if intended.`n$($bad -join "`n")"
    }
  }
}

if (-not $DryRun) {
  & git branch -D $Branch 2>$null | Out-Null
}

ExecArgs "git" @("subtree","split","--prefix=$Prefix","-b",$Branch)

if ($CreateRepo -ne "none") {
  ExecArgs "gh" @("auth","status")
  if (-not $DryRun) {
    $exists = $true
    & gh repo view $Repo --json name,url 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) { $exists = $false }
    if (-not $exists) {
      $flag = "--public"
      if ($CreateRepo -eq "private") { $flag = "--private" }
      ExecArgs "gh" @("repo","create",$Repo,$flag)
    }
  }
}

$remoteExists = (& git remote) -contains $RemoteName
if (-not $remoteExists) { ExecArgs "git" @("remote","add",$RemoteName,$RemoteUrl) }
else { ExecArgs "git" @("remote","set-url",$RemoteName,$RemoteUrl) }

if ($Tag) {
  ExecArgs "git" @("tag","-f",$Tag,$Branch)
  ExecArgs "git" @("push","-f",$RemoteName,"refs/tags/$Tag")
}

ExecArgs "git" @("push","-u",$RemoteName,"$Branch`:$RemoteBranch")
