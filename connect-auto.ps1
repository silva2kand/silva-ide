param(
  [switch]$Apply,
  [switch]$Plan,
  [switch]$CreateDesktopShortcut,
  [switch]$CreateCcsDashboardShortcut,
  [switch]$CreateCcsDashboardLauncherShortcut,
  [switch]$CreateCcsSafeDashboardLauncherShortcut,
  [switch]$DisableAntigravity
)

$ErrorActionPreference = "Stop"

function New-DesktopShortcut([string]$Name, [string]$TargetPath, [string]$Arguments, [string]$IconLocation) {
  $desktop = [Environment]::GetFolderPath("Desktop")
  $shortcutPath = Join-Path $desktop ("{0}.lnk" -f $Name)
  $wsh = New-Object -ComObject WScript.Shell
  $sc = $wsh.CreateShortcut($shortcutPath)
  $sc.TargetPath = $TargetPath
  $sc.Arguments = $Arguments
  $sc.WorkingDirectory = $desktop
  if ($IconLocation) { $sc.IconLocation = $IconLocation }
  $sc.Save()
  Write-Output ("Created desktop shortcut: {0}" -f $shortcutPath)
}

function Write-Section([string]$Title) {
  Write-Output ""
  Write-Output ("=" * 70)
  Write-Output $Title
  Write-Output ("=" * 70)
}

function Try-Where([string]$Name) {
  try {
    $cmd = Get-Command $Name -ErrorAction Stop
    return $cmd.Path
  } catch {
    return $null
  }
}

function Try-Json([string]$Url) {
  try {
    return Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 3
  } catch {
    return $null
  }
}

if (-not $Apply -and -not $Plan) { $Plan = $true }

function Remove-CliproxyProvider([string]$Text, [string]$Provider) {
  $lines = $Text -split "`r?`n", -1
  $inCliproxy = $false
  $inProviders = $false
  $cliproxyIndent = 0
  $providersIndent = 0

  for ($i = 0; $i -lt $lines.Length; $i++) {
    $line = $lines[$i]
    if (-not $inCliproxy) {
      if ($line -match '^(?<indent>\s*)cliproxy:\s*$') {
        $inCliproxy = $true
        $cliproxyIndent = $matches['indent'].Length
        continue
      }
      continue
    }

    if ($line -match '^(?<indent>\s*)\S') {
      $indent = $matches['indent'].Length
      if ($indent -le $cliproxyIndent) {
        $inCliproxy = $false
        $inProviders = $false
        continue
      }
    }

    if (-not $inProviders) {
      if ($line -match '^(?<indent>\s*)providers:\s*$') {
        $inProviders = $true
        $providersIndent = $matches['indent'].Length
        continue
      }
      continue
    }

    if ($line -match '^(?<indent>\s*)\S') {
      $indent = $matches['indent'].Length
      if ($indent -le $providersIndent) {
        $inProviders = $false
        continue
      }
    }

    if ($line -match '^\s*-\s*(?<item>[^#\s]+)\s*(#.*)?$') {
      if ($matches['item'] -eq $Provider) {
        $lines[$i] = $null
      }
    }
  }

  return ($lines | Where-Object { $_ -ne $null }) -join "`r`n"
}

if ($CreateDesktopShortcut) {
  $ps = Join-Path $env:SystemRoot "System32\\WindowsPowerShell\\v1.0\\powershell.exe"
  $args = "-NoProfile -ExecutionPolicy Bypass -Command ""Start-Process -FilePath netsh -ArgumentList 'advfirewall firewall add rule name=CCS_OAuth_8085 dir=in action=allow protocol=TCP localport=8085' -Verb RunAs"""
  New-DesktopShortcut -Name "CCS OAuth Firewall (8085)" -TargetPath $ps -Arguments $args -IconLocation (Join-Path $env:SystemRoot "System32\\shell32.dll,77")
  exit 0
}

