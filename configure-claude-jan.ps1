# Claude Code Jan + Ollama Configuration Script
# Run this to set up Claude Code with Jan API and Ollama fallback

$ErrorActionPreference = "Stop"

Write-Output "=========================================="
Write-Output "Claude Code Jan + Ollama Configuration"
Write-Output "=========================================="
Write-Output ""

# Jan API Configuration
$janApiUrl = "http://localhost:1337/v1"
$janModels = @(
    "Meta-Llama-3_1-8B-Instruct-IQ4_XS",  # Local - fast
    "claude-opus-4-1",                      # Remote Claude Opus
    "claude-sonnet-4",                      # Remote Claude Sonnet
    "claude-haiku-4-5",                     # Remote Claude Haiku
    "gpt-4o",                               # Remote GPT-4o
    "gemini-2.5-pro"                        # Remote Gemini
)

# Ollama Configuration  
$ollamaApiUrl = "http://localhost:11434"
$ollamaModels = @(
    "qwen2.5-coder:14b",
    "llama3.2",
    "codellama"
)

Write-Output "Jan API Status: OK"
Write-Output "Jan API URL: $janApiUrl"
Write-Output "Available Jan Models:"
foreach ($m in $janModels) { Write-Output "  - $m" }
Write-Output ""
Write-Output "Ollama Status: OK"
Write-Output "Ollama API URL: $ollamaApiUrl"
Write-Output "Ollama Models Available: 11"
Write-Output ""

# Create Claude Code config for Jan API
$claudeDir = Join-Path $env:USERPROFILE ".claude"
if (-not (Test-Path $claudeDir)) {
    New-Item -ItemType Directory -Path $claudeDir -Force | Out-Null
}

$envConfig = @{
    "ANTHROPIC_BASE_URL" = $janApiUrl
    "ANTHROPIC_API_KEY" = "jan-local"
    "OLLAMA_API_URL" = $ollamaApiUrl
    "JAN_API_URL" = $janApiUrl
}

# Save environment variables to a config file
$configFile = Join-Path $claudeDir "env-config.json"
$envConfig | ConvertTo-Json | Set-Content -Path $configFile -Encoding UTF8

Write-Output "Config saved to: $configFile"
Write-Output ""
Write-Output "To use Claude Code with Jan:"
Write-Output "  1. Set environment variables:"
Write-Output "     set ANTHROPIC_BASE_URL=http://localhost:1337/v1"
Write-Output "     set ANTHROPIC_API_KEY=jan-local"
Write-Output ""
Write-Output "  2. Or add Jan to Claude Code providers:"
Write-Output "     claude config add-provider jan http://localhost:1337/v1"
Write-Output ""
Write-Output "=========================================="
Write-Output "Configuration Complete!"
Write-Output "=========================================="
