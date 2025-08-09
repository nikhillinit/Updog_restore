#!/usr/bin/env pwsh
# Enhanced Solo PR Setup Script
# Transitions PRs from review phase to merge-ready phase with intelligent automation
param(
    [Parameter(Mandatory=$true)]
    [int]$PR,
    
    [int]$ParentPR = 0,  # Auto-detect if not specified
    [switch]$DryRun,
    [switch]$AutoMerge,  # Trigger merge script when ready
    [switch]$Force       # Skip confirmations
)

$ErrorActionPreference = "Stop"

# Import color functions from merge script for consistency
function Write-Step($m){ Write-Host "`n▶ $m" -ForegroundColor Cyan }
function Write-Ok($m){ Write-Host "✔ $m" -ForegroundColor Green }
function Write-Warn($m){ Write-Host "⚠ $m" -ForegroundColor Yellow }
function Write-Error($m){ Write-Host "✖ $m" -ForegroundColor Red }
function Write-Info($m){ Write-Host "ℹ $m" -ForegroundColor Blue }

try {
    Write-Step "Validating PR #$PR"
    
    # Check if PR exists
    $prData = gh pr view $PR --json number,title,labels,state,author,baseRefName,headRefName,statusCheckRollup,mergeable,mergeStateStatus 2>$null
    if (-not $prData) {
        throw "PR #$PR not found"
    }
    $prData = $prData | ConvertFrom-Json
    
    # Show PR info
    Write-Info "Title: $($prData.title)"
    Write-Info "Author: $($prData.author.login)"
    Write-Info "Branch: $($prData.headRefName) → $($prData.baseRefName)"
    
    # Check if already ready
    $currentLabels = @()
    if ($prData.labels) {
        $currentLabels = $prData.labels | ForEach-Object { $_.name }
    }
    if ($currentLabels -contains "ready-to-merge") {
        Write-Warn "PR already marked as ready-to-merge"
        if (-not $Force) {
            $response = Read-Host "Continue anyway? (y/N)"
            if ($response -ne 'y') { exit 0 }
        }
    }
    
    # Auto-detect parent PR if stacked
    if ($ParentPR -eq 0 -and $currentLabels -contains "stacked") {
        Write-Step "Detecting parent PR"
        
        # Try to extract from PR body or title
        $prBody = gh pr view $PR --json body -q .body 2>$null
        if ($prBody -and $prBody -match '#(\d+)') {
            $ParentPR = [int]$Matches[1]
            Write-Ok "Detected parent PR: #$ParentPR"
        } else {
            Write-Warn "Could not auto-detect parent PR. Treating as standalone."
        }
    }
    
    Write-Step "Analyzing PR status"
    
    # Enhanced status parsing
    $checksReady = $false
    $checkStatus = if ($prData.statusCheckRollup -and $prData.statusCheckRollup.state) {
        switch ($prData.statusCheckRollup.state) {
            "SUCCESS" { 
                Write-Ok "All checks passed"
                $checksReady = $true
                "✅ Passed" 
            }
            "PENDING" { 
                Write-Info "Checks still running..."
                $checksReady = $false
                
                # Show basic pending status (detailed check info available via gh pr checks)
                Write-Host "  Use 'gh pr checks $PR' for detailed status" -ForegroundColor Gray
                "⏳ Running" 
            }
            "FAILURE" { 
                Write-Error "Some checks failed"
                $checksReady = $false
                
                # Show basic failure status (detailed check info available via gh pr checks)
                Write-Host "  Use 'gh pr checks $PR' for detailed status" -ForegroundColor Gray
                "❌ Failed" 
            }
            default { 
                Write-Warn "Unknown check status"
                $checksReady = $false
                "❓ Unknown" 
            }
        }
    } else {
        Write-Warn "No status checks configured"
        $checksReady = $true  # Assume ready if no checks
        "❓ No checks"
    }
    
    # Check mergeable state
    $mergeStatus = switch ($prData.mergeStateStatus) {
        "CLEAN" { "✅ Ready to merge" }
        "UNSTABLE" { "⚠️ Unstable (checks pending)" }
        "BLOCKED" { "🚫 Blocked (requirements not met)" }
        "BEHIND" { "⏪ Behind base branch" }
        "DIRTY" { "❌ Merge conflicts" }
        default { "❓ $($prData.mergeStateStatus)" }
    }
    
    Write-Info "Merge status: $mergeStatus"
    
    # Parent PR status (if stacked)
    $parentReady = $true
    if ($ParentPR -gt 0) {
        Write-Step "Checking parent PR #$ParentPR"
        $parentData = gh pr view $ParentPR --json mergedAt,state 2>$null | ConvertFrom-Json
        
        if ($parentData.mergedAt) {
            Write-Ok "Parent PR already merged!"
            $parentReady = $true
        } elseif ($parentData.state -eq "OPEN") {
            Write-Warn "Parent PR still open - will need to wait"
            $parentReady = $false
            
            # Estimate wait time based on parent's status
            $parentChecks = gh pr view $ParentPR --json statusCheckRollup -q .statusCheckRollup.state 2>$null
            if ($parentChecks -eq "SUCCESS") {
                Write-Info "Parent checks passed - should merge soon"
            } else {
                Write-Info "Parent checks status: $parentChecks"
            }
        } else {
            Write-Error "Parent PR in unexpected state: $($parentData.state)"
            $parentReady = $false
        }
    }
    
    # Update labels
    if (-not $DryRun) {
        Write-Step "Updating labels"
        
        # Remove review-related labels
        $removeLabels = @("needs-review", "awaiting-review", "changes-requested")
        $removeArgs = $removeLabels | Where-Object { $currentLabels -contains $_ } | ForEach-Object { "--remove-label", $_ }
        
        # Add status labels
        $addLabels = @()
        if ($checksReady -and $parentReady) {
            $addLabels += "ready-to-merge"
        } elseif (-not $parentReady) {
            $addLabels += "waiting-on-parent"
        } elseif (-not $checksReady) {
            $addLabels += "fixing-checks"
        }
        
        $addArgs = $addLabels | ForEach-Object { "--add-label", $_ }
        
        if ($removeArgs -or $addArgs) {
            $allArgs = @($PR) + $removeArgs + $addArgs
            gh pr edit @allArgs
            Write-Ok "Labels updated"
        }
        
        # Add simple status comment 
        if (-not $Force) {
            gh pr comment $PR --body "🤖 Solo PR setup completed - labels updated by automation script"
            Write-Ok "Status comment added"
        }
    } else {
        Write-Warn "DRY RUN - No changes made"
        Write-Host "`nWould update labels:" -ForegroundColor Yellow
        Write-Host "  Remove: needs-review" -ForegroundColor Red
        Write-Host "  Add: $(if ($checksReady -and $parentReady) { 'ready-to-merge' } elseif (-not $parentReady) { 'waiting-on-parent' } else { 'fixing-checks' })" -ForegroundColor Green
    }
    
    # Show summary
    Write-Host "`n" + ("="*50) -ForegroundColor DarkGray
    Write-Host "SUMMARY" -ForegroundColor White
    Write-Host ("="*50) -ForegroundColor DarkGray
    
    $summary = [PSCustomObject]@{
        "PR" = "#$PR"
        "Checks" = $checkStatus
        "Mergeable" = $mergeStatus
        "Parent" = if ($ParentPR -gt 0) { "#$ParentPR $(if ($parentReady) { '✅' } else { '⏳' })" } else { "N/A" }
        "Ready" = if ($checksReady -and $parentReady) { "✅ YES" } else { "❌ NO" }
    }
    
    $summary | Format-Table -AutoSize
    
    # Smart next steps
    Write-Host "`nNEXT STEPS:" -ForegroundColor Yellow
    
    if ($checksReady -and $parentReady) {
        Write-Host "✅ PR is ready to merge!" -ForegroundColor Green
        
        if ($AutoMerge) {
            Write-Step "Auto-triggering merge"
            if ($ParentPR -gt 0) {
                & "$PSScriptRoot/merge-stacked-pr-enhanced.ps1" -Parent $ParentPR -Child $PR
            } else {
                gh pr merge $PR --squash --auto
            }
        } else {
            Write-Host "`nRun one of these commands:" -ForegroundColor Cyan
            if ($ParentPR -gt 0) {
                Write-Host "  pwsh scripts/merge-stacked-pr-enhanced.ps1 -Parent $ParentPR -Child $PR"
            }
            Write-Host "  gh pr merge $PR --squash"
        }
    } elseif (-not $parentReady) {
        Write-Host "⏳ Waiting for parent PR #$ParentPR" -ForegroundColor Yellow
        Write-Host "`nYou can:" -ForegroundColor Cyan
        Write-Host "  1. Run: pwsh scripts/merge-stacked-pr-enhanced.ps1 -Parent $ParentPR -Child $PR"
        Write-Host "     (it will wait for parent automatically)"
        Write-Host "  2. Or wait and run this script again with -AutoMerge flag"
    } elseif (-not $checksReady -and $prData.statusCheckRollup.state -eq "PENDING") {
        Write-Host "⏳ Checks still running" -ForegroundColor Yellow
        Write-Host "`nRun this again in a few minutes:" -ForegroundColor Cyan
        if ($ParentPR -gt 0) {
            Write-Host "  pwsh scripts/solo-pr-setup.ps1 -PR $PR -ParentPR $ParentPR"
        } else {
            Write-Host "  pwsh scripts/solo-pr-setup.ps1 -PR $PR"
        }
    } else {
        Write-Host "🔧 Fix the issues above first" -ForegroundColor Yellow
    }
    
} catch {
    Write-Error "Failed: $_"
    exit 1
}
