[CmdletBinding()]
param(
  [switch]$VerboseOutput
)

$ErrorActionPreference = 'Continue'

function Write-Section($t){ Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Write-Ok($t){ Write-Host "[OK]  $t" -ForegroundColor Green }
function Write-Warn($t){ Write-Host "[WARN] $t" -ForegroundColor Yellow }
function Write-Bad($t){ Write-Host "[FAIL] $t" -ForegroundColor Red }

Write-Section 'Codex CLI - Setup Check'
Write-Host "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "Project: $(Get-Location)"

# --- Detect Codex CLI ---
Write-Section 'CLI detection'
$codexCmd = Get-Command codex -ErrorAction SilentlyContinue
if ($null -eq $codexCmd) {
  Write-Bad 'codex not found on PATH.'
  Write-Host 'Install: npm install -g @openai/codex'
} else {
  Write-Ok "codex found: $($codexCmd.Source)"
  try {
    $ver = & codex --version 2>$null
    if ($ver) { Write-Ok "Version: $ver" }
  } catch { }
}

# --- Auth status ---
Write-Section 'Authentication'
if ($codexCmd) {
  try {
    $authStatus = & codex login status 2>&1
    if ($authStatus -match 'Logged in') {
      Write-Ok $authStatus
    } else {
      Write-Warn "Not logged in"
      Write-Host 'Run: codex login'
    }
  } catch {
    Write-Warn "Could not check auth status"
  }
}

# --- Environment ---
Write-Section 'Environment'
$vars = @('CODEX_SANDBOX', 'CODEX_APPROVAL')
foreach ($v in $vars) {
  $val = [Environment]::GetEnvironmentVariable($v,'Process')
  if ($val) {
    Write-Ok "$v`: $val"
  } else {
    Write-Warn "$v`: (not set - will use CLI defaults)"
  }
}

# --- Quick test ---
Write-Section 'Quick commands'
Write-Host '  . .\tools\maestro\env.ps1                    # Load environment'
Write-Host '  codex login status                           # Check auth'
Write-Host '  codex exec "question" --sandbox read-only    # Quick consult'
Write-Host '  codex review <file>                          # Code review'
Write-Host '  codex "interactive prompt"                   # Interactive session'
