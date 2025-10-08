#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Victory lap celebration after successful fund store rollout
.DESCRIPTION
    Displays comprehensive deployment success metrics and cleanup next steps
    Run after reaching 100% rollout with stable metrics for 24+ hours
.PARAMETER ShowDetails
    Show detailed breakdown of metrics
.EXAMPLE
    pwsh scripts/victory-lap.ps1
    pwsh scripts/victory-lap.ps1 -ShowDetails
#>

param(
    [switch]$ShowDetails
)

$ErrorActionPreference = "Continue"

function Write-Victory($message) {
    Write-Host "🎉 $message" -ForegroundColor Green
}

function Write-Stat($label, $value, $status) {
    $color = "White"
    if ($status -eq "good") { $color = "Green" }
    if ($status -eq "warning") { $color = "Yellow" }
    if ($status -eq "error") { $color = "Red" }
    
    Write-Host "  $label " -NoNewline
    Write-Host "$value" -ForegroundColor $color
}

# Header
Clear-Host
Write-Host ""
Write-Host "🚀 FUND STORE MIGRATION COMPLETE!" -ForegroundColor Green -BackgroundColor DarkGreen
Write-Host "🚀 FUND STORE MIGRATION COMPLETE!" -ForegroundColor Green -BackgroundColor DarkGreen
Write-Host ""

# Current timestamp
$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
Write-Host "📅 Victory Date: $timestamp" -ForegroundColor Cyan
Write-Host ""

# Rollout Status
Write-Host "📊 Rollout Status:" -ForegroundColor Magenta

$rolloutPct = "Unknown"
$trackingEnabled = "Unknown"
$fundStoreEnabled = "Unknown"

try {
    if (Test-Path ".env") {
        $envContent = Get-Content ".env"
        foreach ($line in $envContent) {
            if ($line -match "^VITE_USE_FUND_STORE_ROLLOUT=(.*)$") {
                $rolloutPct = $matches[1]
            }
            if ($line -match "^VITE_TRACK_MIGRATIONS=(.*)$") {
                $trackingEnabled = $matches[1]
            }
            if ($line -match "^VITE_USE_FUND_STORE=(.*)$") {
                $fundStoreEnabled = $matches[1]
            }
        }
    }
} catch {
    # Use defaults
}

Write-Stat "Rollout Percentage:" $rolloutPct "good"
Write-Stat "Migration Tracking:" $trackingEnabled "good"
Write-Stat "Fund Store Default:" $fundStoreEnabled "good"
Write-Host ""

# Simple telemetry check
$errorCount = 0
$migrationCount = 0
$validationCount = 0
$totalEvents = 0
$telemetryFound = $false

try {
    if (Test-Path "telemetry-buffer.json") {
        $content = Get-Content "telemetry-buffer.json" -Raw
        if ($content) {
            $telemetry = $content | ConvertFrom-Json
            $totalEvents = $telemetry.Count
            $telemetryFound = $true
            
            foreach ($telemetryEvent in $telemetry) {
                if ($telemetryEvent.category -eq "error") { $errorCount++ }
                if ($telemetryEvent.category -eq "migration") { $migrationCount++ }
                if ($telemetryEvent.category -eq "validation") { $validationCount++ }
            }
        }
    }
} catch {
    Write-Warning "Could not read telemetry data"
}

# Display telemetry stats
if ($telemetryFound) {
    Write-Host "📈 Success Metrics:" -ForegroundColor Magenta
    Write-Stat "Total Events Tracked:" $totalEvents "good"
    
    $errorStatus = "good"
    if ($errorCount -gt 20) { $errorStatus = "error" }
    if ($errorCount -gt 5 -and $errorCount -le 20) { $errorStatus = "warning" }
    Write-Stat "Error Count:" $errorCount $errorStatus
    
    $errorScore = $errorCount * 5
    $scoreStatus = "good"
    if ($errorScore -gt 100) { $scoreStatus = "error" }
    if ($errorScore -gt 25 -and $errorScore -le 100) { $scoreStatus = "warning" }
    Write-Stat "Weighted Error Score:" $errorScore $scoreStatus
    
    Write-Stat "Migration Events:" $migrationCount "good"
    Write-Stat "Validation Events:" $validationCount "good"
    
    # Success rate calculation
    if ($migrationCount -gt 0) {
        $successRate = 100 - (($errorCount / $migrationCount) * 100)
        $successRateRounded = [Math]::Round($successRate, 1)
        
        $successStatus = "good"
        if ($successRateRounded -lt 95) { $successStatus = "error" }
        if ($successRateRounded -ge 95 -and $successRateRounded -lt 99.5) { $successStatus = "warning" }
        Write-Stat "Migration Success Rate:" "$successRateRounded%" $successStatus
    }
} else {
    Write-Host "📈 Success Metrics: " -ForegroundColor Magenta -NoNewline
    Write-Host "No telemetry data found" -ForegroundColor Yellow
}
Write-Host ""

