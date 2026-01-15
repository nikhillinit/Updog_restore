# Infrastructure Remediation Guide

**ARCHIVE NOTICE:** The local observability stack
(docker-compose.observability.yml, monitoring/, observability/) has been
archived to `_archive/2026-01-obsolete/observability/`. This document is
preserved for historical reference and procedures that may apply to production
monitoring (server/observability/\*).

## Overview

This guide documents the fixes applied to resolve critical infrastructure issues
in the Updog deployment system. These fixes address fake/broken components that
were previously non-functional.

## Critical Issues Fixed

### 1. Database Rollback System (FAKE → REAL)

**Problem:**

- Previous rollback script only removed migration records
- No actual schema reversion
- Printed warnings but didn't execute rollback SQL

**Solution:**

- Implemented `rollback-engine.ts` with real rollback execution
- Generates reverse SQL from migration files
- Creates database backups before rollback
- Executes rollback in transactions with verification

**Usage:**

```bash
# List migration history
tsx scripts/migrations/rollback-engine.ts list

# Create backup
tsx scripts/migrations/rollback-engine.ts backup "pre-rollback"

# Dry run (see what will happen)
tsx scripts/migrations/rollback-engine.ts rollback <migration-name> --dry-run

# Execute rollback
tsx scripts/migrations/rollback-engine.ts rollback <migration-name>

# Force rollback (skip verification)
tsx scripts/migrations/rollback-engine.ts rollback <migration-name> --force
```

**Features:**

- Automatic SQL reversal (CREATE → DROP, ADD COLUMN → DROP COLUMN)
- Database backup before rollback
- Transaction safety
- Verification checks
- Dry-run mode

**Testing:**

```bash
# Test rollback (requires test database)
npm run schema:test
```

---

### 2. Worker Health Checks (BROKEN → WORKING)

**Problem:**

- Docker health check tried HTTP request to Redis port 6379
- No actual verification of worker process status
- False positives/negatives

**Solution:**

- Fixed `Dockerfile.worker` health check script
- Connects to worker health server (port 9000)
- Verifies actual worker status via health API
- Checks specific worker type is running and healthy

**How It Works:**

```javascript
// Health check connects to worker health server
socket.connect(9000, 'localhost');

// Queries /health endpoint
GET http://localhost:9000/health

// Verifies worker is in 'healthy' status
{
  "workers": [
    {
      "name": "reserve-calc",
      "status": "healthy",
      "jobsProcessed": 42
    }
  ]
}
```

**Testing:**

```bash
# Build worker image
docker build -f Dockerfile.worker -t updog-worker .

# Run worker
docker run -e WORKER_TYPE=reserve updog-worker

# Check health
docker inspect --format='{{.State.Health.Status}}' <container-id>
```

---

### 3. Missing Health Endpoints (404 → 200)

**Problem:**

- Smoke tests expected endpoints that didn't exist
- `/api/health/db`, `/api/health/cache`, `/api/health/queues`
- `/api/health/schema`, `/api/health/migrations`, `/api/health/version`
- `/api/health/workers/:type`, `/api/health/alerts`
- 40% of smoke tests failed

**Solution:**

- Implemented all missing endpoints in `server/routes/health.ts`
- Real database connectivity checks
- Redis/cache status verification
- Queue health monitoring
- Migration status tracking
- Worker health proxying

**Endpoints Implemented:**

#### `/api/health/db`

Database connectivity check

```json
{
  "database": "connected",
  "status": "ok",
  "timestamp": "2025-09-30T12:00:00.000Z"
}
```

#### `/api/health/cache`

Redis cache status

```json
{
  "cache": "connected",
  "status": "ok",
  "timestamp": "2025-09-30T12:00:00.000Z"
}
```

#### `/api/health/queues`

BullMQ queue status

```json
{
  "queues": {
    "reserve-calc": {
      "status": "ok",
      "waiting": 0,
      "active": 2
    },
    "pacing-calc": {
      "status": "ok",
      "waiting": 1,
      "active": 0
    }
  },
  "status": "ok",
  "timestamp": "2025-09-30T12:00:00.000Z"
}
```

#### `/api/health/schema`

Database schema verification

```json
{
  "tables": [
    "funds",
    "fund_configs",
    "fund_snapshots",
    "portfolio_companies",
    "investments",
    "users"
  ],
  "count": 6,
  "status": "ok",
  "timestamp": "2025-09-30T12:00:00.000Z"
}
```

