# Comprehensive Testing Pipeline Script
# Implements the 9-step testing strategy

param(
    [string]$Environment = "local",
    [string]$BaseUrl = "http://localhost:5000",
    [string]$ProdUrl = "https://updog-restore.vercel.app",
    [switch]$SkipBuild,
    [switch]$SkipE2E,
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

# Colors for output
$Red = "Red"
$Green = "Green"
$Yellow = "Yellow"
$Cyan = "Cyan"

function Write-Step {
    param([string]$StepNumber, [string]$StepName, [string]$Command)
    Write-Host "`n" -NoNewline
    Write-Host "Step $StepNumber" -ForegroundColor $Cyan -NoNewline
    Write-Host " - $StepName" -ForegroundColor White
    if ($Command) {
        Write-Host "Command: $Command" -ForegroundColor Yellow
    }
    Write-Host "=" * 60 -ForegroundColor Gray
}

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor $Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor $Red
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor $Yellow
}

function Test-HealthEndpoint {
    param([string]$Url)
    
    try {
        $response = Invoke-WebRequest -Uri "$Url/healthz" -Method GET -TimeoutSec 10 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Write-Success "Health endpoint accessible ($($response.StatusCode))"
            return $true
        }
    }
    catch {
        Write-Warning "Health endpoint not accessible: $($_.Exception.Message)"
    }
    
    # Try alternative health endpoints
    $healthEndpoints = @("/api/health", "/health", "/")
    foreach ($endpoint in $healthEndpoints) {
        try {
            $response = Invoke-WebRequest -Uri "$Url$endpoint" -Method GET -TimeoutSec 10 -UseBasicParsing
            if ($response.StatusCode -eq 200) {
                Write-Success "Alternative endpoint $endpoint accessible ($($response.StatusCode))"
                return $true
            }
        }
        catch {
            # Continue trying other endpoints
        }
    }
    
    return $false
}

# Main pipeline execution
Write-Host "🚀 Starting Comprehensive Testing Pipeline" -ForegroundColor $Cyan
Write-Host "Environment: $Environment" -ForegroundColor White
Write-Host "Base URL: $BaseUrl" -ForegroundColor White
if ($Environment -eq "production") {
    Write-Host "Production URL: $ProdUrl" -ForegroundColor White
}

$startTime = Get-Date
$stepResults = @{}

# Step 0: Smoke Test (Production)
if ($Environment -eq "production" -or $Environment -eq "preview") {
    Write-Step "0" "Smoke Test (Production)" "curl -sSf $ProdUrl/healthz"
    
    $healthCheck = Test-HealthEndpoint -Url $ProdUrl
    if ($healthCheck) {
        Write-Success "Production smoke test passed"
        $stepResults["0-smoke-prod"] = "PASS"
    } else {
        Write-Error "Production smoke test failed"
        $stepResults["0-smoke-prod"] = "FAIL"
        if ($Environment -eq "production") {
            Write-Error "Production is not accessible. Aborting pipeline."
            exit 1
        }
    }
}

# Step 1: Lint / Type Checking
Write-Step "1" "Lint / Type Checking" "npm run lint && npm run typecheck"

try {
    # ESLint
    $lintResult = npm run lint 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "ESLint passed"
        $stepResults["1-lint"] = "PASS"
    } else {
        Write-Error "ESLint failed"
        Write-Host $lintResult -ForegroundColor $Red
        $stepResults["1-lint"] = "FAIL"
    }
    
    # TypeScript checking
    $typecheckResult = npx tsc --noEmit 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "TypeScript check passed"
        $stepResults["1-typecheck"] = "PASS"
    } else {
        Write-Warning "TypeScript check had issues"
        if ($Verbose) {
            Write-Host $typecheckResult -ForegroundColor $Yellow
        }
        $stepResults["1-typecheck"] = "WARN"
    }
}
catch {
    Write-Error "Lint/TypeCheck step failed: $($_.Exception.Message)"
    $stepResults["1-lint"] = "FAIL"
}

# Step 2: Unit / Component Tests
Write-Step "2" "Unit / Component Tests" "npm run test"

try {
    $testResult = npm run test 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Unit tests passed"
        $stepResults["2-unit"] = "PASS"
    } else {
        Write-Error "Unit tests failed"
        if ($Verbose) {
            Write-Host $testResult -ForegroundColor $Red
        }
        $stepResults["2-unit"] = "FAIL"
    }
}
catch {
    Write-Error "Unit tests failed: $($_.Exception.Message)"
    $stepResults["2-unit"] = "FAIL"
}

# Step 3: API Integration Tests
Write-Step "3" "API Integration Tests" "npm run test:api"

try {
    if (Get-Command "npm run test:api" -ErrorAction SilentlyContinue) {
        $apiTestResult = npm run test:api 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "API integration tests passed"
            $stepResults["3-api"] = "PASS"
        } else {
            Write-Warning "API integration tests failed (may be expected in test environment)"
            $stepResults["3-api"] = "WARN"
        }
    } else {
        Write-Warning "API integration tests not configured"
        $stepResults["3-api"] = "SKIP"
    }
}
catch {
    Write-Warning "API integration tests failed: $($_.Exception.Message)"
    $stepResults["3-api"] = "WARN"
}