# Git Info
Write-Host "🔧 Technical Details:" -ForegroundColor Magenta
try {
    $branch = git branch --show-current 2>$null
    Write-Stat "Current Branch:" $branch "good"
    
    $lastCommit = git log -1 --oneline 2>$null
    Write-Stat "Last Commit:" $lastCommit "good"
    
    $commitCount = git rev-list --count HEAD 2>$null
    Write-Stat "Total Commits:" $commitCount "good"
} catch {
    Write-Stat "Git Info:" "Not available" "warning"
}
Write-Host ""

# Achievements
Write-Host "🏆 Achievements Unlocked:" -ForegroundColor Yellow
Write-Victory "  Enterprise-grade feature rollout system implemented"
Write-Victory "  Weighted error monitoring with circuit breaker deployed"  
Write-Victory "  Multiple emergency rollback mechanisms in place"
Write-Victory "  Smart E2E triggering for risky code paths activated"
Write-Victory "  Comprehensive deployment runbook documented"
Write-Victory "  Legacy state system migration completed successfully"
Write-Host ""

# Next Steps
Write-Host "🎯 Recommended Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Run cleanup after 24h stable at 100%:" -ForegroundColor White
Write-Host "     pwsh scripts/stage-cleanup-pr.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Consider disabling migration tracking:" -ForegroundColor White  
Write-Host "     VITE_TRACK_MIGRATIONS=0" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. Archive deployment artifacts:" -ForegroundColor White
$dateFolder = Get-Date -Format 'yyyy-MM-dd'
Write-Host "     mkdir -p docs/deployments/$dateFolder" -ForegroundColor Gray
Write-Host "     cp telemetry-buffer.json docs/deployments/$dateFolder/rollout-telemetry.json" -ForegroundColor Gray
Write-Host ""
Write-Host "  4. Update team on successful migration" -ForegroundColor White
Write-Host ""

# Detailed breakdown if requested
if ($ShowDetails -and $telemetryFound) {
    Write-Host "🔍 Detailed Telemetry Breakdown:" -ForegroundColor Magenta
    
    try {
        $telemetryContent = Get-Content "telemetry-buffer.json" -Raw | ConvertFrom-Json
        $categories = $telemetryContent | Group-Object -Property category
        
        foreach ($category in $categories) {
            Write-Host "  $($category.Name): $($category.Count) events" -ForegroundColor White
        }
        
        Write-Host ""
        Write-Host "📱 Emergency Controls Still Available:" -ForegroundColor Magenta
        Write-Host "  URL Parameter: ?emergency_rollback=true" -ForegroundColor Gray
        Write-Host "  User Override: ?ff_useFundStore=0" -ForegroundColor Gray  
        Write-Host "  Console: localStorage.setItem('emergency_rollback','true')" -ForegroundColor Gray
    } catch {
        Write-Warning "Could not show detailed breakdown"
    }
}

# Footer
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "🎊 CONGRATULATIONS! The fund store migration is complete! 🎊" -ForegroundColor Green
Write-Host "   Thank you for using enterprise-grade deployment practices." -ForegroundColor Green  
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""

# Optional celebration
$celebrate = Read-Host "🎉 Open confetti in browser to celebrate? (y/N)"
if ($celebrate -eq "y" -or $celebrate -eq "Y") {
    try {
        Start-Process "https://codepen.io/juliangarnier/pen/gmOwJX"
    } catch {
        Write-Host "🎊 Imagine confetti here! 🎊" -ForegroundColor Yellow
    }
}
