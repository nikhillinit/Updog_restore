#!/usr/bin/env pwsh
param(
  [Parameter(Mandatory=$true)][int]$PR,
  [int]$MonitorMinutes = 30,
  [int]$ErrorThreshold = 3,
  [switch]$AutoRevert,  # Enable automatic rollback
  [switch]$SkipE2E,     # Skip E2E tests (use with caution)
  [switch]$DryRun      # Preview actions without execution
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 DEPLOYMENT WITH CONFIDENCE" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan
Write-Host "PR: #$PR" -ForegroundColor White
Write-Host "Monitor: $MonitorMinutes minutes (threshold: $ErrorThreshold errors)" -ForegroundColor Gray
Write-Host "Auto-revert: $(if ($AutoRevert) { 'ENABLED' } else { 'DISABLED' })" -ForegroundColor $(if ($AutoRevert) { 'Yellow' } else { 'Green' })
if ($DryRun) { 
  Write-Host "🧪 DRY RUN MODE - No actual changes will be made" -ForegroundColor Magenta 
}
Write-Host ""

function Invoke-Step {
  param([string]$Name, [scriptblock]$Action, [bool]$Required = $true)
  
  Write-Host "📋 $Name..." -ForegroundColor Cyan
  if ($DryRun) {
    Write-Host "   [DRY RUN] Would execute: $($Action.ToString())" -ForegroundColor Magenta
    return $true
  }
  
  try {
    $result = & $Action
    if ($LASTEXITCODE -eq 0 -or $null -eq $LASTEXITCODE) {
      Write-Host "   ✅ $Name completed" -ForegroundColor Green
      return $true
    } else {
      Write-Host "   ❌ $Name failed (exit code: $LASTEXITCODE)" -ForegroundColor Red
      return $false
    }
  } catch {
    Write-Host "   ❌ $Name failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($Required) {
      throw "Required step '$Name' failed"
    }
    return $false
  }
}

function Test-Prerequisites {
  $checks = @(
    @{ Name = "GitHub CLI"; Test = { gh --version | Out-Null } },
    @{ Name = "Git"; Test = { git --version | Out-Null } },
    @{ Name = "Node.js"; Test = { node --version | Out-Null } },
    @{ Name = "PowerShell"; Test = { $PSVersionTable.PSVersion.Major -ge 5 } }
  )
  
  foreach ($check in $checks) {
    try {
      & $check.Test | Out-Null
      Write-Host "   ✅ $($check.Name)" -ForegroundColor Green
    } catch {
      Write-Host "   ❌ $($check.Name) missing or failed" -ForegroundColor Red
      throw "Prerequisite check failed: $($check.Name)"
    }
  }
}

# 🔍 PHASE 1: VALIDATION
Write-Host "🔍 PHASE 1: PRE-DEPLOYMENT VALIDATION" -ForegroundColor Yellow
Write-Host "=======================================" -ForegroundColor Yellow

Invoke-Step "Check Prerequisites" { Test-Prerequisites }

Invoke-Step "Validate PR" { 
  .\scripts\validate-local.ps1 -PR $PR -Verbose
}

if (-not $SkipE2E) {
  Invoke-Step "Add E2E Label" { 
    gh pr edit $PR --add-label "e2e" 
  }
  
  Write-Host "⏳ Waiting for CI to complete with E2E tests..." -ForegroundColor Yellow
  $timeout = 300  # 5 minutes
  $elapsed = 0
  do {
    Start-Sleep -Seconds 15
    $elapsed += 15
    $status = gh pr checks $PR --json state,conclusion -q ".[0].state"
    Write-Host "   CI Status: $status (${elapsed}s elapsed)" -ForegroundColor Gray
  } while ($status -eq "IN_PROGRESS" -and $elapsed -lt $timeout)
  
  if ($status -ne "COMPLETED") {
    throw "CI did not complete within timeout or failed"
  }
}

# 🚀 PHASE 2: DEPLOYMENT
Write-Host ""
Write-Host "🚀 PHASE 2: DEPLOYMENT" -ForegroundColor Yellow  
Write-Host "======================" -ForegroundColor Yellow

Invoke-Step "Finalize PR (No Auto-merge)" { 
  .\scripts\finalize-pr.ps1 -PR $PR $(if (-not $SkipE2E) { "-RunE2E" } else { "" }) -NoMerge
}

