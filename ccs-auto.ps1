param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Args
)

$codeProfile = if ($env:CCS_AUTO_CODE) { $env:CCS_AUTO_CODE } else { "ollama-qwen3-coder-next" }
$reasonProfile = if ($env:CCS_AUTO_REASONING) { $env:CCS_AUTO_REASONING } else { "ollama-qwen35-35b-opus46" }
$fastProfile = if ($env:CCS_AUTO_FAST) { $env:CCS_AUTO_FAST } else { "ollama-glm47-flash" }
$defaultProfile = if ($env:CCS_AUTO_DEFAULT) { $env:CCS_AUTO_DEFAULT } else { "ollama-local" }
$longProfile = if ($env:CCS_AUTO_LONG) { $env:CCS_AUTO_LONG } else { $reasonProfile }
$midReasonProfile = if ($env:CCS_AUTO_MID_REASONING) { $env:CCS_AUTO_MID_REASONING } else { "lmstudio-qwen35-27b-opus46" }

function Select-Profile([string]$Prompt) {
  $p = $Prompt.Trim()
  $lower = $p.ToLowerInvariant()

  if ($p.Length -ge 4000) { return $longProfile }

  if ($lower -match "(stack trace|traceback|exception|segfault|panic|bug|refactor|unit test|tests?|pytest|jest|vitest|build|compile|lint|typecheck|tsc|webpack|vite|npm|pnpm|yarn|pip|poetry|cargo|rustc|go build|mvn|gradle|docker|kubernetes|helm|sql|regex|typescript|javascript|node\\.js|python|java\\b|c\\+\\+|c#|rust\\b|golang|terraform|ansible)") {
    return $codeProfile
  }

  if ($p.Length -ge 1200 -and $lower -match "(plan|architecture|design|spec|proposal|trade-?offs?|compare|benchmark|strategy|roadmap|analy(sis|ze)|reason)") {
    return $midReasonProfile
  }

  if ($lower -match "(plan|architecture|design|spec|proposal|trade-?offs?|compare|benchmark|strategy|roadmap|analy(sis|ze)|reason)") {
    return $reasonProfile
  }

  if ($p.Length -le 240 -and $lower -match "(quick|fast|summarize|tl;dr|translate|rewrite|rephrase|short|brief)") {
    return $fastProfile
  }

  return $defaultProfile
}

$dryRun = $false
$explicitProfile = $null
$promptParts = New-Object System.Collections.Generic.List[string]
$forwardArgs = New-Object System.Collections.Generic.List[string]
$inForward = $false

for ($i = 0; $i -lt $Args.Count; $i++) {
  $a = $Args[$i]
  if ($a -eq "--") { $inForward = $true; continue }
  if ($a -eq "--dry-run") { $dryRun = $true; continue }
  if ($a -eq "--profile") {
    if ($i + 1 -lt $Args.Count) {
      $explicitProfile = $Args[$i + 1]
      $i++
      continue
    }
  }
  if ($inForward) { $forwardArgs.Add($a) } else { $promptParts.Add($a) }
}

$prompt = ($promptParts -join " ").Trim()
if ([string]::IsNullOrWhiteSpace($prompt)) {
  Write-Output "Usage:"
  Write-Output "  .\\ccs-auto.ps1 \"your prompt\""
  Write-Output "  .\\ccs-auto.ps1 --dry-run \"your prompt\""
  Write-Output "  .\\ccs-auto.ps1 --profile <profile> \"your prompt\""
  Write-Output "  .\\ccs-auto.ps1 \"your prompt\" -- --target droid"
  exit 2
}

$profile = if ($explicitProfile) { $explicitProfile } else { Select-Profile -Prompt $prompt }

if ($dryRun) {
  Write-Output $profile
  exit 0
}

& ccs $profile $prompt @forwardArgs
exit $LASTEXITCODE
