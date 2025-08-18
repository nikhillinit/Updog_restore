# Chaos Engineering & Audit Retention System

This document describes the comprehensive chaos testing and audit retention system implemented for hardened production operations.

## Overview

The system provides:
- **Engine Guards**: NaN/Infinity sanitization with fault injection for testing
- **Chaos Testing**: Toxiproxy-based network fault injection with comprehensive scenarios  
- **Admin Controls**: Non-production toggles for fault injection and guard configuration
- **Audit Retention**: Chunked, safe pg_cron-based cleanup with 7-year retention
- **Metrics & Monitoring**: Prometheus metrics for guard events and system health

## Engine Guards & Fault Injection

### Components
- **Guard Middleware**: `server/middleware/engineGuardExpress.ts` - Sanitizes API responses
- **Fault Injector**: `server/engine/fault-injector.ts` - Test-only NaN/Infinity injection
- **Metrics**: `server/metrics/calcGuards.ts` - Prometheus counters for guard events

### Usage
```typescript
// In API routes - guards are applied automatically
app.get('/api/calculate', (req, res) => {
  const result = await calculateSomething();
  const sanitized = req.guard?.sanitizeResponse(result);
  res.json(sanitized);
});

// For testing with fault injection
const faultyEngine = withFaults(normalEngine, { 
  rate: 0.1, 
  seed: 42,
  targetKeys: ['irr', 'moic', 'percentiles'] 
});
```

### Environment Variables
```bash
ENGINE_GUARD_ENABLED=true      # Enable guard sanitization
ENGINE_FAULT_RATE=0            # Fault injection rate (0 in prod)
ENGINE_FAULT_ENABLE=0          # Enable fault injection (test only)
ENGINE_FAULT_SEED=1337         # Deterministic fault seed
```

## Chaos Testing

### Infrastructure
- **Docker Compose**: `docker-compose.chaos.yml` - Toxiproxy + PostgreSQL + Redis
- **Test Suite**: `tests/chaos/postgres-latency.test.ts` - Comprehensive resilience scenarios
- **Client**: Built-in Toxiproxy client for fault management

### Quick Start
```bash
# Start chaos infrastructure
npm run chaos:start

# Run all chaos tests
npm run test:chaos

# Run specific scenarios
npm run test:chaos:pg      # PostgreSQL latency tests
npm run test:chaos:wasm    # Engine fault injection tests

# Cleanup
npm run chaos:stop
```

### Test Scenarios

#### PostgreSQL Resilience
- **500ms Latency**: Verifies P95 < 2s with circuit breaker
- **Connection Failures**: Tests circuit breaker opening/recovery
- **Network Partitions**: Validates timeout handling
- **Gradual Degradation**: Progressive latency increases
- **Recovery Testing**: Measures recovery time after healing

#### Redis Resilience  
- **Cache Latency**: 200ms delay, operations continue
- **Cache Unavailability**: Fallback to memory store

#### Engine Resilience
- **NaN/Infinity Injection**: Validates guard sanitization
- **Extreme Values**: Tests numeric overflow handling
- **Guard Depth/Breadth**: Validates performance limits

### Acceptance Criteria
- ✅ P95 latency < 2 seconds under 500ms PG latency
- ✅ Circuit breaker opens under sustained failures  
- ✅ Recovery < 15 seconds after fault healing
- ✅ Error rate < 5% during degradation
- ✅ No NaN/Infinity reaches API responses

## Admin Controls

### Engine Management API

**Get Status** (any environment)
```bash
curl http://localhost:5000/api/admin/engine/status
```

**Update Configuration** (non-production only)
```bash
curl -X POST http://localhost:5000/api/admin/engine/guard \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "faultRate": 0.1}'
```

### Environment Detection
- Production: All admin modifications return 403
- Non-production: Full control over guard and fault injection settings
- Test: Automatic fault injection enablement

## Audit Log & Retention

### Audit Table Schema
```sql
CREATE TABLE audit_log (
    id UUID PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    changes JSONB,
    ip_address INET,
    user_agent TEXT,
    correlation_id VARCHAR(36),
    session_id VARCHAR(64),
    request_path TEXT,
    http_method VARCHAR(10),
    status_code INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    retention_until TIMESTAMPTZ GENERATED ALWAYS AS (created_at + INTERVAL '7 years') STORED
);
```