# Additional validation can run in parallel here if needed
Write-Host "✅ PR prepared for merge. Enabling auto-merge now..." -ForegroundColor Green

Invoke-Step "Enable Auto-merge" {
  gh pr merge $PR --squash --auto
}

Write-Host "⏳ Waiting for auto-merge..." -ForegroundColor Yellow
$mergeTimeout = 300  # 5 minutes
$mergeElapsed = 0
do {
  Start-Sleep -Seconds 15
  $mergeElapsed += 15
  try {
    $prState = gh pr view $PR --json state -q ".state"
    if ($prState -eq "MERGED") {
      Write-Host "   ✅ PR merged successfully!" -ForegroundColor Green
      break
    }
    Write-Host "   PR State: $prState (${mergeElapsed}s elapsed)" -ForegroundColor Gray
  } catch {
    Write-Warning "Could not check PR state: $($_.Exception.Message)"
  }
} while ($mergeElapsed -lt $mergeTimeout)

if ($prState -ne "MERGED") {
  throw "PR did not merge within timeout"
}

# 📊 PHASE 3: MONITORING
Write-Host ""
Write-Host "📊 PHASE 3: POST-DEPLOYMENT MONITORING" -ForegroundColor Yellow
Write-Host "=======================================" -ForegroundColor Yellow

Write-Host "⏳ Brief cooldown before monitoring..." -ForegroundColor Gray
Start-Sleep -Seconds 30

Invoke-Step "Monitor Deployment" { 
  .\scripts\monitor-deployment.ps1 -MinutesToMonitor $MonitorMinutes -ErrorThreshold $ErrorThreshold $(if ($AutoRevert) { "-AutoRevert" } else { "" })
} -Required $false

# 🎉 FINAL RESULTS
Write-Host ""
if ($LASTEXITCODE -eq 0 -or $null -eq $LASTEXITCODE) {
  Write-Host "🎉 DEPLOYMENT SUCCESSFUL!" -ForegroundColor Green
  Write-Host "========================" -ForegroundColor Green
  Write-Host ""
  Write-Host "✅ PR #$PR has been successfully deployed to production" -ForegroundColor Green
  Write-Host "✅ No critical errors detected during $MonitorMinutes-minute monitoring window" -ForegroundColor Green
  Write-Host "📊 Check telemetry dashboard for detailed metrics" -ForegroundColor Cyan
  
  # Show deployment summary
  Write-Host ""
  Write-Host "📋 Deployment Summary:" -ForegroundColor Cyan
  Write-Host "   - PR: #$PR" -ForegroundColor White
  Write-Host "   - Monitoring: $MonitorMinutes minutes" -ForegroundColor White
  Write-Host "   - Error threshold: $ErrorThreshold" -ForegroundColor White
  Write-Host "   - Auto-revert: $(if ($AutoRevert) { 'Enabled' } else { 'Disabled' })" -ForegroundColor White
  Write-Host "   - E2E Tests: $(if ($SkipE2E) { 'Skipped' } else { 'Included' })" -ForegroundColor White
  
} else {
  Write-Host "🚨 DEPLOYMENT ISSUES DETECTED!" -ForegroundColor Red
  Write-Host "==============================" -ForegroundColor Red
  Write-Host ""
  Write-Host "❌ Monitoring detected $ErrorThreshold+ errors" -ForegroundColor Red
  if ($AutoRevert) {
    Write-Host "🔄 Auto-revert was attempted - check GitHub for revert PR" -ForegroundColor Yellow
  } else {
    Write-Host "⚠️  Manual intervention may be required" -ForegroundColor Yellow
    Write-Host "💡 Consider running: pwsh scripts/monitor-deployment.ps1 -AutoRevert" -ForegroundColor Cyan
  }
}

Write-Host ""
Write-Host "🔗 Useful links:" -ForegroundColor Cyan
Write-Host "   - PR: $(gh pr view $PR --json url -q '.url')" -ForegroundColor Blue
Write-Host "   - Actions: https://github.com/$(gh repo view --json owner,name -q '.owner.login + `/` + .name')/actions" -ForegroundColor Blue
Write-Host "   - Telemetry: [Your telemetry dashboard URL]" -ForegroundColor Blue

exit $LASTEXITCODE