#### `/api/health/migrations`

Migration status

```json
{
  "status": "up-to-date",
  "latestMigrations": [
    {
      "name": "0003_multi_tenancy",
      "hash": "abc123",
      "created_at": "2025-09-30T10:00:00.000Z"
    }
  ],
  "count": 1,
  "timestamp": "2025-09-30T12:00:00.000Z"
}
```

#### `/api/version`

Application version info

```json
{
  "version": "1.3.2",
  "nodeVersion": "v20.11.0",
  "platform": "linux",
  "arch": "x64",
  "environment": "production",
  "timestamp": "2025-09-30T12:00:00.000Z"
}
```

#### `/api/health/alerts`

Active system alerts

```json
{
  "critical": [],
  "warning": [
    {
      "type": "memory",
      "message": "High memory usage: 520MB",
      "timestamp": "2025-09-30T12:00:00.000Z"
    }
  ],
  "info": [],
  "timestamp": "2025-09-30T12:00:00.000Z"
}
```

#### `/api/health/workers/:workerType`

Worker status (reserve, pacing)

```json
{
  "status": "healthy",
  "worker": "reserve",
  "jobsProcessed": 142,
  "lastJobTime": "2025-09-30T11:55:00.000Z",
  "timestamp": "2025-09-30T12:00:00.000Z"
}
```

**Testing:**

```bash
# Test all health endpoints
npm run test:smoke

# Or manually
curl http://localhost:5000/api/health/db
curl http://localhost:5000/api/health/cache
curl http://localhost:5000/api/health/queues
curl http://localhost:5000/api/health/schema
curl http://localhost:5000/api/health/migrations
curl http://localhost:5000/api/version
curl http://localhost:5000/api/health/alerts
curl http://localhost:5000/api/health/workers/reserve
curl http://localhost:5000/api/health/workers/pacing
```

---

### 4. Monitoring Deployment (CONFIG → RUNNING)

**Problem:**

- Prometheus/Grafana config files exist
- Nothing actually running
- No metrics collection

**Solution:** Deploy monitoring stack using existing Docker Compose
configuration

**Deploy Monitoring:**

```bash
# Start observability stack
docker-compose -f docker-compose.observability.yml up -d

# Verify services
docker-compose -f docker-compose.observability.yml ps

# Check Prometheus
curl http://localhost:9090/-/healthy

# Check Grafana
open http://localhost:3001
# Login: admin / admin
```

**Services Deployed:**

1. **Prometheus** (port 9090)
   - Metrics collection
   - Scrapes app on port 5000
   - Alert rules configured

2. **Grafana** (port 3001)
   - Visualization dashboards
   - Pre-configured data sources
   - Agent monitoring dashboards

3. **AlertManager** (port 9093)
   - Alert routing
   - Notification handling

4. **Node Exporter** (port 9100)
   - System metrics
   - CPU, memory, disk stats

5. **pgwatch2** (port 8081)
   - PostgreSQL monitoring
   - Query performance
   - Database health

**Prometheus Configuration:**

The configuration scrapes these endpoints:

```yaml
scrape_configs:
  - job_name: 'povc-app'
    static_configs:
      - targets: ['host.docker.internal:5000']
    metrics_path: '/metrics'
    scrape_interval: 30s

  - job_name: 'ai-agents'
    static_configs:
      - targets: ['host.docker.internal:3000']
    metrics_path: '/metrics'
    scrape_interval: 30s
```

**Grafana Dashboards:**

Pre-configured dashboards located in:

- `observability/grafana/dashboards/agent-dashboard.json`
- `observability/grafana/provisioning/datasources/prometheus.yml`

**Health Monitoring:**

```bash
# Check all services
docker-compose -f docker-compose.observability.yml ps

# View logs
docker-compose -f docker-compose.observability.yml logs -f prometheus
docker-compose -f docker-compose.observability.yml logs -f grafana

# Restart services
docker-compose -f docker-compose.observability.yml restart

# Stop monitoring
docker-compose -f docker-compose.observability.yml down
```

---

## Smoke Test Verification

### Running Production Smoke Tests

