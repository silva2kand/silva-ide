# Install All AI CLIs Script
# Run as Administrator for global npm installs

Write-Output "=========================================="
Write-Output "Installing All AI CLI Tools"
Write-Output "=========================================="

# Function to install npm packages globally
function Install-NpmCli($package, $name) {
    Write-Output "Installing $name..."
    try {
        npm install -g $package 2>&1 | Out-Null
        Write-Output "  ✅ $name installed"
    } catch {
        Write-Output "  ❌ $name failed: $_"
    }
}

# Function to check if command exists
function Test-Command($cmd) {
    $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue)
}

# Install npm-based CLIs
Write-Output ""
Write-Output "Installing npm-based CLIs..."
Install-NpmCli "@anthropic-ai/claude-code" "Claude Code (via npm)"
Install-NpmCli "@google/gemini-cli" "Gemini CLI"
Install-NpmCli "@vibe-kit/grok-cli" "Grok CLI"

# Install opencode (curl install script)
Write-Output ""
Write-Output "Installing OpenCode..."
try {
    curl -fsSL https://opencode.ai/install | bash 2>&1 | Out-Null
    Write-Output "  ✅ OpenCode installed"
} catch {
    Write-Output "  ❌ OpenCode install script failed"
}

# Verify installations
Write-Output ""
Write-Output "=========================================="
Write-Output "Verifying Installed CLIs"
Write-Output "=========================================="

$clis = @("claude", "gemini", "grok", "opencode", "kilo", "qwen", "kimi", "minimax", "codex", "copilot")
foreach ($cli in $clis) {
    if (Test-Command $cli) {
        Write-Output "  ✅ $cli - $(Get-Command $cli | Select-Object -ExpandProperty Source)"
    } else {
        Write-Output "  ❌ $cli - not found"
    }
}

Write-Output ""
Write-Output "=========================================="
Write-Output "Installing Ollama (if not present)"
Write-Output "=========================================="

if (-not (Test-Command "ollama")) {
    Write-Output "Downloading Ollama..."
    $ollamaUrl = "https://ollama.com/download/OllamaSetup.exe"
    $tempFile = "$env:TEMP\OllamaSetup.exe"
    try {
        Invoke-WebRequest -Uri $ollamaUrl -OutFile $tempFile
        Start-Process -FilePath $tempFile -ArgumentList "/S" -Wait
        Write-Output "  ✅ Ollama installed"
        Remove-Item $tempFile -Force
    } catch {
        Write-Output "  ❌ Ollama install failed: $_"
    }
} else {
    Write-Output "  ✅ Ollama already installed"
}

Write-Output ""
Write-Output "=========================================="
Write-Output "Installation Complete!"
Write-Output "=========================================="
