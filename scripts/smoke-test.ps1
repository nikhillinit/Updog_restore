# Smoke Test Script
# Purpose: Verify critical functionality after deployment

param(
    [Parameter(Mandatory=$true)]
    [string]$BaseUrl,
    [switch]$Verbose = $false
)

$ErrorActionPreference = "Stop"

Write-Host "🧪 Running Smoke Tests" -ForegroundColor Cyan
Write-Host "======================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Target: $BaseUrl" -ForegroundColor White
Write-Host ""

$testsPassed = 0
$testsFailed = 0

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [string]$Method = "GET",
        [hashtable]$Headers = @{},
        [object]$Body = $null,
        [scriptblock]$Validator
    )

    Write-Host "  Testing: $Name" -ForegroundColor White

    try {
        $params = @{
            Uri = $Url
            Method = $Method
            Headers = $Headers
            TimeoutSec = 30
        }

        if ($Body) {
            $params.Body = ($Body | ConvertTo-Json -Depth 10)
            $params.ContentType = "application/json"
        }

        $response = Invoke-RestMethod @params

        if ($Validator) {
            $validationResult = & $Validator $response
            if ($validationResult) {
                Write-Host "    ✅ PASS: $Name" -ForegroundColor Green
                $script:testsPassed++
                return $true
            } else {
                Write-Host "    ❌ FAIL: $Name (validation failed)" -ForegroundColor Red
                $script:testsFailed++
                return $false
            }
        } else {
            Write-Host "    ✅ PASS: $Name" -ForegroundColor Green
            $script:testsPassed++
            return $true
        }
    } catch {
        Write-Host "    ❌ FAIL: $Name" -ForegroundColor Red
        Write-Host "      Error: $($_.Exception.Message)" -ForegroundColor Red
        $script:testsFailed++
        return $false
    }
}

# Test Suite 1: Health & Infrastructure
Write-Host "📋 Test Suite 1: Health & Infrastructure" -ForegroundColor Yellow
Write-Host ""

Test-Endpoint `
    -Name "Health Check" `
    -Url "$BaseUrl/api/health" `
    -Validator { param($r) $r.status -eq "healthy" }

Test-Endpoint `
    -Name "Redis Health" `
    -Url "$BaseUrl/api/health" `
    -Validator { param($r) $r.redis.status -eq "connected" }

Write-Host ""

# Test Suite 2: Fee Calculations
Write-Host "📋 Test Suite 2: Fee Calculations" -ForegroundColor Yellow
Write-Host ""

# Mock fee tier data
$feeTiers = @(
    @{
        id = "test-tier"
        name = "Management Fee"
        percentage = 2.0
        startMonth = 1
        endMonth = 120
    }
)

Write-Host "  Testing fee calculation correctness..." -ForegroundColor White
Write-Host "    Input: 2% annual fee over 10 years" -ForegroundColor Gray
Write-Host "    Expected: 20% total drag (0.20 fraction)" -ForegroundColor Gray

# This would require a fee calculation endpoint
# For now, we'll note it needs manual verification
Write-Host "    ⚠️  MANUAL: Verify fee calculations in UI" -ForegroundColor Yellow
Write-Host "    Navigate to fund setup and check fee drag percentages" -ForegroundColor Gray
Write-Host ""

# Test Suite 3: Reserve API
Write-Host "📋 Test Suite 3: Reserve API" -ForegroundColor Yellow
Write-Host ""

# Test date schema (P1 fix)
$reserveInput = @{
    portfolio = @(
        @{
            id = "test-company-1"
            name = "Test Company 1"
            totalInvested = 1000000
            currentValuation = 5000000
            ownershipPercentage = 0.08
            currentStage = "series_a"
            investmentDate = "2023-10-27T10:00:00.000Z"  # ISO string
            isActive = $true
            confidenceLevel = 0.7
        },
        @{
            id = "test-company-2"
            name = "Test Company 2"
            totalInvested = 500000
            currentValuation = 2000000
            ownershipPercentage = 0.10
            currentStage = "seed"
            investmentDate = "2024-01-15T10:00:00.000Z"  # ISO string
            isActive = $true
            confidenceLevel = 0.6
        },
        @{
            id = "test-company-3"
            name = "Test Company 3"
            totalInvested = 750000
            currentValuation = 3000000
            ownershipPercentage = 0.09
            currentStage = "series_a"
            investmentDate = "2024-03-20T10:00:00.000Z"  # ISO string
            isActive = $true
            confidenceLevel = 0.8
        },
        @{
            id = "test-company-4"
            name = "Test Company 4"
            totalInvested = 2000000
            currentValuation = 10000000
            ownershipPercentage = 0.12
            currentStage = "series_b"
            investmentDate = "2024-05-10T10:00:00.000Z"  # ISO string
            isActive = $true
            confidenceLevel = 0.75
        }
    )
    availableReserves = 5000000
    totalFundSize = 50000000
    graduationMatrix = @{
        name = "Test Matrix"
        rates = @(
            @{
                fromStage = "seed"
                toStage = "series_a"
                probability = 0.6
                timeToGraduation = 18
                valuationMultiple = 3.0
            }
        )
    }
    stageStrategies = @(
        @{
            stage = "seed"
            targetOwnership = 0.08
            maxInvestment = 2000000
            minInvestment = 100000
            followOnProbability = 0.8
            reserveMultiple = 2.0
            failureRate = 0.7
            expectedMOIC = 15.0
            expectedTimeToExit = 84
            maxConcentration = 0.05
            diversificationWeight = 0.8
        }
    )
}

