# Monitor Logs Script
# Purpose: Monitor deployment logs and check for security issues

param(
    [string]$Environment = "staging",
    [int]$Minutes = 5,
    [switch]$Follow = $false,
    [switch]$CheckSecurity = $true
)

Write-Host "📊 Log Monitoring Tool" -ForegroundColor Cyan
Write-Host "======================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Environment: $Environment" -ForegroundColor White
Write-Host "Time window: Last $Minutes minutes" -ForegroundColor White
Write-Host ""

# Check if Vercel CLI is installed
$vercelInstalled = Get-Command vercel -ErrorAction SilentlyContinue
if (-not $vercelInstalled) {
    Write-Host "❌ Vercel CLI not found. Please install it first:" -ForegroundColor Red
    Write-Host "   npm install -g vercel" -ForegroundColor White
    exit 1
}

# Fetch logs
Write-Host "📥 Fetching logs from Vercel..." -ForegroundColor Yellow
Write-Host ""

if ($Follow) {
    Write-Host "Following logs (Ctrl+C to stop)..." -ForegroundColor White
    Write-Host ""
    vercel logs --follow --env=$Environment
} else {
    $logs = vercel logs --since="${Minutes}m" --env=$Environment 2>&1

    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to fetch logs" -ForegroundColor Red
        exit 1
    }

    # Display logs
    Write-Host "Recent Logs:" -ForegroundColor White
    Write-Host "------------" -ForegroundColor Gray
    Write-Host $logs
    Write-Host ""

    # Security checks
    if ($CheckSecurity) {
        Write-Host "🔐 Security Checks" -ForegroundColor Yellow
        Write-Host "==================" -ForegroundColor Yellow
        Write-Host ""

        $securityIssues = @()

        # Check for password exposure
        Write-Host "  Checking for password exposure..." -ForegroundColor White
        if ($logs -match "redis://[^:]+:([^@]+)@") {
            $securityIssues += "Potential Redis password in logs"
            Write-Host "    ❌ WARNING: Potential Redis password found in logs!" -ForegroundColor Red
        } else {
            Write-Host "    ✅ No unmasked passwords found" -ForegroundColor Green
        }

        # Check for password masking
        Write-Host "  Checking for password masking..." -ForegroundColor White
        if ($logs -match "Redis connected to") {
            if ($logs -match "\*\*\*" -or $logs -match "host:[0-9]+") {
                Write-Host "    ✅ Passwords appear to be properly masked" -ForegroundColor Green
            } else {
                Write-Host "    ⚠️  Warning: Password masking may not be working" -ForegroundColor Yellow
            }
        }

        # Check for API keys
        Write-Host "  Checking for API keys..." -ForegroundColor White
        if ($logs -match "[A-Za-z0-9]{32,}") {
            Write-Host "    ⚠️  Potential API keys detected - manual review recommended" -ForegroundColor Yellow
        } else {
            Write-Host "    ✅ No obvious API keys found" -ForegroundColor Green
        }

        # Check for error patterns
        Write-Host "  Checking for error patterns..." -ForegroundColor White
        $errorCount = ($logs | Select-String -Pattern "ERROR|ECONNREFUSED|ETIMEDOUT" -AllMatches).Matches.Count
        if ($errorCount -gt 0) {
            Write-Host "    ⚠️  Found $errorCount error entries - review recommended" -ForegroundColor Yellow
            $securityIssues += "$errorCount errors found"
        } else {
            Write-Host "    ✅ No errors found" -ForegroundColor Green
        }

        # Check Redis connection status
        Write-Host "  Checking Redis connection status..." -ForegroundColor White
        if ($logs -match "Redis Client Connected") {
            Write-Host "    ✅ Redis connection successful" -ForegroundColor Green
        } elseif ($logs -match "Redis Client Error") {
            Write-Host "    ❌ Redis connection errors detected!" -ForegroundColor Red
            $securityIssues += "Redis connection failures"
        } else {
            Write-Host "    ℹ️  No Redis connection logs in this time window" -ForegroundColor Gray
        }

        Write-Host ""

        # Summary
        if ($securityIssues.Count -eq 0) {
            Write-Host "✅ No security issues detected in logs" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Security Issues Detected:" -ForegroundColor Yellow
            foreach ($issue in $securityIssues) {
                Write-Host "  - $issue" -ForegroundColor Yellow
            }
        }
        Write-Host ""
    }

    # Performance metrics
    Write-Host "📈 Performance Metrics" -ForegroundColor Yellow
    Write-Host "======================" -ForegroundColor Yellow
    Write-Host ""

    # Count API requests
    $apiRequests = ($logs | Select-String -Pattern "GET|POST|PUT|DELETE" -AllMatches).Matches.Count
    Write-Host "  API Requests: $apiRequests" -ForegroundColor White

    # Count Redis operations
    $redisOps = ($logs | Select-String -Pattern "redis|cache" -AllMatches).Matches.Count
    Write-Host "  Redis Operations: $redisOps" -ForegroundColor White

    # Check for slow queries
    $slowQueries = ($logs | Select-String -Pattern "slow|timeout" -AllMatches).Matches.Count
    if ($slowQueries -gt 0) {
        Write-Host "  ⚠️  Slow Queries: $slowQueries" -ForegroundColor Yellow
    }

    Write-Host ""
}

Write-Host "Monitoring complete." -ForegroundColor Green
Write-Host ""
Write-Host "For continuous monitoring, run:" -ForegroundColor Yellow
Write-Host "  .\scripts\monitor-logs.ps1 -Follow" -ForegroundColor White