### Chunked Retention System

**Key Features:**
- ✅ **Chunked Deletion**: 10k records per batch with 50ms pauses
- ✅ **Timeout Protection**: 1s lock timeout, 5min statement timeout
- ✅ **Least Privilege**: Dedicated `job_runner` role
- ✅ **UTC Scheduling**: 02:00 UTC daily execution
- ✅ **Observability**: Run history and status monitoring

### Database Operations

**Run Migration**
```bash
npm run db:migrate  # Apply 003_audit_retention.sql
```

**Schedule Cleanup Job**
```bash
npm run pgcron:schedule
```

**Monitor Status**
```bash
npm run pgcron:status
npm run audit:cleanup  # Manual test run
```

**Unschedule Job**
```bash
npm run pgcron:unschedule
```

### pg_cron Setup Requirements

**AWS RDS/Aurora:**
1. Custom parameter group: `shared_preload_libraries = 'pg_cron'`
2. Restart instance
3. `CREATE EXTENSION pg_cron;` with rds_superuser

**Self-managed PostgreSQL:**
1. Add to postgresql.conf: `shared_preload_libraries = 'pg_cron'`
2. Restart PostgreSQL
3. `CREATE EXTENSION pg_cron;`

**Verification**
```sql
-- Check extension
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- View scheduled jobs
SELECT * FROM cron.job WHERE jobname = 'cleanup-audit';

-- Monitor job runs
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'cleanup-audit')
ORDER BY start_time DESC LIMIT 5;
```

## Metrics & Monitoring

### Prometheus Metrics
- `calc_guard_bad_values_total`: Count of sanitized NaN/Infinity values
- `calc_guard_events_total`: Count of guard sanitization events
- `updog_circuit_breaker_*`: Circuit breaker state and performance
- Standard Node.js process metrics

### Dashboards
Access metrics at `/metrics` endpoint for Prometheus scraping.

### Alerting Recommendations
- **Guard Events**: Alert if `calc_guard_events_total` increases rapidly
- **Circuit Breaker**: Alert if breakers stay open > 5 minutes
- **Audit Cleanup**: Alert if pg_cron job fails or doesn't run within 24h
- **Chaos Test**: Alert if P95 latency exceeds 2s during scheduled tests

## Runbooks

### Engine Guard Issues
1. Check admin status: `GET /api/admin/engine/status`
2. Review metrics for guard event spikes
3. Examine correlation IDs in logs for affected requests
4. If systemic, disable fault injection in non-prod

### Circuit Breaker Recovery
1. Check `/api/circuit-breaker/status` endpoint
2. Verify upstream dependencies (PostgreSQL, Redis)
3. Monitor recovery via `/health/detailed`
4. Manual reset if needed via admin API

### Audit Retention Issues  
1. Check job status: `npm run pgcron:status`
2. Review `cron.job_run_details` for failures
3. Manual cleanup: `npm run audit:cleanup`
4. Verify table size growth: `SELECT * FROM maintenance.audit_cleanup_status();`

### Chaos Test Failures
1. Verify Docker services: `docker-compose -f docker-compose.chaos.yml ps`
2. Check Toxiproxy API: `curl http://localhost:8474/proxies`
3. Reset faults: `npm run chaos:reset`
4. Review test timeouts and SLO thresholds

## Security Considerations

- **Fault Injection**: Disabled by default in production
- **Admin APIs**: Protected by environment checks
- **Audit Logs**: 7-year retention for compliance
- **Least Privilege**: Dedicated roles for scheduled jobs
- **Correlation IDs**: Enable tracing without exposing sensitive data

## Performance Impact

- **Engine Guards**: < 1ms overhead per API call
- **Audit Logging**: Asynchronous with minimal request impact  
- **Retention Cleanup**: Chunked execution to avoid table locks
- **Chaos Tests**: Isolated infrastructure, no production impact

## Future Enhancements

- **Partition-based Retention**: Drop monthly partitions instead of deletion
- **Advanced Fault Types**: Memory pressure, CPU spikes, disk I/O limits
- **Automated Recovery**: Self-healing based on metrics thresholds
- **Multi-region Chaos**: Cross-AZ and cross-region resilience testing