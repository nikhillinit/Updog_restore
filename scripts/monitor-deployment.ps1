#!/usr/bin/env pwsh
param(
  [int]$MinutesToMonitor = 30,
  [int]$ErrorThreshold = 5,
  [switch]$AutoRevert,  # Enable automatic revert (use with caution)
  [string]$TelemetrySource = "./telemetry-buffer.json"  # Path to telemetry data
)

$ErrorActionPreference = "Stop"
$startTime = Get-Date

# If caller didn't pass -ErrorThreshold, fallback to env var or 15
if (-not $PSBoundParameters.ContainsKey('ErrorThreshold')) {
  $envThreshold = [int]([Environment]::GetEnvironmentVariable('VITE_ERROR_SCORE_THRESHOLD') ?? '0')
  if ($envThreshold -gt 0) { $ErrorThreshold = $envThreshold } else { $ErrorThreshold = 15 }
}

Write-Host "🔍 Starting deployment monitoring..." -ForegroundColor Cyan
Write-Host "⏱️  Duration: $MinutesToMonitor minutes" -ForegroundColor Gray
Write-Host "🧭 Using error threshold: $ErrorThreshold" -ForegroundColor Gray
Write-Host "🔄 Auto-revert: $(if ($AutoRevert) { 'ENABLED' } else { 'DRY RUN' })" -ForegroundColor $(if ($AutoRevert) { 'Yellow' } else { 'Green' })
Write-Host ""

function Get-ErrorScore {
  try {
    # Try reading from telemetry file first
    if (Test-Path $TelemetrySource) {
      $telemetryData = Get-Content $TelemetrySource -ErrorAction SilentlyContinue | ConvertFrom-Json -ErrorAction SilentlyContinue
      if ($telemetryData) {
        $score = 0
        foreach ($telemetryEvent in $telemetryData) {
          if ($telemetryEvent.category -eq 'error' -and $telemetryEvent.ok -eq $false) {
            # Weighted scoring based on error severity
            switch -Wildcard ($telemetryEvent.event) {
              "*migration*" { $score += 10 }  # Critical: migration failures
              "*validation*" { $score += 5 }   # Moderate: validation errors
              "*warning*" { $score += 1 }      # Low: console warnings
              default { $score += 3 }          # Default: standard errors
            }
          }
        }
        return @{ Score = $score; Count = ($telemetryData | Where-Object { $_.category -eq 'error' -and $_.ok -eq $false }).Count }
      }
    }
    
    # Fallback: Check GitHub issues with production-issue label (simple count)
    try {
      $repoInfo = gh repo view --json owner,name | ConvertFrom-Json
      $issueCount = (gh api "/repos/$($repoInfo.owner.login)/$($repoInfo.name)/issues" --jq "[.[] | select(.labels[].name == 'production-issue')] | length") -as [int]
      return @{ Score = $issueCount * 5; Count = $issueCount }  # Each issue = 5 points
    } catch {
      Write-Warning "Could not fetch GitHub issues: $($_.Exception.Message)"
      return @{ Score = 0; Count = 0 }
    }
  } catch {
    Write-Warning "Error reading telemetry: $($_.Exception.Message)"
    return @{ Score = 0; Count = 0 }
  }
}

function Get-LatestMergeCommit {
  try {
    git fetch origin main --quiet
    $latestCommit = git log origin/main -1 --pretty=format:"%H %s"
    return $latestCommit.Split(' ')[0]
  } catch {
    Write-Warning "Could not fetch latest commit: $($_.Exception.Message)"
    return $null
  }
}

