function sb {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)

  if (-not $Args -or $Args.Count -eq 0) { return }

  $cmd = $Args[0]
  $rest = @()
  if ($Args.Count -gt 1) { $rest = $Args[1..($Args.Count - 1)] }

  if (-not (Get-Command -Name $cmd -ErrorAction SilentlyContinue)) {
    Write-Error "Command not found: $cmd"
    return
  }

  switch ($cmd.ToLowerInvariant()) {
    "claude" {
      $extra = @()
      if ($rest -notcontains "--permission-mode") { $extra += @("--permission-mode", "plan") }
      if ($rest -notcontains "--no-chrome") { $extra += "--no-chrome" }
      & claude @extra @rest
      break
    }

    "ollama" {
      if ($rest.Count -ge 2 -and $rest[0] -eq "launch" -and $rest[1] -eq "claude") {
        $extra = @()
        if ($rest -notcontains "--permission-mode") { $extra += @("--permission-mode", "plan") }
        if ($rest -notcontains "--no-chrome") { $extra += "--no-chrome" }
        & ollama @rest -- @extra
      } else {
        & ollama @rest
      }
      break
    }

    "qwen" {
      $extra = @()
      if ($rest -notcontains "--sandbox" -and $rest -notcontains "-s") { $extra += "--sandbox" }
      if ($rest -notcontains "--approval-mode") { $extra += @("--approval-mode", "plan") }
      & qwen @extra @rest
      break
    }

    "grok" {
      if ($rest -notcontains "--sandbox" -and $rest -notcontains "-s") { & grok --sandbox @rest } else { & grok @rest }
      break
    }

    default {
      & $cmd @rest
      break
    }
  }
}

function sclaude { sb claude @args }
function sollama { sb ollama @args }
function sqwen { sb qwen @args }
function sgrok { sb grok @args }
function sgemini { sb gemini @args }
function sopencode { sb opencode @args }
function skilo { sb kilo @args }
function skimi { sb kimi @args }
function scopilo { sb copilot @args }
function sclaudecode { sb claude @args }
function sclaude_fast { 
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  $hasJan = $null -ne (Get-Command -Name jan -ErrorAction SilentlyContinue)
  if ($hasJan) {
    try { & jan launch --model sorc/qwen3.5-claude-4.6-opus:0.8b claude @Args; return } catch { Write-Warning "Jan failed, falling back..." }
  }
  $hasOllama = $null -ne (Get-Command -Name ollama -ErrorAction SilentlyContinue)
  if ($hasOllama) {
    try { sb ollama launch claude --model sorc/qwen3.5-claude-4.6-opus:0.8b -- @args; return } catch { Write-Warning "Ollama failed, falling back..." }
  }
  $hasLms = $null -ne (Get-Command -Name lms -ErrorAction SilentlyContinue)
  if ($hasLms) {
    try { & lms run claude --model sorc/qwen3.5-claude-4.6-opus:0.8b @Args; return } catch { Write-Warning "LM Studio failed, falling back..." }
  }
  sb claude @Args
}

function sclaude_strong { sb ollama launch claude --model sorc/qwen3.5-claude-4.6-opus:4b -- @args }
function sclaude_min { sb claude --bare @args }

function Use-ClaudeLocalProfile {
  param(
    [string]$BaseUrl = "http://127.0.0.1:1337/v1",
    [string]$ApiKey = "jan-local",
    [string]$Model = "Meta-Llama-3_1-8B-Instruct-IQ4_XS",
    [switch]$Persist
  )

  $env:ANTHROPIC_BASE_URL = $BaseUrl
  $env:ANTHROPIC_API_KEY = $ApiKey
  $env:ANTHROPIC_MODEL = $Model

  if ($Persist) {
    [Environment]::SetEnvironmentVariable("ANTHROPIC_BASE_URL", $BaseUrl, "User")
    [Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", $ApiKey, "User")
    [Environment]::SetEnvironmentVariable("ANTHROPIC_MODEL", $Model, "User")
  }
}

function Use-ClaudeCloudProfile {
  param(
    [string]$BaseUrl,
    [string]$ApiKey,
    [string]$ApiKeyEnv = "OPENROUTER_API_KEY",
    [string]$Model,
    [switch]$Persist
  )

  if (-not $BaseUrl) { throw "BaseUrl is required (e.g. https://openrouter.ai/api/v1 or your provider endpoint)" }
  if (-not $ApiKey) { $ApiKey = [Environment]::GetEnvironmentVariable($ApiKeyEnv, "User") }
  if (-not $ApiKey) { $ApiKey = [Environment]::GetEnvironmentVariable($ApiKeyEnv, "Process") }
  if (-not $ApiKey) { throw "API key missing. Set `$env:$ApiKeyEnv or pass -ApiKey." }
  if (-not $Model) { throw "Model is required (provider-specific model id/name)." }

  $env:ANTHROPIC_BASE_URL = $BaseUrl
  $env:ANTHROPIC_API_KEY = $ApiKey
  $env:ANTHROPIC_MODEL = $Model

  if ($Persist) {
    [Environment]::SetEnvironmentVariable("ANTHROPIC_BASE_URL", $BaseUrl, "User")
    [Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", $ApiKey, "User")
    [Environment]::SetEnvironmentVariable("ANTHROPIC_MODEL", $Model, "User")
  }
}

function sclaude_local {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  Use-ClaudeLocalProfile
  sb claude @Args
}

function sclaude_cloud {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  if (-not $env:ANTHROPIC_BASE_URL -and -not [Environment]::GetEnvironmentVariable("ANTHROPIC_BASE_URL", "User")) {
    throw "Cloud profile not configured for this shell. Call Use-ClaudeCloudProfile -BaseUrl ... -Model ... (and set OPENROUTER_API_KEY or pass -ApiKey)."
  }
  sb claude @Args
}

function sclaude_auto {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  sclaude_fast @Args
}

Export-ModuleMember -Function sb, sclaude, sollama, sqwen, sgrok, sgemini, sopencode, skilo, skimi, scopilo, sclaudecode, sclaude_fast, sclaude_strong, sclaude_min, Use-ClaudeLocalProfile, Use-ClaudeCloudProfile, sclaude_local, sclaude_cloud, sclaude_auto
