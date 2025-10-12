# Local k6 Performance Testing Guide

**Last Updated:** 2025-10-12
**Related:** [k6 Installation Guide](k6-installation-guide.md)

## Quick Start

This guide shows how to replicate the CI performance tests locally before pushing to GitHub.

## Prerequisites

1. **k6 installed** - See [k6 Installation Guide](k6-installation-guide.md)
2. **Docker** (optional, for PostgreSQL + Redis)
3. **Node.js 20.19.1** (from `.nvmrc`)

## Local Test Environment Setup

### Option 1: Using Docker for Services (Recommended)

```powershell
# Start PostgreSQL and Redis services
docker compose -f docker-compose.dev.yml up -d postgres redis

# Wait for services to be healthy
docker compose -f docker-compose.dev.yml ps
```

### Option 2: Using Local PostgreSQL

If you have PostgreSQL installed locally:

```powershell
# Set environment variable
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/test"
```

## Running Performance Tests Locally

### Step 1: Set Up Environment Variables

```powershell
# Required environment variables (matching CI setup)
$env:NODE_ENV = "test"
$env:PORT = "5000"
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/test"
$env:REDIS_URL = "redis://localhost:6379"
$env:OTEL_SDK_DISABLED = "true"
```

### Step 2: Initialize Database

```powershell
npm run db:push
```

### Step 3: Start the API Server

```powershell
# Start server in background
npm run dev:api
```

### Step 4: Wait for Server Readiness

```powershell
# In a new terminal, wait for health endpoint
npx wait-on http://localhost:5000/api/health --timeout 60000
```

Or manually check:

```powershell
curl http://localhost:5000/api/health
```

Expected response:
```json
{"ok":true}
```

### Step 5: Run k6 Tests

```powershell
# Run baseline performance test (matches CI)
k6 run --env BASE_URL=http://localhost:5000 tests/k6/k6-baseline.js

# Or use npm script
npm run test:baseline
```

### Step 6: Check Results

k6 will output results to console and create `k6-results.json`:

```powershell
# View results
cat k6-results.json | jq
```

## Performance Thresholds (from CI)

Your local tests should meet these thresholds:

- **p95 Latency:** < 400ms
- **Error Rate:** < 1% (0.01)
- **Bundle Size:** < 400KB

## Complete One-Command Setup

Create this PowerShell script as `test-perf-local.ps1`:

```powershell
#!/usr/bin/env pwsh
# Local performance testing script

Write-Host "🚀 Starting local performance tests..." -ForegroundColor Cyan

# 1. Start services
Write-Host "`n📦 Starting Docker services..." -ForegroundColor Yellow
docker compose -f docker-compose.dev.yml up -d postgres redis
Start-Sleep -Seconds 5

# 2. Set environment
Write-Host "`n🔧 Setting environment variables..." -ForegroundColor Yellow
$env:NODE_ENV = "test"
$env:PORT = "5000"
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/test"
$env:REDIS_URL = "redis://localhost:6379"
$env:OTEL_SDK_DISABLED = "true"

# 3. Setup database
Write-Host "`n💾 Setting up database..." -ForegroundColor Yellow
npm run db:push

# 4. Start API server
Write-Host "`n🌐 Starting API server..." -ForegroundColor Yellow
Start-Process -NoNewWindow npm -ArgumentList "run", "dev:api"

# 5. Wait for server
Write-Host "`n⏳ Waiting for server to be ready..." -ForegroundColor Yellow
npx wait-on http://localhost:5000/api/health --timeout 60000

# 6. Run k6 tests
Write-Host "`n🏃 Running k6 performance tests..." -ForegroundColor Yellow
k6 run --env BASE_URL=http://localhost:5000 tests/k6/k6-baseline.js --out json=k6-results.json

# 7. Check thresholds
Write-Host "`n📊 Checking performance thresholds..." -ForegroundColor Yellow

$results = Get-Content k6-results.json | ConvertFrom-Json
$p95 = $results.metrics.http_req_duration.'p(95)'
$errorRate = $results.metrics.http_req_failed.rate

Write-Host "p95 Latency: $p95 ms (threshold: < 400ms)" -ForegroundColor $(if ($p95 -lt 400) { "Green" } else { "Red" })
Write-Host "Error Rate: $($errorRate * 100)% (threshold: < 1%)" -ForegroundColor $(if ($errorRate -lt 0.01) { "Green" } else { "Red" })

if ($p95 -lt 400 -and $errorRate -lt 0.01) {
    Write-Host "`n✅ All performance gates passed!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n❌ Performance gates failed!" -ForegroundColor Red
    exit 1
}
```

Run with:

```powershell
.\test-perf-local.ps1
```

## Troubleshooting

### Issue: "Connection refused"

**Solution:** Check that PostgreSQL and Redis are running:

```powershell
docker compose -f docker-compose.dev.yml ps
```

### Issue: "Database does not exist"

**Solution:** Run database push:

```powershell
npm run db:push
```

### Issue: "k6 command not found"

**Solution:** Install k6 following [k6 Installation Guide](k6-installation-guide.md)

### Issue: "Port 5000 already in use"

**Solution:** Find and kill the process:

```powershell
# Find process on port 5000
netstat -ano | findstr :5000

# Kill process by PID
taskkill /PID <PID> /F
```

### Issue: Tests fail with timeout

**Solution:** Increase wait-on timeout:

```powershell
npx wait-on http://localhost:5000/api/health --timeout 120000
```

## Running Specific k6 Tests

```powershell
# Smoke test (quick validation)
k6 run --env BASE_URL=http://localhost:5000 k6/scenarios/smoke.js

# Rate limiting test
k6 run --env BASE_URL=http://localhost:5000 k6/scenarios/limit-smoke.js

# Stress test
k6 run --env BASE_URL=http://localhost:5000 tests/k6/stress.js

# Soak test (long duration)
k6 run --env BASE_URL=http://localhost:5000 tests/k6/soak.js
```

## Customizing Test Parameters

```powershell
# Custom virtual users and duration
k6 run --env BASE_URL=http://localhost:5000 `
       --env VUS=50 `
       --env DURATION=5m `
       tests/k6/k6-baseline.js

# Custom rate limiting
k6 run --env BASE_URL=http://localhost:5000 `
       --env RATE=10 `
       tests/k6/k6-baseline.js
```

## Comparing with CI Results

After running locally, compare with CI results:

1. Go to GitHub Actions → Performance Gates workflow
2. Find your latest PR run
3. Download `k6-results` artifact
4. Compare metrics:

```powershell
# Local results
jq '.metrics.http_req_duration["p(95)"]' k6-results.json

# CI results (after downloading artifact)
jq '.metrics.http_req_duration["p(95)"]' ci-k6-results.json
```

## Integration with Git Workflow

Run before pushing:

```powershell
# Pre-push check
./test-perf-local.ps1

# If passed, push
git push
```

Or add to `.git/hooks/pre-push`:

```bash
#!/bin/sh
pwsh -File ./test-perf-local.ps1
```

## Related Documentation

- [k6 Installation Guide](k6-installation-guide.md)
- [Performance Gates Workflow](../.github/workflows/performance-gates.yml)
- [OpenTelemetry Setup](../server/otel.ts)