if ($CreateCcsDashboardShortcut) {
  $ps = Join-Path $env:SystemRoot "System32\\WindowsPowerShell\\v1.0\\powershell.exe"
  $args = "-NoProfile -ExecutionPolicy Bypass -Command ""Start-Process 'http://localhost:3030/'"""
  New-DesktopShortcut -Name "CCS Dashboard" -TargetPath $ps -Arguments $args -IconLocation (Join-Path $env:SystemRoot "System32\\shell32.dll,220")
  exit 0
}

if ($CreateCcsDashboardLauncherShortcut) {
  $ps = Join-Path $env:SystemRoot "System32\\WindowsPowerShell\\v1.0\\powershell.exe"
  $args = "-NoProfile -ExecutionPolicy Bypass -Command ""Start-Process -WindowStyle Minimized -FilePath ccs -ArgumentList 'config --port 3030'; Start-Sleep -Milliseconds 900; Start-Process 'http://localhost:3030/'"""
  New-DesktopShortcut -Name "CCS Dashboard (Start)" -TargetPath $ps -Arguments $args -IconLocation (Join-Path $env:SystemRoot "System32\\shell32.dll,220")
  exit 0
}

if ($CreateCcsSafeDashboardLauncherShortcut) {
  $ps = Join-Path $env:SystemRoot "System32\\WindowsPowerShell\\v1.0\\powershell.exe"
  $ccsSafeCmd = Join-Path $PSScriptRoot "ccs-safe.cmd"
  $args = "-NoProfile -ExecutionPolicy Bypass -Command ""Start-Process -WindowStyle Minimized -FilePath '$ccsSafeCmd' -ArgumentList 'config --port 3030'; Start-Sleep -Milliseconds 900; Start-Process 'http://localhost:3030/'"""
  New-DesktopShortcut -Name "CCS Dashboard Safe (Start)" -TargetPath $ps -Arguments $args -IconLocation (Join-Path $env:SystemRoot "System32\\shell32.dll,220")
  exit 0
}

$detections = [ordered]@{
  opencode  = (Try-Where "opencode")
  gemini    = (Try-Where "gemini")
  claude    = (Try-Where "claude")
  ccs       = (Try-Where "ccs")
  openclaw  = (Try-Where "openclaw")
  cowork_os = (Try-Where "cowork-os")
  qwen      = (Try-Where "qwen")
  glm       = (Try-Where "glm")
  kilo      = (Try-Where "kilo")
  copilot   = (Try-Where "copilot")
  pnpm      = (Try-Where "pnpm")
  ollama    = (Try-Where "ollama")
  grok      = (Try-Where "grok")
}

Write-Section "Detected CLIs"
foreach ($k in $detections.Keys) {
  $v = $detections[$k]
  if ($v) { Write-Output ("{0,-10} {1}" -f $k, $v) } else { Write-Output ("{0,-10} (not found on PATH)" -f $k) }
}

$ollamaTags = Try-Json "http://127.0.0.1:11434/api/tags"
$lmstudioModels = Try-Json "http://127.0.0.1:1234/v1/models"

Write-Section "Local Model Servers"
if ($ollamaTags -and $ollamaTags.models) {
  Write-Output ("Ollama: OK ({0} model(s))" -f $ollamaTags.models.Count)
} else {
  Write-Output "Ollama: not reachable at http://127.0.0.1:11434"
}
if ($lmstudioModels -and $lmstudioModels.data) {
  Write-Output ("LM Studio: OK ({0} model(s))" -f $lmstudioModels.data.Count)
} else {
  Write-Output "LM Studio: not reachable at http://127.0.0.1:1234"
}