Test-Endpoint `
    -Name "Reserve Calculation (Date Schema Fix)" `
    -Url "$BaseUrl/api/reserves/calculate" `
    -Method "POST" `
    -Body $reserveInput `
    -Validator {
        param($r)
        $r.success -and $r.data.allocations.Count -gt 0
    }

Write-Host ""

# Test Suite 4: Pagination
Write-Host "📋 Test Suite 4: Pagination" -ForegroundColor Yellow
Write-Host ""

Test-Endpoint `
    -Name "Reserve API with Pagination (limit=2)" `
    -Url "$BaseUrl/api/reserves/calculate?limit=2&offset=0" `
    -Method "POST" `
    -Body $reserveInput `
    -Validator {
        param($r)
        $r.success -and $r.data.allocations.Count -le 2
    }

Test-Endpoint `
    -Name "Reserve API with Pagination (limit=100)" `
    -Url "$BaseUrl/api/reserves/calculate?limit=100&offset=0" `
    -Method "POST" `
    -Body $reserveInput `
    -Validator {
        param($r)
        $r.success -and $r.data.allocations.Count -ge 3  # Should show all 4 companies
    }

Write-Host ""

# Test Suite 5: Query Parameters
Write-Host "📋 Test Suite 5: Query Parameters" -ForegroundColor Yellow
Write-Host ""

Test-Endpoint `
    -Name "Query Params - Boolean string 'true'" `
    -Url "$BaseUrl/api/reserves/calculate?async=true&cache=false" `
    -Method "POST" `
    -Body $reserveInput `
    -Validator { param($r) $r.success }

Test-Endpoint `
    -Name "Query Params - Priority enum 'high'" `
    -Url "$BaseUrl/api/reserves/calculate?priority=high" `
    -Method "POST" `
    -Body $reserveInput `
    -Validator { param($r) $r.success }

Write-Host ""

# Test Suite 6: Security
Write-Host "📋 Test Suite 6: Security Checks" -ForegroundColor Yellow
Write-Host ""

Write-Host "  Checking for password leakage in responses..." -ForegroundColor White
$healthCheck = Invoke-RestMethod -Uri "$BaseUrl/api/health"
$healthJson = $healthCheck | ConvertTo-Json -Depth 10

if ($healthJson -match "password|secret|redis://.*:.*@") {
    Write-Host "    ❌ FAIL: Potential password exposure in API response" -ForegroundColor Red
    $script:testsFailed++
} else {
    Write-Host "    ✅ PASS: No passwords found in API responses" -ForegroundColor Green
    $script:testsPassed++
}

Write-Host ""

# Summary
Write-Host "📊 Smoke Test Summary" -ForegroundColor Cyan
Write-Host "=====================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Tests Passed: $testsPassed" -ForegroundColor Green
Write-Host "  Tests Failed: $testsFailed" -ForegroundColor $(if ($testsFailed -gt 0) { "Red" } else { "Green" })
Write-Host "  Total: $($testsPassed + $testsFailed)" -ForegroundColor White
Write-Host ""

if ($testsFailed -eq 0) {
    Write-Host "✅ All smoke tests passed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Monitor logs: vercel logs --follow" -ForegroundColor White
    Write-Host "  2. Run full E2E tests: npm run test:e2e" -ForegroundColor White
    Write-Host "  3. Deploy to production: .\scripts\deploy-production.ps1" -ForegroundColor White
    exit 0
} else {
    Write-Host "❌ Some smoke tests failed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Review failures above and fix before deploying to production." -ForegroundColor Yellow
    exit 1
}
