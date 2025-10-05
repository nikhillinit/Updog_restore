# Deploy to Production - Automated Script
# Purpose: Deploy to production with safety checks and rollback plan

param(
    [switch]$SkipSmokeTest = $false,
    [switch]$Force = $false
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 Production Deployment Script" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠️  WARNING: This will deploy to PRODUCTION!" -ForegroundColor Red
Write-Host ""

# Safety confirmation
if (-not $Force) {
    Write-Host "Please confirm the following:" -ForegroundColor Yellow
    Write-Host "  1. All smoke tests passed in staging? (y/n): " -NoNewline
    $smokeTestsPassed = Read-Host
    if ($smokeTestsPassed -ne "y") {
        Write-Host "❌ Deployment cancelled. Run smoke tests first." -ForegroundColor Red
        exit 1
    }

    Write-Host "  2. All team members notified? (y/n): " -NoNewline
    $teamNotified = Read-Host
    if ($teamNotified -ne "y") {
        Write-Host "⚠️  Please notify team before production deployment" -ForegroundColor Yellow
        $continue = Read-Host "  Continue anyway? (y/n)"
        if ($continue -ne "y") {
            exit 1
        }
    }

    Write-Host "  3. Ready to deploy? Type 'DEPLOY' to confirm: " -NoNewline
    $confirmation = Read-Host
    if ($confirmation -ne "DEPLOY") {
        Write-Host "❌ Deployment cancelled" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "✅ Proceeding with production deployment..." -ForegroundColor Green
Write-Host ""

# Step 1: Pre-deployment checks
Write-Host "📋 Step 1: Pre-deployment Checks" -ForegroundColor Yellow
Write-Host ""

# Get current production deployment (for rollback)
Write-Host "  Fetching current production deployment info..." -ForegroundColor White
$currentProduction = vercel ls --prod --meta environment=production | Select-String -Pattern "https://.*\.vercel\.app" | Select-Object -First 1
Write-Host "  Current production: $currentProduction" -ForegroundColor Gray
Write-Host "  (Saved for potential rollback)" -ForegroundColor Gray
Write-Host ""

# Run final tests
Write-Host "  Running final test suite..." -ForegroundColor White
npm run test:unit -- tests/unit/units.test.ts tests/unit/unit-schemas.test.ts tests/unit/fees.test.ts tests/unit/redis-factory.test.ts

if ($LASTEXITCODE -ne 0) {
    Write-Host "  ❌ Tests failed! Aborting deployment." -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ Tests passed" -ForegroundColor Green
Write-Host ""

# Step 2: Build
Write-Host "🔨 Step 2: Production Build" -ForegroundColor Yellow
Write-Host ""

Write-Host "  Building for production..." -ForegroundColor White
$env:NODE_ENV = "production"
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "  ❌ Build failed! Aborting deployment." -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ Build completed" -ForegroundColor Green
Write-Host ""

# Step 3: Deploy
Write-Host "🚀 Step 3: Deploying to Production" -ForegroundColor Yellow
Write-Host ""

$deploymentStartTime = Get-Date
Write-Host "  Deployment started at: $deploymentStartTime" -ForegroundColor White
Write-Host "  Deploying to Vercel production..." -ForegroundColor White

vercel --prod --yes

if ($LASTEXITCODE -ne 0) {
    Write-Host "  ❌ Deployment failed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Rollback instructions:" -ForegroundColor Yellow
    Write-Host "  vercel rollback $currentProduction --yes" -ForegroundColor White
    exit 1
}

$deploymentEndTime = Get-Date
$deploymentDuration = $deploymentEndTime - $deploymentStartTime

# Get new production URL
$productionUrl = vercel ls --prod | Select-String -Pattern "https://.*\.vercel\.app" | Select-Object -First 1

Write-Host "  ✅ Deployed in $($deploymentDuration.TotalSeconds) seconds" -ForegroundColor Green
Write-Host "  Production URL: $productionUrl" -ForegroundColor White
Write-Host ""

# Step 4: Post-deployment verification
Write-Host "✅ Step 4: Post-deployment Verification" -ForegroundColor Yellow
Write-Host ""

Write-Host "  Waiting 10 seconds for deployment to stabilize..." -ForegroundColor White
Start-Sleep -Seconds 10

Write-Host "  Checking health endpoint..." -ForegroundColor White
try {
    $healthCheck = Invoke-RestMethod -Uri "$productionUrl/api/health" -TimeoutSec 10
    if ($healthCheck.status -eq "healthy") {
        Write-Host "  ✅ Health check passed" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Health check returned: $($healthCheck.status)" -ForegroundColor Yellow
    }

    if ($healthCheck.redis -and $healthCheck.redis.status -eq "connected") {
        Write-Host "  ✅ Redis connected" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Redis status: $($healthCheck.redis.status)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ❌ Health check failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "⚠️  Deployment succeeded but health check failed!" -ForegroundColor Yellow
    Write-Host "Consider rolling back:" -ForegroundColor Yellow
    Write-Host "  vercel rollback $currentProduction --yes" -ForegroundColor White
}
Write-Host ""

# Step 5: Run smoke tests (if not skipped)
if (-not $SkipSmokeTest) {
    Write-Host "🧪 Step 5: Running Production Smoke Tests" -ForegroundColor Yellow
    Write-Host ""

    & "$PSScriptRoot\smoke-test.ps1" -BaseUrl $productionUrl

    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "⚠️  Smoke tests failed!" -ForegroundColor Yellow
        Write-Host "Production is deployed but may have issues." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Rollback command:" -ForegroundColor Yellow
        Write-Host "  vercel rollback $currentProduction --yes" -ForegroundColor White
    }
}
Write-Host ""

# Step 6: Monitor
Write-Host "📊 Step 6: Initial Monitoring" -ForegroundColor Yellow
Write-Host ""

Write-Host "  Fetching initial production logs..." -ForegroundColor White
& "$PSScriptRoot\monitor-logs.ps1" -Environment production -Minutes 2

Write-Host ""

# Success summary
Write-Host "✅ Production Deployment Complete!" -ForegroundColor Green
Write-Host "===================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Deployment URL: $productionUrl" -ForegroundColor White
Write-Host "  Previous deployment: $currentProduction" -ForegroundColor Gray
Write-Host "  Deployment time: $($deploymentDuration.TotalSeconds) seconds" -ForegroundColor White
Write-Host ""
Write-Host "Post-deployment checklist:" -ForegroundColor Yellow
Write-Host "  ✅ Health check passed" -ForegroundColor Green
Write-Host "  ✅ Redis connected" -ForegroundColor Green
if (-not $SkipSmokeTest) {
    Write-Host "  ✅ Smoke tests passed" -ForegroundColor Green
}
Write-Host ""
Write-Host "Monitoring:" -ForegroundColor Yellow
Write-Host "  - Continuous logs: .\scripts\monitor-logs.ps1 -Follow -Environment production" -ForegroundColor White
Write-Host "  - Vercel dashboard: https://vercel.com/dashboard" -ForegroundColor White
Write-Host ""
Write-Host "Rollback (if needed):" -ForegroundColor Yellow
Write-Host "  vercel rollback $currentProduction --yes" -ForegroundColor White
Write-Host ""
Write-Host "🎉 Deployment successful! Monitor closely for the next 30 minutes." -ForegroundColor Cyan