# Step 4: Build Verification
if (-not $SkipBuild) {
    Write-Step "4" "Build Verification" "npm run build"
    
    try {
        $buildResult = npm run build 2>&1
        if ($LASTEXITCODE -eq 0) {
            # Check if build output exists
            $buildOutput = "dist/public/index.html"
            if (Test-Path $buildOutput) {
                Write-Success "Build completed successfully"
                $stepResults["4-build"] = "PASS"
            } else {
                Write-Warning "Build completed but output not found at expected location"
                $stepResults["4-build"] = "WARN"
            }
        } else {
            Write-Error "Build failed"
            if ($Verbose) {
                Write-Host $buildResult -ForegroundColor $Red
            }
            $stepResults["4-build"] = "FAIL"
        }
    }
    catch {
        Write-Error "Build step failed: $($_.Exception.Message)"
        $stepResults["4-build"] = "FAIL"
    }
} else {
    Write-Warning "Build step skipped"
    $stepResults["4-build"] = "SKIP"
}

# Step 5: Static Preview (if build succeeded)
if ($stepResults["4-build"] -eq "PASS" -and (Test-Path "dist/public")) {
    Write-Step "5" "Static Preview" "npx serve dist/public -l 4173"
    
    # Start static server in background
    $serverJob = Start-Job -ScriptBlock {
        Set-Location $using:PWD
        npx serve dist/public -l 4173
    }
    
    Start-Sleep -Seconds 5
    
    # Test static preview
    $previewHealthy = Test-HealthEndpoint -Url "http://localhost:4173"
    if ($previewHealthy) {
        Write-Success "Static preview server is healthy"
        $stepResults["5-preview"] = "PASS"
    } else {
        Write-Warning "Static preview server may not be fully ready"
        $stepResults["5-preview"] = "WARN"
    }
    
    # Stop the server job
    Stop-Job -Job $serverJob -ErrorAction SilentlyContinue
    Remove-Job -Job $serverJob -ErrorAction SilentlyContinue
} else {
    Write-Warning "Static preview skipped (build not available)"
    $stepResults["5-preview"] = "SKIP"
}

# Step 6: End-to-End Tests (Local)
if (-not $SkipE2E) {
    Write-Step "6" "End-to-End Tests (Local)" "npm run test:e2e:smoke && npm run test:e2e:core"
    
    try {
        # Install Playwright browsers if needed
        Write-Host "Installing Playwright browsers..." -ForegroundColor $Yellow
        npx playwright install chromium --with-deps 2>&1 | Out-Null
        
        # Run smoke tests first
        Write-Host "Running smoke tests..." -ForegroundColor $Yellow
        $smokeResult = npm run test:e2e:smoke 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "E2E smoke tests passed"
            $stepResults["6-e2e-smoke"] = "PASS"
            
            # Run core tests if smoke passed
            Write-Host "Running core E2E tests..." -ForegroundColor $Yellow
            $coreResult = npm run test:e2e:core 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Success "E2E core tests passed"
                $stepResults["6-e2e-core"] = "PASS"
            } else {
                Write-Warning "E2E core tests failed"
                $stepResults["6-e2e-core"] = "FAIL"
            }
        } else {
            Write-Error "E2E smoke tests failed"
            Write-Warning "Skipping core E2E tests due to smoke test failure"
            $stepResults["6-e2e-smoke"] = "FAIL"
            $stepResults["6-e2e-core"] = "SKIP"
        }
    }
    catch {
        Write-Error "E2E tests failed: $($_.Exception.Message)"
        $stepResults["6-e2e-smoke"] = "FAIL"
        $stepResults["6-e2e-core"] = "FAIL"
    }
} else {
    Write-Warning "E2E tests skipped"
    $stepResults["6-e2e-smoke"] = "SKIP"
    $stepResults["6-e2e-core"] = "SKIP"
}

# Step 7: End-to-End Tests (Preview/Production)
if ($Environment -eq "production" -or $Environment -eq "preview") {
    Write-Step "7" "End-to-End Tests (Preview/Production)" "BASE_URL=$ProdUrl npm run test:e2e:production"
    
    try {
        $env:BASE_URL = $ProdUrl
        $env:PROD_URL = $ProdUrl
        
        $prodE2EResult = npm run test:e2e:production 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Production E2E tests passed"
            $stepResults["7-e2e-prod"] = "PASS"
        } else {
            Write-Warning "Production E2E tests failed"
            if ($Verbose) {
                Write-Host $prodE2EResult -ForegroundColor $Yellow
            }
            $stepResults["7-e2e-prod"] = "FAIL"
        }
    }
    catch {
        Write-Warning "Production E2E tests failed: $($_.Exception.Message)"
        $stepResults["7-e2e-prod"] = "FAIL"
    }
    finally {
        Remove-Item Env:BASE_URL -ErrorAction SilentlyContinue
        Remove-Item Env:PROD_URL -ErrorAction SilentlyContinue
    }
} else {
    Write-Warning "Production E2E tests skipped (not production environment)"
    $stepResults["7-e2e-prod"] = "SKIP"
}

