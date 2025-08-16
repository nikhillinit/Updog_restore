# Fund Calculation Testing Suite

## Overview
Comprehensive testing suite for fund calculation API including load testing, chaos engineering, and monitoring.

## Test Types

### 1. k6 Load Testing
Located in `tests/k6/`

#### Baseline Test (`k6-baseline.js`)
Standard load test with SLO thresholds:
```bash
k6 run -e BASE_URL=https://staging.yourdomain.com \
       -e METRICS_KEY=$METRICS_KEY \
       -e HEALTH_KEY=$HEALTH_KEY \
       -e FUND_SIZE=100000000 \
       -e RATE=5 -e DURATION=2m -e VUS=20 \
       tests/k6/k6-baseline.js
```

**Thresholds:**
- Error rate < 1%
- P95 latency < 500ms
- End-to-end calculation < 1.5s
- Calculation failure rate < 2%

#### Chaos Test (`k6-chaos.js`)
Run during Redis disruptions to observe circuit breaker behavior:
```bash
k6 run -e BASE_URL=https://staging.yourdomain.com \
       -e METRICS_KEY=$METRICS_KEY \
       -e FUND_SIZE=100000000 \
       -e RATE=3 -e DURATION=5m \
       tests/k6/k6-chaos.js
```

### 2. Chaos Engineering
Located in `tests/chaos/`

#### Local ToxiProxy Setup
Simulates network issues between app and Redis:

```bash
# Start ToxiProxy and Redis
docker compose -f tests/chaos/docker-compose.toxiproxy.yml up -d

# Point app to proxy
export REDIS_URL=redis://localhost:6380

# Induce chaos
./tests/chaos/chaos.sh break  # Add latency and packet loss
./tests/chaos/chaos.sh heal   # Restore connection
./tests/chaos/chaos.sh status # Check proxy status
```

### 3. Smoke Tests
Quick validation script in `scripts/smoke.sh`:

```bash
export BASE_URL=https://staging.yourdomain.com
export METRICS_KEY=your-metrics-key
export HEALTH_KEY=your-health-key
./scripts/smoke.sh
```

Validates:
- Health endpoints (/healthz, /readyz)
- Metrics authentication
- Fund calculation async flow

## Monitoring

### Prometheus Alert Rules
Located in `monitoring/prometheus-rules.yaml`

**Critical Alerts:**
- `RedisDown`: Redis connection lost for 2m
- `CircuitBreakerOpen`: Breaker open for 1m
- `HighErrorRate`: 5xx > 1% for 5m
- `SLOBurnFast`: Error budget burning too quickly

**Warning Alerts:**
- `TargetDown`: Service down for 2m
- `P95LatencyHigh`: P95 > 500ms for 10m
- `CacheHitRateLow`: Hit rate < 80% for 10m
- `SLOBurnSlow`: Prolonged elevated errors

## Test Scenarios

### 1. Baseline Performance
```bash
# Run 2-minute baseline at 5 req/s
npm run test:baseline
```

### 2. Redis Failure
```bash
# Terminal 1: Start chaos monitor
npm run test:chaos

# Terminal 2: Break Redis
./tests/chaos/chaos.sh break

# Wait 30s, then heal
./tests/chaos/chaos.sh heal
```

### 3. Staging Validation
```bash
# After deployment
npm run test:staging
```

## CI Integration

### GitHub Actions
Tests run automatically on:
- Pull requests (baseline)
- Staging deployments (smoke + baseline)
- Nightly (full chaos suite)

### Required Secrets
- `METRICS_KEY`: Bearer token for /metrics
- `HEALTH_KEY`: Token for detailed health
- `STAGING_URL`: Staging environment URL

## Performance Targets

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Availability | 99.9% | < 99% |
| P95 Latency | < 500ms | > 500ms |
| P99 Latency | < 1000ms | > 1500ms |
| Error Rate | < 0.1% | > 1% |
| Cache Hit Rate | > 90% | < 80% |

## Troubleshooting

### k6 Installation
```bash
# macOS
brew install k6

# Windows
choco install k6

# Linux
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

### Common Issues

**Circuit breaker not opening:**
- Check `REDIS_URL` is correct
- Verify circuit breaker is enabled in providers.ts
- Check metrics endpoint for `circuit_breaker_state`

**Load test timeouts:**
- Increase VUS parameter
- Check network connectivity
- Verify service scaling

**ToxiProxy connection refused:**
- Ensure Docker is running
- Check port 8474 is available
- Verify proxy configuration in toxics.json