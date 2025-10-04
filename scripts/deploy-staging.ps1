# Deploy to Staging - Automated Script
# Purpose: Deploy code changes to staging and verify Redis connections

param(
    [switch]$SkipBuild = $false,
    [switch]$Verbose = $false
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

Write-Host "🚀 Staging Deployment Script" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Pre-deployment checks
Write-Host "📋 Step 1: Pre-deployment Checks" -ForegroundColor Yellow
Write-Host ""

# Check if we're on the right branch
$currentBranch = git rev-parse --abbrev-ref HEAD
Write-Host "  Current branch: $currentBranch" -ForegroundColor White

if ($currentBranch -ne "main" -and $currentBranch -ne "feat/iteration-a-deterministic-engine") {
    Write-Host "  ⚠️  Warning: Not on main or feature branch" -ForegroundColor Yellow
    $continue = Read-Host "  Continue anyway? (y/n)"
    if ($continue -ne "y") {
        exit 1
    }
}

# Check for uncommitted changes
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Host "  ⚠️  Uncommitted changes detected:" -ForegroundColor Yellow
    Write-Host $gitStatus -ForegroundColor Gray
    $continue = Read-Host "  Continue anyway? (y/n)"
    if ($continue -ne "y") {
        exit 1
    }
}

Write-Host "  ✅ Pre-deployment checks passed" -ForegroundColor Green
Write-Host ""

# Step 2: Run tests
if (-not $SkipBuild) {
    Write-Host "🧪 Step 2: Running Tests" -ForegroundColor Yellow
    Write-Host ""

    Write-Host "  Running unit tests..." -ForegroundColor White
    npm run test:unit -- tests/unit/units.test.ts tests/unit/unit-schemas.test.ts tests/unit/fees.test.ts tests/unit/redis-factory.test.ts

    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ❌ Tests failed!" -ForegroundColor Red
        exit 1
    }

    Write-Host "  ✅ All tests passed" -ForegroundColor Green
    Write-Host ""
}

# Step 3: Build
if (-not $SkipBuild) {
    Write-Host "🔨 Step 3: Building Application" -ForegroundColor Yellow
    Write-Host ""

    Write-Host "  Building client..." -ForegroundColor White
    npm run build

    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ❌ Build failed!" -ForegroundColor Red
        exit 1
    }

    Write-Host "  ✅ Build completed" -ForegroundColor Green
    Write-Host ""
}

# Step 4: Deploy to Vercel staging
Write-Host "📦 Step 4: Deploying to Vercel Staging" -ForegroundColor Yellow
Write-Host ""

Write-Host "  Checking Vercel CLI..." -ForegroundColor White
$vercelInstalled = Get-Command vercel -ErrorAction SilentlyContinue
if (-not $vercelInstalled) {
    Write-Host "  ⚠️  Vercel CLI not found. Installing..." -ForegroundColor Yellow
    npm install -g vercel
}

Write-Host "  Deploying to staging environment..." -ForegroundColor White
vercel --env=staging --yes

if ($LASTEXITCODE -ne 0) {
    Write-Host "  ❌ Deployment failed!" -ForegroundColor Red
    exit 1
}

# Capture deployment URL
$deploymentUrl = vercel ls --meta environment=staging | Select-String -Pattern "https://.*\.vercel\.app" | Select-Object -First 1
Write-Host "  ✅ Deployed to: $deploymentUrl" -ForegroundColor Green
Write-Host ""

# Step 5: Verify Redis connections
Write-Host "🔍 Step 5: Verifying Redis Connections" -ForegroundColor Yellow
Write-Host ""

Write-Host "  Testing health endpoint..." -ForegroundColor White
try {
    $healthResponse = Invoke-RestMethod -Uri "$deploymentUrl/api/health" -Method Get -TimeoutSec 10
    Write-Host "  Health check: $($healthResponse.status)" -ForegroundColor White

    if ($healthResponse.redis) {
        Write-Host "  Redis status: $($healthResponse.redis.status)" -ForegroundColor White
        if ($healthResponse.redis.status -eq "connected") {
            Write-Host "  ✅ Redis connection verified" -ForegroundColor Green
        } else {
            Write-Host "  ⚠️  Redis connection issue: $($healthResponse.redis.status)" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "  ⚠️  Health check failed: $($_.Exception.Message)" -ForegroundColor Yellow
}
Write-Host ""

# Step 6: Check logs for password masking
Write-Host "🔐 Step 6: Checking Logs for Security" -ForegroundColor Yellow
Write-Host ""

Write-Host "  Fetching recent logs from Vercel..." -ForegroundColor White
$logs = vercel logs --since 5m

if ($logs -match "password|secret|key") {
    Write-Host "  ⚠️  WARNING: Potential secrets in logs!" -ForegroundColor Red
    Write-Host "  Searching for masked passwords..." -ForegroundColor White

    if ($logs -match "Redis connected to") {
        Write-Host "  ✅ Redis logs found - checking masking..." -ForegroundColor White
        if ($logs -match "\*\*\*" -or $logs -notmatch ":\w+@") {
            Write-Host "  ✅ Passwords appear to be masked" -ForegroundColor Green
        } else {
            Write-Host "  ❌ WARNING: Passwords may be exposed in logs!" -ForegroundColor Red
        }
    }
}
Write-Host ""

# Step 7: Summary
Write-Host "📊 Deployment Summary" -ForegroundColor Cyan
Write-Host "===================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Deployment URL: $deploymentUrl" -ForegroundColor White
Write-Host "  Environment: staging" -ForegroundColor White
Write-Host "  Branch: $currentBranch" -ForegroundColor White
Write-Host "  Status: ✅ DEPLOYED" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Run smoke tests: .\scripts\smoke-test.ps1 -BaseUrl $deploymentUrl" -ForegroundColor White
Write-Host "  2. Monitor logs: vercel logs --follow" -ForegroundColor White
Write-Host "  3. Deploy to production: .\scripts\deploy-production.ps1" -ForegroundColor White
Write-Host ""
