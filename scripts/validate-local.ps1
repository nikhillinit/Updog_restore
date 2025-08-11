#!/usr/bin/env pwsh
param(
  [switch]$SkipTests,
  [switch]$OpenReport
)
$ErrorActionPreference = "Stop"

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

./scripts/preflight.ps1

Write-Host "📦 npm ci" -ForegroundColor Cyan
npm ci --prefer-offline --no-audit

if (-not $SkipTests) {
  if (Get-Content package.json -Raw | Select-String -Quiet '"type-check"') {
    Write-Host "🧠 Type-check" -ForegroundColor Cyan
    npm run type-check
  }

  # Quick smoke test first
  Write-Host "🔥 Quick smoke test" -ForegroundColor Cyan
  npm test -- client/src/core/reserves --run

  if (Get-Content package.json -Raw | Select-String -Quiet '"test:coverage"') {
    Write-Host "🧪 Tests (coverage)" -ForegroundColor Cyan
    npm run test:coverage
  } else {
    Write-Host "🧪 Tests" -ForegroundColor Cyan
    npm run test:all
  }
}

Write-Host "🏗️ Build" -ForegroundColor Cyan
npm run build

if ($OpenReport -and (Test-Path "coverage/index.html")) {
  Start-Process "coverage/index.html"
}

Write-Host "✅ Local validation OK in $($stopwatch.Elapsed.TotalSeconds)s" -ForegroundColor Green