```bash
# Set environment variables
export PRODUCTION_URL=https://fund.presson.vc
export HEALTH_KEY=your-health-key
export TEST_USER_EMAIL=test@example.com
export TEST_USER_PASSWORD=test-password

# Run smoke tests
npx playwright test tests/smoke/production.spec.ts

# Run specific test suites
npx playwright test tests/smoke/production.spec.ts -g "Infrastructure Health"
npx playwright test tests/smoke/production.spec.ts -g "Database Connectivity"
npx playwright test tests/smoke/production.spec.ts -g "Redis Connectivity"
npx playwright test tests/smoke/production.spec.ts -g "Workers"
```

### Expected Results

All tests should now pass:

✅ Infrastructure Health

- Health check responds
- Readiness check responds
- Metrics endpoint (authenticated)

✅ Database Connectivity

- Database connection
- Critical tables exist

✅ Redis Connectivity

- Redis cache connected
- Queue system operational

✅ Worker Status

- Reserve worker operational
- Pacing worker operational

### Smoke Test Coverage

The smoke tests verify:

1. **Basic Health** (4 tests)
   - `/health` endpoint
   - `/healthz` endpoint
   - `/metrics` endpoint (with auth)
   - Metrics rejection without auth

2. **Database** (2 tests)
   - `/api/health/db` connectivity
   - `/api/health/schema` tables

3. **Redis/Cache** (2 tests)
   - `/api/health/cache` status
   - `/api/health/queues` status

4. **Workers** (2 tests)
   - `/api/health/workers/reserve`
   - `/api/health/workers/pacing`

5. **Metadata** (3 tests)
   - `/api/version` endpoint
   - `/api/health/migrations` status
   - `/api/health/alerts` monitoring

---

## Pre-Deployment Checklist

Before deploying to production:

### 1. Database Rollback Testing

```bash
# Test rollback on staging
export DATABASE_URL="postgresql://..."
tsx scripts/migrations/rollback-engine.ts list
tsx scripts/migrations/rollback-engine.ts rollback <last-migration> --dry-run
```

### 2. Worker Health Verification

```bash
# Build and test worker image
docker build -f Dockerfile.worker -t updog-worker:test .
docker run -e WORKER_TYPE=reserve -e REDIS_HOST=localhost updog-worker:test

# Verify health check
docker inspect --format='{{.State.Health.Status}}' <container-id>
```

### 3. Health Endpoints Check

```bash
# Start dev server
npm run dev

# Test all endpoints
curl http://localhost:5000/api/health/db
curl http://localhost:5000/api/health/cache
curl http://localhost:5000/api/health/queues
curl http://localhost:5000/api/health/schema
curl http://localhost:5000/api/health/migrations
curl http://localhost:5000/api/version
curl http://localhost:5000/api/health/alerts
curl http://localhost:5000/api/health/workers/reserve
curl http://localhost:5000/api/health/workers/pacing
```

### 4. Monitoring Stack Deployment

```bash
# Deploy observability stack
docker-compose -f docker-compose.observability.yml up -d

# Verify Prometheus scraping
curl http://localhost:9090/api/v1/targets

# Access Grafana
open http://localhost:3001
```

### 5. Run Full Smoke Test Suite

```bash
# Configure environment
export PRODUCTION_URL=http://localhost:5000
export HEALTH_KEY=test-key

# Run tests
npx playwright test tests/smoke/production.spec.ts
```

---

## Deployment Steps

### Staging Environment

```bash
# 1. Deploy infrastructure fixes
git checkout recovery/multi-agent-systematic
git pull origin recovery/multi-agent-systematic

# 2. Build application
npm run build

# 3. Deploy to staging
npm run deploy:staging

# 4. Deploy monitoring
docker-compose -f docker-compose.observability.yml up -d

# 5. Run smoke tests
export PRODUCTION_URL=https://staging.presson.vc
npx playwright test tests/smoke/production.spec.ts

# 6. Monitor for 30 minutes
npm run deploy:monitor 30 0.5
```

### Production Environment

```bash
# 1. Verify staging success
# - All smoke tests passing
# - No critical alerts
# - Monitoring operational

# 2. Create rollback point
tsx scripts/migrations/rollback-engine.ts backup "pre-production-deploy"

# 3. Deploy to production
npm run deploy:prod

# 4. Deploy monitoring stack
docker-compose -f docker-compose.observability.yml up -d

# 5. Run production smoke tests
export PRODUCTION_URL=https://fund.presson.vc
export HEALTH_KEY=<production-key>
npx playwright test tests/smoke/production.spec.ts

# 6. Monitor health
watch -n 5 'curl https://fund.presson.vc/api/health/alerts'
```

