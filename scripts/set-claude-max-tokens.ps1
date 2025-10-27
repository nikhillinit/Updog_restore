# Set maximum output tokens for Claude Code
# Run this before launching Claude Code, or add to your PowerShell profile

$maxTokens = "32768"

Write-Host "Setting CLAUDE_CODE_MAX_OUTPUT_TOKENS to $maxTokens" -ForegroundColor Green
$env:CLAUDE_CODE_MAX_OUTPUT_TOKENS = $maxTokens

# Verify it's set
if ($env:CLAUDE_CODE_MAX_OUTPUT_TOKENS -eq $maxTokens) {
    Write-Host "✓ Environment variable set successfully" -ForegroundColor Green
    Write-Host "  CLAUDE_CODE_MAX_OUTPUT_TOKENS = $env:CLAUDE_CODE_MAX_OUTPUT_TOKENS" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "This setting is active for the current PowerShell session." -ForegroundColor Yellow
    Write-Host "To make it permanent, run: .\scripts\set-claude-max-tokens.ps1 -Persistent" -ForegroundColor Yellow
} else {
    Write-Host "✗ Failed to set environment variable" -ForegroundColor Red
    exit 1
}

# Optional: Set permanently
param(
    [switch]$Persistent
)

if ($Persistent) {
    Write-Host ""
    Write-Host "Setting permanent user environment variable..." -ForegroundColor Cyan
    [System.Environment]::SetEnvironmentVariable('CLAUDE_CODE_MAX_OUTPUT_TOKENS', $maxTokens, 'User')
    Write-Host "✓ Permanent setting applied. Restart Claude Code to take effect." -ForegroundColor Green
}
