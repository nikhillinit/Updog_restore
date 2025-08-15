param(
  [int]$StartAt = 10,
  [int]$MaxPercent = 100,
  [int]$SoakMinutes = 60,
  [string]$BaseUrl = "",
  [string]$RuntimeConfigPath = "public/runtime-config.json",
  [switch]$DryRun,
  [switch]$AutoRevert
)

# Auto-rollout helper for progressive deployment
# Automatically advances through rollout stages with validation

$ErrorActionPreference = "Stop"
$stages = @(10, 25, 50, 100) | Where-Object { $_ -ge $StartAt -and $_ -le $MaxPercent }

Write-Host "🚀 Auto-Rollout Starting" -ForegroundColor Green
Write-Host "   Stages: $($stages -join ' → ')%"
Write-Host "   Soak time: $SoakMinutes min per stage"
Write-Host "   Base URL: $BaseUrl"
Write-Host "   Config: $RuntimeConfigPath"

if ($DryRun) {
  Write-Host "   🔍 DRY RUN MODE - No actual changes" -ForegroundColor Yellow
}

function Update-RuntimeConfig([int]$RolloutPercent) {
  if (-not (Test-Path $RuntimeConfigPath)) {
    throw "Runtime config not found: $RuntimeConfigPath"
  }
  
  $config = Get-Content $RuntimeConfigPath | ConvertFrom-Json
  $config.flags.useFundStore.rollout = $RolloutPercent
  
  if ($DryRun) {
    Write-Host "   [DRY RUN] Would update rollout to $RolloutPercent%" -ForegroundColor Yellow
  } else {
    $config | ConvertTo-Json -Depth 10 | Set-Content $RuntimeConfigPath
    Write-Host "   ✅ Updated runtime config: $RolloutPercent%" -ForegroundColor Green
  }
}

function Invoke-SmokeTest() {
  if ($BaseUrl) {
    Write-Host "   🔍 Running smoke tests..." -ForegroundColor Cyan
    if ($DryRun) {
      Write-Host "   [DRY RUN] Would run: pwsh scripts/smoke-test-prod.ps1 -BaseUrl $BaseUrl" -ForegroundColor Yellow
      Start-Sleep 2
    } else {
      try {
        & pwsh scripts/smoke-test-prod.ps1 -BaseUrl $BaseUrl
      } catch {
        Write-Warning "Smoke test failed: $($_.Exception.Message)"
        throw "Smoke test failure - halting rollout"
      }
    }
  } else {
    Write-Host "   ⏩ Skipping smoke tests (no BaseUrl provided)" -ForegroundColor Yellow
  }
}

function Invoke-Monitoring([int]$Minutes) {
  Write-Host "   📊 Monitoring for $Minutes minutes..." -ForegroundColor Cyan
  if ($DryRun) {
    Write-Host "   [DRY RUN] Would run: pwsh scripts/monitor-deployment.ps1 -MinutesToMonitor $Minutes $(if ($AutoRevert) { '-AutoRevert' } else { '' })" -ForegroundColor Yellow
    Start-Sleep 5  # Simulate monitoring time in dry run
  } else {
    try {
      $monitorArgs = @("-MinutesToMonitor", $Minutes)
      if ($AutoRevert) { $monitorArgs += "-AutoRevert" }
      & pwsh scripts/monitor-deployment.ps1 @monitorArgs
    } catch {
      Write-Error "❌ Monitoring failed: $($_.Exception.Message)"
      throw "Monitoring threshold breach - halting rollout"
    }
  }
}

# Execute rollout progression
foreach ($pct in $stages) {
  Write-Host "`n🎯 Rolling out to $pct%..." -ForegroundColor Blue
  
  try {
    # 1. Update runtime config
    Update-RuntimeConfig -RolloutPercent $pct
    
    # 2. Wait for config propagation (TTL is 60s)
    if (-not $DryRun) {
      Write-Host "   ⏳ Waiting 30s for config propagation..." -ForegroundColor Yellow
      Start-Sleep 30
    }
    
    # 3. Run smoke tests
    Invoke-SmokeTest
    
    # 4. Monitor the rollout
    $soakTime = if ($pct -eq 10) { 15 } else { $SoakMinutes }  # Shorter canary soak
    Invoke-Monitoring -Minutes $soakTime
    
    Write-Host "   ✅ Stage $pct% completed successfully" -ForegroundColor Green
    
  } catch {
    Write-Host "   ❌ Stage $pct% failed: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($pct -gt 10) {
      # Rollback to previous stage
      $previousStage = $stages | Where-Object { $_ -lt $pct } | Select-Object -Last 1
      if ($previousStage) {
        Write-Host "   🔄 Rolling back to $previousStage%..." -ForegroundColor Yellow
        Update-RuntimeConfig -RolloutPercent $previousStage
      }
    } else {
      # Rollback to 0% if canary fails
      Write-Host "   🔄 Rolling back to 0%..." -ForegroundColor Yellow
      Update-RuntimeConfig -RolloutPercent 0
    }
    
    exit 1
  }
}

Write-Host "`n🎉 Auto-rollout completed successfully!" -ForegroundColor Green
Write-Host "   Final rollout: $MaxPercent%"
Write-Host "   Next steps:"
Write-Host "   - Run: pwsh scripts/victory-lap.ps1 -ShowDetails" -ForegroundColor Cyan
Write-Host "   - Wait 24h, then: pwsh scripts/stage-cleanup-pr.ps1" -ForegroundColor Cyan

# Final validation
if ($BaseUrl -and -not $DryRun) {
  Write-Host "`n🔍 Final smoke test at $MaxPercent%..." -ForegroundColor Cyan
  Invoke-SmokeTest
}
