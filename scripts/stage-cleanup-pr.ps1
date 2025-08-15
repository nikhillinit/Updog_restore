#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Stage cleanup PR branch for legacy state removal
.DESCRIPTION
    Creates and prepares a cleanup branch with template and initial analysis
    Use after fund store rollout reaches 100% for 24+ hours
.PARAMETER DryRun
    Show what would be done without executing
.EXAMPLE
    pwsh scripts/stage-cleanup-pr.ps1
    pwsh scripts/stage-cleanup-pr.ps1 -DryRun
#>

param(
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Write-Step($message) {
    Write-Host "🔄 $message" -ForegroundColor Cyan
}

function Write-Success($message) {
    Write-Host "✅ $message" -ForegroundColor Green
}

function Write-Warning($message) {
    Write-Host "⚠️  $message" -ForegroundColor Yellow
}

function Write-Error($message) {
    Write-Host "❌ $message" -ForegroundColor Red
}

# Check current deployment status
Write-Step "Checking current rollout status..."

try {
    # Check if we're at 100% rollout
    $envVars = @{}
    if (Test-Path ".env") {
        Get-Content ".env" | ForEach-Object {
            if ($_ -match "^([^#][^=]+)=(.*)$") {
                $envVars[$matches[1]] = $matches[2]
            }
        }
    }
    
    $rolloutPct = $envVars["VITE_USE_FUND_STORE_ROLLOUT"]
    if (-not $rolloutPct -or $rolloutPct -ne "100") {
        Write-Warning "Rollout percentage is not 100% ($rolloutPct)"
        Write-Host "Consider waiting until rollout is complete"
        $continue = Read-Host "Continue anyway? (y/N)"
        if ($continue -ne "y" -and $continue -ne "Y") {
            exit 0
        }
    }
    
    Write-Success "Environment check complete"
} catch {
    Write-Warning "Could not verify rollout status: $($_.Exception.Message)"
}

# Check Git status
Write-Step "Checking Git status..."

if ($DryRun) {
    Write-Host "[DRY RUN] Would check git status"
} else {
    $gitStatus = git status --porcelain
    if ($gitStatus) {
        Write-Error "Working directory not clean. Please commit or stash changes."
        Write-Host $gitStatus
        exit 1
    }
    
    # Make sure we're on main
    $currentBranch = git branch --show-current
    if ($currentBranch -ne "main") {
        Write-Warning "Not on main branch (currently: $currentBranch)"
        $switch = Read-Host "Switch to main? (y/N)"
        if ($switch -eq "y" -or $switch -eq "Y") {
            git checkout main
            git pull origin main
        } else {
            Write-Error "Must be on clean main branch to proceed"
            exit 1
        }
    }
    
    Write-Success "Git status clean"
}

# Create cleanup branch
$branchName = "cleanup/remove-legacy-state-$(Get-Date -Format 'yyyy-MM-dd')"
Write-Step "Creating cleanup branch: $branchName"

if ($DryRun) {
    Write-Host "[DRY RUN] Would create branch: $branchName"
} else {
    git checkout -b $branchName
    Write-Success "Created branch: $branchName"
}

# Analyze legacy files to remove
Write-Step "Analyzing legacy files..."

$legacyFiles = @(
    "client/src/state/useFundContext.tsx",
    "client/src/state/FundProvider.tsx", 
    "client/src/hooks/useLegacyFundState.ts",
    "client/src/__tests__/legacy-state.test.tsx"
)

$modifyFiles = @(
    "client/src/pages/fund-setup.tsx",
    "client/src/pages/fund-setup/steps/Step3Graduation.tsx",
    "client/src/components/wizard/WizardProgress.tsx",
    "client/src/config/features.ts"
)

$existingLegacyFiles = $legacyFiles | Where-Object { Test-Path $_ }
$existingModifyFiles = $modifyFiles | Where-Object { Test-Path $_ }

Write-Host ""
Write-Host "📊 Cleanup Analysis:" -ForegroundColor Magenta
Write-Host "  Files to remove: $($existingLegacyFiles.Count)" -ForegroundColor Red
$existingLegacyFiles | ForEach-Object { Write-Host "    - $_" -ForegroundColor Red }

Write-Host "  Files to modify: $($existingModifyFiles.Count)" -ForegroundColor Yellow
$existingModifyFiles | ForEach-Object { Write-Host "    - $_" -ForegroundColor Yellow }

if ($existingLegacyFiles.Count -eq 0) {
    Write-Warning "No legacy files found - cleanup may already be complete"
}

# Load PR template
Write-Step "Loading PR description template..."

if (Test-Path "docs/CLEANUP_PR_BODY.md") {
    $prDescription = Get-Content "docs/CLEANUP_PR_BODY.md" -Raw
    
    # Inject dynamic file counts into template
    $prDescription = $prDescription -replace "Files Removed \(\d+\)", "Files Removed ($($existingLegacyFiles.Count))"
    $prDescription = $prDescription -replace "Files Modified \(\d+\)", "Files Modified ($($existingModifyFiles.Count))"
    
    # Add specific file listings
    if ($existingLegacyFiles.Count -gt 0) {
        $fileList = $existingLegacyFiles | ForEach-Object { "- [ ] ``$_`` (legacy state system)" } | Out-String
        $prDescription = $prDescription -replace "## Config changes", "### Files to Remove:`n$fileList`n## Config changes"
    }
    
    if ($existingModifyFiles.Count -gt 0) {
        $modifyList = $existingModifyFiles | ForEach-Object { "- [ ] ``$_`` - Remove conditional logic" } | Out-String  
        $prDescription = $prDescription -replace "## Config changes", "### Files to Modify:`n$modifyList`n## Config changes"
    }
    
    if ($DryRun) {
        Write-Host "[DRY RUN] Would use PR template with injected file counts"
        Write-Host $prDescription
    } else {
        $prDescription | Out-File "pr-cleanup-description.md" -Encoding UTF8
        git add "pr-cleanup-description.md"
        Write-Success "Created PR description from template"
    }
} else {
    Write-Warning "Template docs/CLEANUP_PR_BODY.md not found - creating basic description"
    $prDescription = @"
# Cleanup: Remove legacy FundStore paths

## Summary
Clean up legacy state management now that FundStore rollout is complete at 100%.

## Files to change
$($existingLegacyFiles.Count) files to remove, $($existingModifyFiles.Count) files to modify

See pr-cleanup-description.md for details.
"@
    
    if (-not $DryRun) {
        $prDescription | Out-File "pr-cleanup-description.md" -Encoding UTF8  
        git add "pr-cleanup-description.md"
        Write-Success "Created basic PR description"
    }
}

# Create initial commit
if ($DryRun) {
    Write-Host "[DRY RUN] Would create initial commit"
} else {
    git commit -m "🧹 Prepare cleanup PR for legacy state removal

- Add PR description template
- Analyze $($existingLegacyFiles.Count) files to remove
- Identify $($existingModifyFiles.Count) files to modify
- Ready for manual cleanup implementation"

    Write-Success "Created initial commit"
}

# Summary
Write-Host ""
Write-Host "🎉 Cleanup branch staged successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Manually remove legacy files and update conditional logic"
Write-Host "2. Run validation: npm test && npm run build"  
Write-Host "3. Test fund setup wizard: npm run dev"
Write-Host "4. Push branch: git push -u origin $branchName"
Write-Host "5. Create PR using pr-cleanup-description.md"
Write-Host ""
Write-Host "Branch: $branchName" -ForegroundColor Magenta
Write-Host "Template: pr-cleanup-description.md" -ForegroundColor Magenta

# Optional: Open VS Code
$openVSCode = Read-Host "Open VS Code to start cleanup? (y/N)"
if ($openVSCode -eq "y" -or $openVSCode -eq "Y") {
    if ($DryRun) {
        Write-Host "[DRY RUN] Would open VS Code"
    } else {
        code .
    }
}