function Create-RevertPR {
  param([string]$CommitSha)
  
  try {
    $branchName = "revert/$CommitSha"
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    
    Write-Host "🔄 Creating revert branch: $branchName" -ForegroundColor Yellow
    
    # Create revert branch
    git switch -c $branchName 2>$null
    if ($LASTEXITCODE -ne 0) {
      git checkout -b $branchName 2>$null
    }
    
    # Create revert commit
    git revert $CommitSha --no-edit --quiet
    git push -u origin $branchName --quiet
    
    # Create PR
    $prBody = @"
## 🚨 Automated Rollback

**Trigger:** Error threshold exceeded during deployment monitoring
**Timestamp:** $timestamp  
**Reverted Commit:** $CommitSha
**Error Count:** $script:currentErrors (threshold: $ErrorThreshold)

### Next Steps
1. **Review telemetry** to identify root cause
2. **Verify rollback** resolves issues  
3. **Fix underlying issue** before re-deploying
4. **Merge this PR** to complete rollback

### Monitoring Details
- Monitoring duration: $MinutesToMonitor minutes
- Error threshold: $ErrorThreshold events
- Data source: $TelemetrySource

*This PR was created automatically by deployment monitoring.*
"@
    
    gh pr create --title "🚨 Auto-rollback: Revert $($CommitSha.Substring(0,8))" `
      --body $prBody `
      --label "hotfix,rollback,auto-created" `
      --assignee "@me"
    
    Write-Host "✅ Revert PR created successfully" -ForegroundColor Green
    return $true
  } catch {
    Write-Error "Failed to create revert PR: $($_.Exception.Message)"
    return $false
  }
}

# Main monitoring loop with circuit breaker pattern
$script:currentErrors = 0
$checkCount = 0
$backoffMs = 1000
$maxBackoff = 60000
$consecutiveErrors = 0

while ((Get-Date) -lt $startTime.AddMinutes($MinutesToMonitor)) {
  $checkCount++
  $errorInfo = Get-ErrorScore
  $script:currentErrors = $errorInfo.Count
  $errorScore = $errorInfo.Score
  $elapsed = [math]::Round(((Get-Date) - $startTime).TotalMinutes, 1)
  $remaining = $MinutesToMonitor - $elapsed
  
  $status = "$(Get-Date -Format 'HH:mm:ss') | Check #$checkCount | Errors: $script:currentErrors (score: $errorScore) | Remaining: $([math]::Max(0, $remaining)) min"
  
  if ($errorScore -eq 0) {
    Write-Host "✅ $status" -ForegroundColor Green
    $consecutiveErrors = 0
    $backoffMs = 1000  # Reset backoff
  } elseif ($errorScore -lt $ErrorThreshold) {
    Write-Host "⚠️  $status" -ForegroundColor Yellow
    $consecutiveErrors = 0
    $backoffMs = 1000  # Reset backoff
  } else {
    Write-Host "🚨 $status" -ForegroundColor Red
    $consecutiveErrors++
    
    # Circuit breaker: exponential backoff when errors persist
    if ($consecutiveErrors -gt 1) {
      $backoffMs = [math]::Min($backoffMs * 2, $maxBackoff)
      Write-Host "⏸️  Circuit breaker: backing off for $([math]::Round($backoffMs/1000, 1))s due to persistent errors" -ForegroundColor Yellow
      Start-Sleep -Milliseconds $backoffMs
    }
    
    # Exit if consistently above threshold
    if ($consecutiveErrors -ge 3) {
      Write-Host "🚨 Consistent error score threshold exceeded ($consecutiveErrors checks)" -ForegroundColor Red
      break
    }
  }
  
  Start-Sleep -Seconds 60
}

# Final assessment
Write-Host ""
$finalErrorInfo = Get-ErrorScore
$finalErrorScore = $finalErrorInfo.Score
$script:currentErrors = $finalErrorInfo.Count

if ($finalErrorScore -gt $ErrorThreshold) {
  Write-Host "🚨 ERROR SCORE THRESHOLD EXCEEDED!" -ForegroundColor Red
  Write-Host "   Current errors: $script:currentErrors (score: $finalErrorScore)" -ForegroundColor Red
  Write-Host "   Threshold: $ErrorThreshold" -ForegroundColor Red
  
  if ($AutoRevert) {
    Write-Host "🔄 Attempting automatic rollback..." -ForegroundColor Yellow
    $mergeCommit = Get-LatestMergeCommit
    if ($mergeCommit) {
      $success = Create-RevertPR -CommitSha $mergeCommit
      if ($success) {
        Write-Host "✅ Automatic rollback initiated!" -ForegroundColor Green
        Write-Host "🔗 Check your GitHub repo for the revert PR" -ForegroundColor Cyan
      } else {
        Write-Host "❌ Automatic rollback failed - manual intervention required" -ForegroundColor Red
      }
    } else {
      Write-Host "❌ Could not identify commit to revert" -ForegroundColor Red
    }
  } else {
    Write-Host "🔍 DRY RUN: Would have created revert PR for latest merge commit" -ForegroundColor Yellow
    $mergeCommit = Get-LatestMergeCommit
    if ($mergeCommit) {
      Write-Host "   Target commit: $mergeCommit" -ForegroundColor Gray
      Write-Host "   Run with -AutoRevert to enable automatic rollback" -ForegroundColor Gray
    }
  }
  
  exit 1
} else {
  Write-Host "✅ Deployment monitoring completed successfully!" -ForegroundColor Green
  Write-Host "   Total errors: $script:currentErrors (under threshold of $ErrorThreshold)" -ForegroundColor Green
  Write-Host "   Duration: $MinutesToMonitor minutes" -ForegroundColor Green
  exit 0
}
