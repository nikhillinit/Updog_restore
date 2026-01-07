# Oh-My-OpenCode Installation Script for Windows
# Automated setup with API key migration from existing MCP

param(
    [switch]$DryRun,
    [switch]$SkipBackup,
    [string]$ConfigPath = "$env:USERPROFILE\.config\opencode"
)

$ErrorActionPreference = "Stop"

# Colors for output
function Write-Success { param($Message) Write-Host "[SUCCESS] $Message" -ForegroundColor Green }
function Write-Info { param($Message) Write-Host "[INFO] $Message" -ForegroundColor Cyan }
function Write-Warning { param($Message) Write-Host "[WARNING] $Message" -ForegroundColor Yellow }
function Write-ErrorMsg { param($Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }

Write-Host ""
Write-Host "Oh-My-OpenCode Installation Script" -ForegroundColor Blue
Write-Host "====================================" -ForegroundColor Blue
Write-Host ""

# Step 1: Pre-flight checks
Write-Info "Step 1/6: Pre-flight checks"

# Check Node.js/npm
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-ErrorMsg "npm not found. Please install Node.js first."
    exit 1
}
Write-Success "npm found: $(npm --version)"

# Check Bun (required for oh-my-opencode)
if (-not (Get-Command bunx -ErrorAction SilentlyContinue)) {
    Write-Warning "Bun not found. Installing Bun..."
    if (-not $DryRun) {
        powershell -c "irm bun.sh/install.ps1|iex"
    }
    Write-Success "Bun installed"
} else {
    Write-Success "Bun found: $(bun --version)"
}

# Step 2: Backup existing MCP credentials
Write-Info ""
Write-Info "Step 2/6: Backing up existing MCP credentials"

$mcpCredPath = ".\claude_code-multi-AI-MCP\credentials.json"
$backupPath = ".\claude_code-multi-AI-MCP\credentials.backup.$(Get-Date -Format 'yyyyMMdd-HHmmss').json"

if (Test-Path $mcpCredPath) {
    if (-not $SkipBackup -and -not $DryRun) {
        Copy-Item $mcpCredPath $backupPath
        Write-Success "Backed up credentials to: $backupPath"
    }

    # Load existing credentials
    $mcpCreds = Get-Content $mcpCredPath | ConvertFrom-Json
    Write-Info "Found existing API keys:"
    Write-Info "  - Gemini: $($mcpCreds.gemini.enabled)"
    Write-Info "  - OpenAI: $($mcpCreds.openai.enabled)"
    Write-Info "  - Anthropic: $($mcpCreds.anthropic.enabled)"
    Write-Info "  - DeepSeek: $($mcpCreds.deepseek.enabled)"
} else {
    Write-Warning "No existing MCP credentials found at $mcpCredPath"
    $mcpCreds = $null
}

# Step 3: Install oh-my-opencode
Write-Info ""
Write-Info "Step 3/6: Installing oh-my-opencode"

if (-not $DryRun) {
    Write-Info "Running: bunx oh-my-opencode install --no-tui --claude=yes --chatgpt=yes --gemini=yes"
    bunx oh-my-opencode install --no-tui --claude=yes --chatgpt=yes --gemini=yes
    Write-Success "oh-my-opencode installed"
} else {
    Write-Warning "[DRY RUN] Would install oh-my-opencode"
}

# Step 4: Create configuration directory
Write-Info ""
Write-Info "Step 4/6: Creating configuration"

if (-not (Test-Path $ConfigPath)) {
    if (-not $DryRun) {
        New-Item -ItemType Directory -Path $ConfigPath -Force | Out-Null
        Write-Success "Created config directory: $ConfigPath"
    } else {
        Write-Warning "[DRY RUN] Would create: $ConfigPath"
    }
}

# Step 5: Generate oh-my-opencode configuration
Write-Info ""
Write-Info "Step 5/6: Generating oh-my-opencode configuration"

$projectConfigPath = ".\.opencode\oh-my-opencode.json"
$projectConfigDir = ".\.opencode"

if (-not (Test-Path $projectConfigDir)) {
    if (-not $DryRun) {
        New-Item -ItemType Directory -Path $projectConfigDir -Force | Out-Null
    }
}

$ohMyConfig = @{
    '$schema' = "https://deepwiki.com/code-yeongyu/oh-my-opencode/schema.json"
    agents = @{
        Sisyphus = @{
            model = "anthropic/claude-opus-4-5"
            temperature = 0.2
        }
        oracle = @{
            model = "openai/gpt-4o"
            temperature = 0.1
            permission = @{
                edit = "ask"
                bash = "ask"
            }
        }
        librarian = @{
            model = "google/gemini-2.5-pro"
        }
        explore = @{
            model = "google/gemini-2.5-pro"
        }
        "frontend-ui-ux-engineer" = @{
            model = "google/gemini-2.5-pro"
        }
        "document-writer" = @{
            model = "google/gemini-2.5-pro"
        }
    }
    background_task = @{
        defaultConcurrency = 5
        providerConcurrency = @{
            anthropic = 3
            google = 5
            openai = 2
        }
    }
    google_auth = $false
}

if (-not $DryRun) {
    $ohMyConfig | ConvertTo-Json -Depth 10 | Set-Content $projectConfigPath
    Write-Success "Created configuration: $projectConfigPath"
} else {
    Write-Warning "[DRY RUN] Would create: $projectConfigPath"
    Write-Info ($ohMyConfig | ConvertTo-Json -Depth 10)
}

# Step 6: Create OpenCode plugin configuration
Write-Info ""
Write-Info "Step 6/6: Configuring authentication plugins"

$opencodeConfigPath = "$ConfigPath\opencode.json"
$opencodeConfig = @{
    plugin = @(
        "oh-my-opencode"
        "opencode-antigravity-auth@1.2.7"
        "opencode-openai-codex-auth@4.3.0"
    )
}

if (-not $DryRun) {
    $opencodeConfig | ConvertTo-Json -Depth 10 | Set-Content $opencodeConfigPath
    Write-Success "Created plugin config: $opencodeConfigPath"
} else {
    Write-Warning "[DRY RUN] Would create: $opencodeConfigPath"
}

# Summary
Write-Host ""
Write-Host "====================================" -ForegroundColor Blue
Write-Host "Installation Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. Authenticate with Claude:" -ForegroundColor White
Write-Host "   opencode auth login" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Verify installation:" -ForegroundColor White
Write-Host "   Start coding - oh-my-opencode will auto-delegate tasks" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Monitor agent usage:" -ForegroundColor White
Write-Host "   powershell scripts\monitor-oh-my-opencode.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Compare with current MCP over 1 week" -ForegroundColor White
Write-Host ""
Write-Host "Configuration files:" -ForegroundColor Cyan
Write-Host "  - Project: $projectConfigPath" -ForegroundColor Gray
Write-Host "  - Global:  $opencodeConfigPath" -ForegroundColor Gray
if ($mcpCreds) {
    Write-Host "  - Backup:  $backupPath" -ForegroundColor Gray
}
Write-Host ""