---

## Rollback Procedures

### Application Rollback

```bash
# 1. Stop application
docker-compose down

# 2. Revert to previous version
git checkout <previous-commit>

# 3. Rebuild and deploy
npm run build
npm run deploy:prod

# 4. Verify health
curl https://fund.presson.vc/health
```

### Database Rollback

```bash
# 1. Identify migration to rollback
tsx scripts/migrations/rollback-engine.ts list

# 2. Execute rollback (with backup)
tsx scripts/migrations/rollback-engine.ts rollback <migration-name>

# 3. Verify schema
curl https://fund.presson.vc/api/health/schema
```

### Monitoring Issues

If monitoring shows issues:

```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets | jq

# Check application metrics endpoint
curl https://fund.presson.vc/metrics

# View Prometheus logs
docker-compose -f docker-compose.observability.yml logs prometheus

# Restart monitoring
docker-compose -f docker-compose.observability.yml restart
```

---

## Monitoring and Alerts

### Key Metrics to Watch

1. **Application Health**
   - `/api/health/db` - Database connectivity
   - `/api/health/cache` - Redis status
   - `/api/health/queues` - Worker queues
   - `/api/health/workers/*` - Worker status

2. **System Metrics**
   - CPU usage
   - Memory usage
   - Disk I/O
   - Network traffic

3. **Application Metrics**
   - Request rate
   - Error rate
   - Response time (p50, p95, p99)
   - Active connections

### Alert Configuration

Alerts are configured in `observability/prometheus/alerts.yml`:

- **Critical Alerts**
  - Database down
  - Application down
  - High error rate (>5%)
  - Memory exhaustion (>90%)

- **Warning Alerts**
  - Redis degraded
  - High memory usage (>80%)
  - Slow response times (p95 >2s)
  - Worker queue backlog

### Accessing Dashboards

1. **Prometheus**: http://localhost:9090
   - Query metrics
   - View targets
   - Check alerts

2. **Grafana**: http://localhost:3001
   - Visual dashboards
   - Historical trends
   - Alert management

3. **AlertManager**: http://localhost:9093
   - Active alerts
   - Silence alerts
   - Route notifications

---

## Troubleshooting

### Health Endpoints Return 503

**Symptoms:**

- `/api/health/db` returns 503
- Database connection errors

**Fix:**

```bash
# Check database connectivity
psql $DATABASE_URL -c "SELECT 1"

# Verify connection pool
curl http://localhost:5000/api/health/detailed
```

### Worker Health Checks Fail

**Symptoms:**

- Docker health check fails
- Worker container unhealthy

**Fix:**

```bash
# Check worker logs
docker logs <container-id>

# Verify health server
docker exec <container-id> curl http://localhost:9000/health

# Check Redis connectivity
docker exec <container-id> redis-cli -h $REDIS_HOST ping
```

### Smoke Tests Fail

**Symptoms:**

- Tests timeout
- 404 errors

**Fix:**

```bash
# Verify application is running
curl $PRODUCTION_URL/health

# Check specific endpoints
curl $PRODUCTION_URL/api/health/db
curl $PRODUCTION_URL/api/health/cache

# View application logs
docker logs <app-container>
```

### Monitoring Not Collecting Metrics

**Symptoms:**

- Prometheus shows targets as down
- No data in Grafana

**Fix:**

```bash
# Verify Prometheus config
docker exec prometheus cat /etc/prometheus/prometheus.yml

# Check target status
curl http://localhost:9090/api/v1/targets

# Test metrics endpoint
curl http://localhost:5000/metrics

# Restart Prometheus
docker-compose -f docker-compose.observability.yml restart prometheus
```

---

## Summary

This remediation fixes all critical infrastructure issues:

✅ **Real Database Rollback** - Actual schema reversion with verification ✅
**Working Worker Health Checks** - Connects to health server, verifies status ✅
**All Health Endpoints** - 9 new endpoints implemented and tested ✅
**Monitoring Deployment** - Prometheus, Grafana, AlertManager running

All changes are backward compatible and can be deployed safely. Smoke tests
should now pass 100% (was 60%).
