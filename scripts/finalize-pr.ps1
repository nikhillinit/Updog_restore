#!/usr/bin/env pwsh
param(
  [Parameter(Mandatory=$true)][int]$PR,
  [switch]$RunE2E, # Adds 'e2e' label to trigger label-gated workflow
  [switch]$NoMerge # Skip auto-merge; just prep PR for manual merge
)
$ErrorActionPreference = "Stop"

Write-Host "🔎 Checking PR #$PR..." -ForegroundColor Cyan
try {
  $info = gh pr view $PR --json number,state,isDraft,mergeable,mergeStateStatus,labels,headRefName,baseRefName,author -q "." | ConvertFrom-Json
} catch {
  throw "PR #$PR not found or gh CLI error: $($_.Exception.Message)"
}

# Already merged/closed guard
$state = $info.state
if ($state -ne "OPEN") {
  Write-Host "ℹ️ PR #$PR is $state; nothing to finalize." -ForegroundColor Yellow
  exit 0
}

# Label management (idempotent)
$labelsToAdd = @("enhancement","automerge-candidate","low-risk")
if ($RunE2E) { $labelsToAdd += "e2e" }
Write-Host "🏷️ Adding labels: $($labelsToAdd -join ', ')..." -ForegroundColor Cyan
foreach ($label in $labelsToAdd) {
  try {
    gh pr edit $PR --add-label $label | Out-Null
  } catch {
    Write-Warning "Could not add label '$label' (might already exist or permissions issue)"
  }
}

# Flip out of draft if needed
if ($info.isDraft -eq $true) {
  Write-Host "📝 Converting from draft to ready..." -ForegroundColor Cyan
  gh pr ready $PR | Out-Null
  Write-Host "✅ PR is ready for review." -ForegroundColor Green
}

# Attempt to enable auto-merge (squash) - unless NoMerge is set
if (-not $NoMerge) {
  Write-Host "🔄 Enabling auto-merge (squash)..." -ForegroundColor Cyan
  try {
    gh pr merge $PR --squash --auto | Out-Null
    Write-Host "✅ Auto-merge enabled (squash)." -ForegroundColor Green
  } catch {
    Write-Warning "Couldn't enable auto-merge (branch protection or permissions?). You can enable manually in the UI."
  }
} else {
  Write-Host "⏸️ Skipping auto-merge (NoMerge flag set). Enable manually after validation." -ForegroundColor Yellow
}

# Open PR in browser
Write-Host "🌐 Opening PR in browser..." -ForegroundColor Cyan
gh pr view $PR --web

Write-Host "✅ PR #$PR finalized successfully!" -ForegroundColor Green
if ($RunE2E) {
  Write-Host "🧪 E2E tests will trigger via 'e2e' label" -ForegroundColor Blue
}