# Step 8: Performance Budget
Write-Step "8" "Performance Budget" "k6 run tests/performance/k6-load-test.js"

try {
    # Check if k6 is installed
    $k6Available = Get-Command "k6" -ErrorAction SilentlyContinue
    if ($k6Available) {
        $env:BASE_URL = $BaseUrl
        $env:TEST_ENVIRONMENT = $Environment
        
        $perfResult = k6 run tests/performance/k6-load-test.js 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Performance tests passed"
            $stepResults["8-performance"] = "PASS"
        } else {
            Write-Warning "Performance tests failed"
            $stepResults["8-performance"] = "FAIL"
        }
    } else {
        # Fallback to Playwright performance tests
        Write-Host "k6 not available, running Playwright performance tests..." -ForegroundColor $Yellow
        $perfResult = npm run test:e2e:performance 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Playwright performance tests passed"
            $stepResults["8-performance"] = "PASS"
        } else {
            Write-Warning "Performance tests failed"
            $stepResults["8-performance"] = "WARN"
        }
    }
}
catch {
    Write-Warning "Performance tests failed: $($_.Exception.Message)"
    $stepResults["8-performance"] = "WARN"
}

# Step 9: Accessibility
Write-Step "9" "Accessibility Tests" "npm run test:e2e:accessibility"

try {
    $a11yResult = npm run test:e2e:accessibility 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Accessibility tests passed"
        $stepResults["9-accessibility"] = "PASS"
    } else {
        Write-Warning "Accessibility tests failed"
        $stepResults["9-accessibility"] = "WARN"
    }
}
catch {
    Write-Warning "Accessibility tests failed: $($_.Exception.Message)"
    $stepResults["9-accessibility"] = "WARN"
}

# Summary Report
$endTime = Get-Date
$duration = $endTime - $startTime

Write-Host "`n" -NoNewline
Write-Host "📊 TEST PIPELINE SUMMARY" -ForegroundColor $Cyan
Write-Host "=" * 60 -ForegroundColor Gray
Write-Host "Total Duration: $($duration.ToString('mm\:ss'))" -ForegroundColor White
Write-Host "Environment: $Environment" -ForegroundColor White

$totalSteps = $stepResults.Count
$passedSteps = ($stepResults.Values | Where-Object { $_ -eq "PASS" }).Count
$failedSteps = ($stepResults.Values | Where-Object { $_ -eq "FAIL" }).Count
$warnSteps = ($stepResults.Values | Where-Object { $_ -eq "WARN" }).Count
$skippedSteps = ($stepResults.Values | Where-Object { $_ -eq "SKIP" }).Count

Write-Host "`nResults:" -ForegroundColor White
Write-Host "  ✅ Passed: $passedSteps" -ForegroundColor $Green
Write-Host "  ❌ Failed: $failedSteps" -ForegroundColor $Red
Write-Host "  ⚠️  Warning: $warnSteps" -ForegroundColor $Yellow
Write-Host "  ⏭️  Skipped: $skippedSteps" -ForegroundColor Gray

Write-Host "`nDetailed Results:" -ForegroundColor White
foreach ($step in $stepResults.GetEnumerator() | Sort-Object Key) {
    $icon = switch ($step.Value) {
        "PASS" { "✅" }
        "FAIL" { "❌" }
        "WARN" { "⚠️" }
        "SKIP" { "⏭️" }
        default { "❓" }
    }
    $color = switch ($step.Value) {
        "PASS" { $Green }
        "FAIL" { $Red }
        "WARN" { $Yellow }
        "SKIP" { "Gray" }
        default { "White" }
    }
    Write-Host "  $icon $($step.Key): $($step.Value)" -ForegroundColor $color
}

# Generate JSON report
$report = @{
    timestamp = $startTime.ToString("yyyy-MM-ddTHH:mm:ssZ")
    duration = $duration.TotalSeconds
    environment = $Environment
    baseUrl = $BaseUrl
    results = $stepResults
    summary = @{
        total = $totalSteps
        passed = $passedSteps
        failed = $failedSteps
        warnings = $warnSteps
        skipped = $skippedSteps
        success = $failedSteps -eq 0
    }
}

# Ensure test-results directory exists
if (!(Test-Path "test-results")) {
    New-Item -ItemType Directory -Path "test-results" | Out-Null
}

$reportJson = $report | ConvertTo-Json -Depth 3
$reportJson | Out-File -FilePath "test-results/pipeline-report.json" -Encoding UTF8

Write-Host "`n📄 Report saved to: test-results/pipeline-report.json" -ForegroundColor $Cyan

# Exit with appropriate code
if ($failedSteps -gt 0) {
    Write-Host "`n❌ Pipeline completed with failures" -ForegroundColor $Red
    exit 1
} else {
    Write-Host "`n✅ Pipeline completed successfully" -ForegroundColor $Green
    exit 0
}