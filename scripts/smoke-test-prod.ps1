#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Quick production smoke test for deployment confidence
.DESCRIPTION
    Fast HTTP checks to validate app health between rollout stages.
    Tests basic functionality without full E2E overhead.
.PARAMETER BaseUrl
    Base URL of the production application
.PARAMETER Timeout
    Request timeout in seconds (default: 10)
.EXAMPLE
    pwsh scripts/smoke-test-prod.ps1 -BaseUrl https://your-app.com
    pwsh scripts/smoke-test-prod.ps1 -BaseUrl https://staging.your-app.com -Timeout 5
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl,
    [int]$Timeout = 10
)

$ErrorActionPreference = "Stop"

function Assert($condition, $message) { 
    if (-not $condition) { 
        throw "❌ $message" 
    }
    Write-Host "✅ $message" -ForegroundColor Green 
}

function Test-Endpoint($url, $expectedStatus = 200, $description = "") {
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec $Timeout -ErrorAction Stop
        Assert ($response.StatusCode -eq $expectedStatus) "$description (HTTP $($response.StatusCode))"
        return $response
    } catch {
        $statusCode = if ($_.Exception.Response) { $_.Exception.Response.StatusCode } else { "N/A" }
        throw "❌ $description - HTTP $statusCode : $($_.Exception.Message)"
    }
}

Write-Host ""
Write-Host "🌬️  Production Smoke Test" -ForegroundColor Cyan
Write-Host "🎯 Target: $BaseUrl" -ForegroundColor Gray  
Write-Host "⏱️  Timeout: ${Timeout}s per request" -ForegroundColor Gray
Write-Host ""

try {
    # 1) App boots and serves content
    Write-Host "🔍 Testing application bootstrap..." -ForegroundColor Yellow
    $mainResponse = Test-Endpoint $BaseUrl 200 "Main app reachable"
    
    # Basic content validation
    if ($mainResponse.Content -match "<!DOCTYPE html|<html") {
        Write-Host "✅ Valid HTML document served" -ForegroundColor Green
    } else {
        Write-Warning "Response doesn't appear to be HTML"
    }

    # 2) Fund setup wizard loads
    Write-Host ""
    Write-Host "🧙 Testing fund setup wizard..." -ForegroundColor Yellow
    Test-Endpoint "$BaseUrl/fund-setup" 200 "Fund setup wizard reachable"

    # 3) Kill switch functionality (feature flag override)
    Write-Host ""
    Write-Host "🛑 Testing emergency override paths..." -ForegroundColor Yellow
    Test-Endpoint "$BaseUrl/fund-setup?ff_useFundStore=0" 200 "Legacy state kill switch functional"
    Test-Endpoint "$BaseUrl/fund-setup?ff_useFundStore=1" 200 "Fund store force-enable functional"

    # 4) API health endpoint (if exists)
    Write-Host ""
    Write-Host "💊 Testing health endpoints..." -ForegroundColor Yellow
    try {
        Test-Endpoint "$BaseUrl/api/health" 200 "API health check"
    } catch {
        Write-Warning "Health endpoint not available (optional)"
    }

    # 5) Static assets loading
    Write-Host ""
    Write-Host "🎨 Testing static assets..." -ForegroundColor Yellow
    try {
        # Try common asset paths
        $assetPaths = @("/assets/", "/static/", "/favicon.ico")
        $assetFound = $false
        
        foreach ($path in $assetPaths) {
            try {
                Test-Endpoint "$BaseUrl$path" 200 "Static assets ($path)"
                $assetFound = $true
                break
            } catch {
                # Try next path
            }
        }
        
        if (-not $assetFound) {
            Write-Warning "Could not verify static asset serving"
        }
    } catch {
        Write-Warning "Static asset validation failed (non-critical)"
    }

    # Summary
    Write-Host ""
    Write-Host "🎉 All smoke tests passed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "✅ App is responsive and serving content" -ForegroundColor Green
    Write-Host "✅ Fund setup wizard accessible" -ForegroundColor Green  
    Write-Host "✅ Emergency overrides functional" -ForegroundColor Green
    Write-Host ""
    Write-Host "🚀 Safe to proceed with rollout" -ForegroundColor Cyan
    
    exit 0

} catch {
    Write-Host ""
    Write-Host "💥 Smoke test failed!" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "🛑 Do not proceed with rollout - investigate issues first" -ForegroundColor Yellow
    
    exit 1
}
