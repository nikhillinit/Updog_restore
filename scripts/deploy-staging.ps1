# Deploy to Staging - Automated Script
# Purpose: Deploy code changes to staging and verify Redis connections

param(
    [switch]$SkipBuild = $false,
    [switch]$Verbose = $false
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

Write-Host "=== Staging Deployment Script ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Pre-deployment checks
Write-Host "[Step 1] Pre-deployment Checks" -ForegroundColor Yellow
Write-Host ""

# Check if we're on the right branch
$currentBranch = git rev-parse --abbrev-ref HEAD
Write-Host "  Current branch: $currentBranch" -ForegroundColor White

if ($currentBranch -ne "main" -and $currentBranch -ne "feat/iteration-a-deterministic-engine") {
    Write-Host "  WARNING: Not on main or feature branch" -ForegroundColor Yellow
    $continue = Read-Host "  Continue anyway? (y/n)"
    if ($continue -ne "y") {
        exit 1
    }
}

# Check for uncommitted changes
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Host "  WARNING: Uncommitted changes detected" -ForegroundColor Yellow
    Write-Host "  Files: $($gitStatus.Count) modified/new" -ForegroundColor Gray
    $continue = Read-Host "  Continue anyway? (y/n)"
    if ($continue -ne "y") {
        exit 1
    }
}

Write-Host "  [OK] Pre-deployment checks passed" -ForegroundColor Green
Write-Host ""

# Step 2: Run tests
if (-not $SkipBuild) {
    Write-Host "[Step 2] Running Tests" -ForegroundColor Yellow
    Write-Host ""

    Write-Host "  Running unit tests..." -ForegroundColor White
    npm run test:unit -- tests/unit/units.test.ts tests/unit/unit-schemas.test.ts tests/unit/fees.test.ts tests/unit/redis-factory.test.ts

    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [FAIL] Tests failed!" -ForegroundColor Red
        exit 1
    }

    Write-Host "  [OK] All tests passed" -ForegroundColor Green
    Write-Host ""
}

# Step 3: Build
if (-not $SkipBuild) {
    Write-Host "[Step 3] Building Application" -ForegroundColor Yellow
    Write-Host ""

    Write-Host "  Building client..." -ForegroundColor White
    npm run build

    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [FAIL] Build failed!" -ForegroundColor Red
        exit 1
    }

    Write-Host "  [OK] Build completed" -ForegroundColor Green
    Write-Host ""
}

# Step 4: Deploy to Vercel staging
Write-Host "[Step 4] Deploying to Vercel Staging" -ForegroundColor Yellow
Write-Host ""

Write-Host "  Checking Vercel CLI..." -ForegroundColor White
$vercelInstalled = Get-Command vercel -ErrorAction SilentlyContinue
if (-not $vercelInstalled) {
    Write-Host "  WARNING: Vercel CLI not found. Installing..." -ForegroundColor Yellow
    npm install -g vercel
}

Write-Host "  Deploying to staging environment..." -ForegroundColor White
vercel --yes

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FAIL] Deployment failed!" -ForegroundColor Red
    exit 1
}

# Capture deployment URL
Write-Host "  Getting deployment URL..." -ForegroundColor White
$deploymentInfo = vercel ls | Select-String -Pattern "https://.*\.vercel\.app" | Select-Object -First 1
$deploymentUrl = $deploymentInfo.ToString().Trim()

Write-Host "  [OK] Deployed to: $deploymentUrl" -ForegroundColor Green
Write-Host ""

# Step 5: Verify Redis connections
Write-Host "[Step 5] Verifying Deployment Health" -ForegroundColor Yellow
Write-Host ""

Write-Host "  Waiting 5 seconds for deployment to be ready..." -ForegroundColor White
Start-Sleep -Seconds 5

Write-Host "  Testing health endpoint..." -ForegroundColor White
try {
    $healthResponse = Invoke-RestMethod -Uri "$deploymentUrl/api/health" -Method Get -TimeoutSec 10
    Write-Host "  Health status: $($healthResponse.status)" -ForegroundColor White

    if ($healthResponse.redis) {
        Write-Host "  Redis status: $($healthResponse.redis.status)" -ForegroundColor White
        if ($healthResponse.redis.status -eq "connected") {
            Write-Host "  [OK] Redis connection verified" -ForegroundColor Green
        } else {
            Write-Host "  WARNING: Redis connection issue: $($healthResponse.redis.status)" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "  WARNING: Health check failed: $($_.Exception.Message)" -ForegroundColor Yellow
}
Write-Host ""

# Step 6: Check logs for password masking
Write-Host "[Step 6] Security Check - Password Masking" -ForegroundColor Yellow
Write-Host ""

Write-Host "  Fetching recent logs from Vercel..." -ForegroundColor White
try {
    $logs = vercel logs --since 2m 2>&1 | Out-String

    Write-Host "  Checking for password exposure..." -ForegroundColor White

    if ($logs -match "redis://[^:]+:[^@]+@" -or $logs -match "rediss://[^:]+:[^@]+@") {
        Write-Host "  [FAIL] WARNING: Potential password in logs!" -ForegroundColor Red
        Write-Host "  This is a CRITICAL security issue - do NOT deploy to production!" -ForegroundColor Red
    } elseif ($logs -match "Redis connected to") {
        Write-Host "  [OK] Redis logs found - passwords appear masked" -ForegroundColor Green
    } else {
        Write-Host "  [INFO] No Redis connection logs found yet" -ForegroundColor Gray
    }
} catch {
    Write-Host "  WARNING: Could not fetch logs: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""

# Step 7: Summary
Write-Host "=== Deployment Summary ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Deployment URL: $deploymentUrl" -ForegroundColor White
Write-Host "  Environment: staging" -ForegroundColor White
Write-Host "  Branch: $currentBranch" -ForegroundColor White
Write-Host "  Status: DEPLOYED" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Run smoke tests:" -ForegroundColor White
Write-Host "     .\scripts\smoke-test.ps1 -BaseUrl '$deploymentUrl'" -ForegroundColor Gray
Write-Host "  2. Monitor logs:" -ForegroundColor White
Write-Host "     vercel logs --follow" -ForegroundColor Gray
Write-Host "  3. Deploy to production:" -ForegroundColor White
Write-Host "     .\scripts\deploy-production.ps1" -ForegroundColor Gray
Write-Host ""

# Save deployment URL for next step
$deploymentUrl | Out-File -FilePath ".\scripts\.last-deployment-url.txt" -Encoding UTF8
Write-Host "Deployment URL saved to: .\scripts\.last-deployment-url.txt" -ForegroundColor Gray
Write-Host ""
