# k6 Installation Guide for Windows

**Last Updated:** 2025-10-12
**Status:** k6 test files exist, binary installation required

## Quick Start (Recommended)

### Option 1: WinGet (Windows 10/11 Built-in)

```powershell
# Install
winget install k6 --source winget

# Verify
k6 version

# Run smoke test
npm run test:baseline
```

### Option 2: MSI Installer

1. Download: https://github.com/grafana/k6/releases/latest (look for `k6-*-windows-amd64.msi`)
2. Run installer
3. Verify: `k6 version`

### Option 3: Docker (No Installation Required)

```powershell
# Pull image
docker pull grafana/k6:latest

# Run smoke test
docker run --rm -v %cd%:/k6 -e BASE_URL=http://host.docker.internal:5000 grafana/k6 run /k6/k6/scenarios/smoke.js
```

## Project Integration

### Existing Test Files

- `k6/scenarios/smoke.js` - Quick smoke test (30s warmup, 1m load)
- `k6/scenarios/limit-smoke.js` - Rate limiting validation
- `tests/k6/k6-baseline.js` - Performance baseline
- `tests/k6/stress.js` - Load testing
- `tests/k6/soak.js` - Endurance testing

### npm Scripts

```bash
# Baseline performance test (requires k6 binary)
npm run test:baseline

# Manual runs
k6 run -e BASE_URL=http://localhost:5000 k6/scenarios/smoke.js
k6 run -e BASE_URL=http://localhost:5000 k6/scenarios/limit-smoke.js
```

### Docker Scripts (Add to package.json)

```json
{
  "scripts": {
    "perf:smoke": "docker run --rm -v %cd%:/k6 -e BASE_URL=http://host.docker.internal:5000 grafana/k6 run /k6/k6/scenarios/smoke.js",
    "perf:baseline": "docker run --rm -v %cd%:/k6 -e BASE_URL=http://host.docker.internal:5000 -e RATE=5 -e DURATION=2m -e VUS=20 grafana/k6 run /k6/tests/k6/k6-baseline.js"
  }
}
```

## Performance Thresholds

Per smoke test configuration (`k6/scenarios/smoke.js`):

- **p(95) < 1000ms** - 95th percentile response time under 1 second
- **Error rate < 10%** - Less than 10% failed requests
- **Average wait < 500ms** - Mean waiting time under 500ms

## Verification Checklist

After installation:

```powershell
# 1. Check version
k6 version

# 2. Start dev server
npm run dev

# 3. Run smoke test (in new terminal)
k6 run -e BASE_URL=http://localhost:5000 k6/scenarios/smoke.js

# 4. Check for summary output
# Expected: Console output + perf/smoke-summary.json
```

## Troubleshooting

### "k6 is not recognized"

**Solution:** Close and reopen terminal after installation

### Connection errors during tests

**Solution:** Ensure dev server running on port 5000
```bash
npm run dev  # In separate terminal
```

### Docker mounting fails

**Solution:** Enable file sharing for C:\ drive in Docker Desktop settings

## Related Documentation

- [OpenTelemetry Setup](../server/otel.ts) - Metrics collection and tracing
- [Performance Guard](../scripts/performance-guard.mjs) - Automated performance checks
- [Handoff Memo](../HANDOFF_MEMO_2025-10-12.md) - Week 1 perf gates plan
