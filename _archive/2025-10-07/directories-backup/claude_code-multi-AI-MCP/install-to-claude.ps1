# Install Multi-AI MCP to Claude Extensions
# This script registers the multi-AI MCP server with Claude Code

$ErrorActionPreference = "Stop"

Write-Host "🚀 Installing Multi-AI MCP to Claude Extensions..." -ForegroundColor Cyan

# Paths
$mcpSource = "$PSScriptRoot"
$claudeExtensions = "$env:APPDATA\Claude\Claude Extensions\multi-ai-collab"
$settingsFile = "$env:APPDATA\Claude\Claude Extensions Settings\multi-ai-collab.json"

# Create extension directory
Write-Host "📁 Creating extension directory..." -ForegroundColor Yellow
if (Test-Path $claudeExtensions) {
    Write-Host "   Removing existing installation..." -ForegroundColor Gray
    Remove-Item -Path $claudeExtensions -Recurse -Force
}
New-Item -ItemType Directory -Path $claudeExtensions -Force | Out-Null

# Copy MCP server files
Write-Host "📦 Copying MCP server files..." -ForegroundColor Yellow
Copy-Item -Path "$mcpSource\server.py" -Destination $claudeExtensions
Copy-Item -Path "$mcpSource\ai_clients.py" -Destination $claudeExtensions -ErrorAction SilentlyContinue
Copy-Item -Path "$mcpSource\tool_definitions.py" -Destination $claudeExtensions -ErrorAction SilentlyContinue
Copy-Item -Path "$mcpSource\tool_handlers.py" -Destination $claudeExtensions -ErrorAction SilentlyContinue
Copy-Item -Path "$mcpSource\collaborative.py" -Destination $claudeExtensions -ErrorAction SilentlyContinue
Copy-Item -Path "$mcpSource\credentials.json" -Destination $claudeExtensions
Copy-Item -Path "$mcpSource\requirements.txt" -Destination $claudeExtensions

# Create extension manifest
Write-Host "📝 Creating extension manifest..." -ForegroundColor Yellow
$manifest = @{
    name = "Multi-AI Collaboration"
    description = "Collaborate with Gemini, GPT-4, and DeepSeek through Claude Code"
    version = "1.1.0"
    mcp = @{
        command = "C:\Python313\python.exe"
        args = @("$claudeExtensions\server.py")
        env = @{}
    }
} | ConvertTo-Json -Depth 10

Set-Content -Path "$claudeExtensions\extension.json" -Value $manifest

# Create settings file
Write-Host "⚙️  Creating settings file..." -ForegroundColor Yellow
$settings = @{
    enabled = $true
} | ConvertTo-Json

Set-Content -Path $settingsFile -Value $settings

# Install Python dependencies
Write-Host "📚 Installing Python dependencies..." -ForegroundColor Yellow
& "C:\Python313\python.exe" -m pip install -q -r "$claudeExtensions\requirements.txt"

Write-Host ""
Write-Host "✅ Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Cyan
Write-Host "   1. Restart Claude (close completely and reopen)"
Write-Host "   2. The Multi-AI MCP tools will be available"
Write-Host "   3. Test by asking: 'Ask Gemini what 2+2 is'"
Write-Host ""
Write-Host "🔧 Configure AI models in: $claudeExtensions\credentials.json" -ForegroundColor Gray