Write-Section "CoWork OS Local Data"
$coworkDir = Join-Path $env:APPDATA "cowork-os"
$coworkSkillsDir = Join-Path $coworkDir "skills"
if (Test-Path $coworkDir) {
  Write-Output ("cowork-os dir: {0}" -f $coworkDir)
  if (Test-Path $coworkSkillsDir) {
    $skillCount = (Get-ChildItem -LiteralPath $coworkSkillsDir -Directory -ErrorAction SilentlyContinue | Measure-Object).Count
    Write-Output ("skills dir: {0} ({1} folder(s))" -f $coworkSkillsDir, $skillCount)
  } else {
    Write-Output ("skills dir: (missing) {0}" -f $coworkSkillsDir)
  }
} else {
  Write-Output "cowork-os dir: not found (launch cowork-os once to initialize)"
}

Write-Section "CCS WebSearch Plan"
$ccsConfigPath = Join-Path $HOME ".ccs\\config.yaml"
Write-Output ("ccs config: {0}" -f $ccsConfigPath)
Write-Output "Plan: enable CCS WebSearch fallback chain: Gemini -> OpenCode"
Write-Output "Approval gate: this script only edits CCS config when you run with -Apply"
Write-Output "Dashboard: http://localhost:3030/"

if (-not (Test-Path $ccsConfigPath)) {
  Write-Output "ccs config.yaml not found; run 'ccs' once to initialize."
  exit 0
}

$original = Get-Content -LiteralPath $ccsConfigPath -Raw

function Set-YamlBool([string]$Text, [string]$PathRegex, [bool]$Value) {
  $bool = if ($Value) { "true" } else { "false" }
  $pattern = "(?ms)($PathRegex\\s*\\n(?:\\s+.*\\n)*?\\s+enabled:\\s*)(true|false)"
  $replacement = "`${1}$bool"
  $updated = [regex]::Replace($Text, $pattern, $replacement)
  return $updated
}

$planned = $original
$planned = Set-YamlBool -Text $planned -PathRegex "websearch:\\s*\\n\\s+enabled:" -Value $true
$planned = Set-YamlBool -Text $planned -PathRegex "websearch:\\s*[\\s\\S]*?providers:\\s*[\\s\\S]*?gemini:" -Value $true
$planned = Set-YamlBool -Text $planned -PathRegex "websearch:\\s*[\\s\\S]*?providers:\\s*[\\s\\S]*?opencode:" -Value $true
if ($detections["grok"]) {
  $planned = Set-YamlBool -Text $planned -PathRegex "websearch:\\s*[\\s\\S]*?providers:\\s*[\\s\\S]*?grok:" -Value $true
}
if ($DisableAntigravity) {
  $planned = Remove-CliproxyProvider -Text $planned -Provider "agy"
}

$changed = ($planned -ne $original)

if ($Plan) {
  if ($changed) {
    Write-Output ""
    Write-Output "Changes that would be applied to ~/.ccs/config.yaml:"
    Write-Output "- websearch.enabled: true"
    Write-Output "- websearch.providers.gemini.enabled: true"
    Write-Output "- websearch.providers.opencode.enabled: true"
    if ($detections["grok"]) {
      Write-Output "- websearch.providers.grok.enabled: true"
    }
    if ($DisableAntigravity) {
      Write-Output "- cliproxy.providers: remove agy"
    }
    Write-Output ""
    Write-Output "Run:"
    if ($DisableAntigravity) { Write-Output "  .\\connect-auto.ps1 -DisableAntigravity -Apply" } else { Write-Output "  .\\connect-auto.ps1 -Apply" }
  } else {
    Write-Output ""
    Write-Output "No CCS WebSearch changes needed."
  }
}

if ($Apply) {
  if (-not $changed) {
    Write-Output "No changes needed."
    exit 0
  }
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $backup = "$ccsConfigPath.bak.$stamp"
  Copy-Item -LiteralPath $ccsConfigPath -Destination $backup -Force
  Set-Content -LiteralPath $ccsConfigPath -Value $planned -Encoding UTF8
  Write-Output ("Applied. Backup saved: {0}" -f $backup)
  Write-Output "If CCS is running, refresh the CCS dashboard."
}
