# Claude Code with Jan + Ollama Fallback Configuration
# Configure Claude Code to use Jan models with Ollama fallback

Write-Output "=========================================="
Write-Output "Claude Code Jan + Ollama Configuration"
Write-Output "=========================================="

$ErrorActionPreference = "Continue"

# Check if Jan is running
Write-Output ""
Write-Output "Checking Jan AI server..."
try {
    $janStatus = Invoke-RestMethod -Uri "http://127.0.0.1:1337/v1/models" -Method Get -TimeoutSec 5
    Write-Output "  ✅ Jan AI is running with $($janStatus.data.Count) models"
} catch {
    Write-Output "  ❌ Jan AI is not running on 127.0.0.1:1337"
    Write-Output "  Please start Jan AI first"
}

# Check if Ollama is running
Write-Output ""
Write-Output "Checking Ollama server..."
try {
    $ollamaStatus = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -Method Get -TimeoutSec 5
    Write-Output "  ✅ Ollama is running with $($ollamaStatus.models.Count) models"
} catch {
    Write-Output "  ❌ Ollama is not running on 127.0.0.1:11434"
}

# Create Claude Code settings for Jan
$claudeDir = Join-Path $env:USERPROFILE ".claude"
if (-not (Test-Path $claudeDir)) {
    New-Item -ItemType Directory -Path $claudeDir -Force | Out-Null
}

# Update Claude Code settings
$settingsPath = Join-Path $claudeDir "settings.json"
$settings = @{
    "autoUpdatesChannel" = "stable"
    "defaultModel" = "Meta-Llama-3_1-8B-Instruct-IQ4_XS"
    "apiProvider" = "jan"
} | ConvertTo-Json -Depth 5

Set-Content -Path $settingsPath -Value $settings -Encoding UTF8
Write-Output ""
Write-Output "  ✅ Updated Claude Code settings"

# Set environment variables for Claude Code
Write-Output ""
Write-Output "=========================================="
Write-Output "Setting Environment Variables"
Write-Output "=========================================="

# Jan API Configuration
[Environment]::SetEnvironmentVariable("ANTHROPIC_BASE_URL", "http://127.0.0.1:1337/v1", "User")
[Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", "jan-local", "User")
[Environment]::SetEnvironmentVariable("ANTHROPIC_MODEL", "Meta-Llama-3_1-8B-Instruct-IQ4_XS", "User")

Write-Output "Set ANTHROPIC_BASE_URL=http://127.0.0.1:1337/v1"
Write-Output "Set ANTHROPIC_API_KEY=jan-local"
Write-Output "Set ANTHROPIC_MODEL=Meta-Llama-3_1-8B-Instruct-IQ4_XS"

# Create fallback configuration
$fallbackPath = Join-Path $claudeDir "model-fallback.json"
$fallback = @{
    "primary" = @{
        "provider" = "jan"
        "url" = "http://127.0.0.1:1337/v1"
        "model" = "Meta-Llama-3_1-8B-Instruct-IQ4_XS"
    }
    "fallback" = @{
        "provider" = "ollama"
        "url" = "http://127.0.0.1:11434"
        "model" = "llama3.2"
    }
} | ConvertTo-Json -Depth 5

Set-Content -Path $fallbackPath -Value $fallback -Encoding UTF8
Write-Output ""
Write-Output "  ✅ Created model fallback configuration"

# Delete old session files to clear cached model
Write-Output ""
Write-Output "=========================================="
Write-Output "Clearing Claude Code Session Cache"
Write-Output "=========================================="

$projectsDir = Join-Path $claudeDir "projects"
if (Test-Path $projectsDir) {
    $sessions = Get-ChildItem -Path $projectsDir -Recurse -Filter "*.jsonl" -ErrorAction SilentlyContinue
    Write-Output "Found $($sessions.Count) session files"
    foreach ($session in $sessions) {
        Remove-Item $session.FullName -Force -ErrorAction SilentlyContinue
    }
    Write-Output "  ✅ Cleared session files"
}

Write-Output ""
Write-Output "=========================================="
Write-Output "Configuration Complete!"
Write-Output "=========================================="
Write-Output ""
Write-Output "To use Claude Code with Jan + Ollama fallback:"
Write-Output ""
Write-Output "1. Restart your terminal to apply environment variables"
Write-Output ""
Write-Output "2. Or set manually before running claude:"
Write-Output '   $env:ANTHROPIC_BASE_URL = "http://127.0.0.1:1337/v1"'
Write-Output '   $env:ANTHROPIC_API_KEY = "jan-local"'
Write-Output '   $env:ANTHROPIC_MODEL = "Meta-Llama-3_1-8B-Instruct-IQ4_XS"'
Write-Output ""
Write-Output "3. Available Jan models to choose from:"
Write-Output "   - Meta-Llama-3_1-8B-Instruct-IQ4_XS (fast)"
Write-Output "   - Qwen3_5-9B-Claude-4.6-Opus-Reasoning-Distilled"
Write-Output "   - Qwen3_5-9B-Abliterated-GGUF"
Write-Output ""
Write-Output "4. Available Ollama models (fallback):"
Write-Output "   - llama3.2"
Write-Output "   - qwen2.5-coder:14b"
Write-Output "   - codellama"
Write-Output ""
