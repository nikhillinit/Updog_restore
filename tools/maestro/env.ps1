# Codex CLI - Project environment setup
# Usage (PowerShell): . .\tools\maestro\env.ps1
#
# Project: Updog_restore (rest-express)
# Uses official @openai/codex CLI with ChatGPT Pro subscription (no API costs)

# Codex CLI defaults
$env:CODEX_SANDBOX = 'read-only'
$env:CODEX_APPROVAL = 'never'

# Verify Codex CLI is available
$codexPath = Get-Command codex -ErrorAction SilentlyContinue
if ($codexPath) {
    Write-Host "Codex CLI ready for Updog_restore:" -ForegroundColor Cyan
    Write-Host "  Path: $($codexPath.Source)"
    Write-Host "  Sandbox: $env:CODEX_SANDBOX"
    Write-Host "  Model: gpt-5.2-codex (xhigh reasoning)"
    Write-Host "  Auth: ChatGPT Pro subscription"
} else {
    Write-Host "[WARN] Codex CLI not found in PATH" -ForegroundColor Yellow
    Write-Host "Install: npm install -g @openai/codex"
}
