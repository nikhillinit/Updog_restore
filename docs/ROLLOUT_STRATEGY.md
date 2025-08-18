# Circuit Breaker Rollout Strategy

This document outlines the safe, incremental rollout strategy for circuit breaker deployment.

## Overview

The rollout follows a **Shadow → Canary → Full** progression with strict promotion gates based on performance and reliability metrics.

## Phase 1: Shadow Mode (Week 1-2)

### Objective
Validate circuit breaker logic without impacting production traffic.

### Configuration
```bash
# All circuit breakers disabled - shadow mode only
CB_CACHE_ENABLED=false
CB_HTTP_ENABLED=false  
CB_DB_ENABLED=false
```

### Activities
- ✅ Deploy circuit breaker code with flags **disabled**
- ✅ Verify `/metrics` endpoint exposes circuit breaker metrics
- ✅ Confirm `/readinessz` endpoint works correctly
- ✅ Set up Prometheus scraping and Grafana dashboards
- ✅ Validate log output and decision logging
- ✅ Run load tests to establish baseline metrics

### Success Criteria
- [ ] All existing functionality works unchanged
- [ ] Circuit breaker metrics appear in Prometheus
- [ ] No performance regression (p95 < 400ms maintained)
- [ ] Admin endpoints accessible and return expected data

### Rollback Plan
Simply redeploy previous version - no configuration changes needed.

---

## Phase 2: Cache Canary (Week 3)

### Objective
Enable cache circuit breaker for a small percentage of traffic.

### Configuration
```bash
# Enable cache circuit breaker only
CB_CACHE_ENABLED=true           # 🟢 ENABLED
CB_HTTP_ENABLED=false
CB_DB_ENABLED=false

# Conservative cache settings
CB_CACHE_FAILURE_THRESHOLD=10   # Higher threshold initially
CB_CACHE_RESET_TIMEOUT_MS=60000 # Longer recovery time
CB_CACHE_OP_TIMEOUT_MS=3000     # Generous timeout
```

### Deployment Strategy
- **Single pod/instance** first (if using multiple replicas)
- **10% traffic** via load balancer routing
- **Monitor for 48 hours** before expanding

### Monitoring Focus
```promql
# Key metrics to watch
rate(updog_circuit_breaker_requests_total[5m])
rate(updog_circuit_breaker_failures_total[5m])
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

### Promotion Gates
- ✅ **P95 latency** < 400ms over 30 minutes
- ✅ **Error rate** < 1% over 30 minutes  
- ✅ **No circuit breaker trips** due to false positives
- ✅ **Memory fallback** working correctly during Redis outages

### Rollback Triggers
- P95 latency > 500ms for 5 minutes
- Error rate > 2% for 2 minutes
- Circuit breaker stuck OPEN > 10 minutes
- Memory leak or high resource usage

---

## Phase 3: HTTP Services Canary (Week 4)

### Objective
Enable HTTP circuit breakers for external API protection.

### Prerequisites
- ✅ Cache canary running successfully for 1 week
- ✅ No performance regressions
- ✅ Team comfortable with circuit breaker behavior

### Configuration
```bash
CB_CACHE_ENABLED=true
CB_HTTP_ENABLED=true            # 🟢 ENABLED
CB_DB_ENABLED=false

# Conservative HTTP settings
CB_HTTP_FAILURE_THRESHOLD=5     # Higher threshold
CB_HTTP_RESET_TIMEOUT_MS=120000 # 2 minute recovery
CB_HTTP_OP_TIMEOUT_MS=8000      # 8 second timeout
```

### Targets (in order)
1. **Partner APIs** (non-critical data)
2. **Market data feeds** (has stale fallbacks)
3. **Analytics services** (can degrade gracefully)

### Monitoring Focus
```promql
# Monitor external API dependencies
updog_circuit_breaker_state{breaker_name=~".*http.*"}
rate(updog_circuit_breaker_failures_total{breaker_name=~".*api.*"}[5m])
```

### Promotion Gates
- ✅ **All Phase 2 gates** still met
- ✅ **Stale data fallbacks** working correctly
- ✅ **Partner API failures** handled gracefully
- ✅ **No user-facing errors** from circuit breaker trips

---

## Phase 4: Database Read Replicas (Week 6+)

### Objective
Protect database read operations with circuit breakers.

### ⚠️ **HIGH RISK** - Only proceed if:
- Previous phases completely stable
- Database has proper read/write separation
- Robust caching/fallback strategies in place
- Team trained on database circuit breaker behavior

### Configuration
```bash
CB_CACHE_ENABLED=true
CB_HTTP_ENABLED=true
CB_DB_ENABLED=true              # 🟢 ENABLED - HIGH RISK

# Very conservative DB settings
CB_DB_FAILURE_THRESHOLD=8       # High threshold
CB_DB_RESET_TIMEOUT_MS=300000   # 5 minute recovery
CB_DB_OP_TIMEOUT_MS=15000       # 15 second timeout
```

### Targets (READ-ONLY operations)
1. **Analytics queries** (non-critical)
2. **Report generation** (can be cached)
3. **Dashboard data** (has fallbacks)

### ❌ **NEVER Enable For:**
- Write operations
- Critical read paths without fallbacks
- Authentication/authorization queries
- Financial calculations

---

## Monitoring & Alerting

### Key Dashboards
1. **Circuit Breaker Overview**
   - State transitions over time
   - Request/failure rates
   - Latency percentiles

2. **Service Health**
   - Readiness check status
   - Degraded service indicators
   - Error budget consumption

### Critical Alerts
```yaml
# Immediate response required
- CircuitBreakerOpen (critical)
- HighLatency > 400ms (warning)  
- HighErrorBurnRate > 1% (warning)

# Operational awareness
- CircuitBreakerStuckHalfOpen (warning)
- HighFailureRate > 10% (warning)
```

### Alert Escalation
1. **Slack notification** → Team channel
2. **PagerDuty page** → On-call engineer (critical alerts only)
3. **Auto-rollback** → If configured and safe

---

## Rollback Procedures

### Emergency Rollback (< 5 minutes)
```bash
# Disable all circuit breakers immediately
kubectl set env deployment/updog \
  CB_CACHE_ENABLED=false \
  CB_HTTP_ENABLED=false \
  CB_DB_ENABLED=false

# Or restart with previous environment
kubectl rollout restart deployment/updog
```

### Selective Rollback
```bash
# Disable specific circuit breaker
kubectl set env deployment/updog CB_HTTP_ENABLED=false
```

### Gradual Rollback
1. Reduce traffic percentage to canary instances
2. Monitor for improvement
3. Disable circuit breakers if needed
4. Full rollback if no improvement

---

## Success Metrics

### Performance
- **P95 latency** maintained < 400ms
- **P99 latency** < 1000ms
- **Error rate** < 0.5% sustained

### Reliability
- **Uptime** maintained > 99.9%
- **MTTR** for incidents reduced
- **Blast radius** of failures contained

### Operational
- **Alert fatigue** reduced
- **Manual interventions** decreased
- **Confidence** in system resilience increased

---

## Common Issues & Solutions

### Circuit Breaker Stuck OPEN
**Symptoms:** Breaker won't close after service recovery
**Solution:** Check underlying service health, adjust thresholds
**Prevention:** Tune `resetTimeout` and `successesToClose`

### False Positive Trips
**Symptoms:** Breaker trips during normal traffic spikes
**Solution:** Increase `failureThreshold` or `operationTimeout`
**Prevention:** Load test thresholds before production

### Memory Leaks
**Symptoms:** Memory usage grows with circuit breaker activity
**Solution:** Check stale data cache cleanup, restart service
**Prevention:** Monitor memory metrics, implement cache TTL

### Performance Regression
**Symptoms:** Latency increases after circuit breaker enable
**Solution:** Disable circuit breaker, investigate overhead
**Prevention:** Benchmark circuit breaker overhead in staging

---

## Team Training Checklist

- [ ] **Circuit breaker concepts** - Half-open, failure counting, etc.
- [ ] **Monitoring dashboards** - How to read circuit breaker metrics
- [ ] **Alert response** - What to do when circuit breaker trips
- [ ] **Rollback procedures** - How to disable circuit breakers safely
- [ ] **Debugging skills** - How to diagnose circuit breaker issues
- [ ] **Runbook familiarity** - Team knows where documentation lives

---

## Post-Deployment Validation

After each phase, validate:

1. **Functional Testing**
   - All user journeys work correctly
   - Error scenarios handled gracefully
   - Fallback mechanisms activated as expected

2. **Performance Testing**
   - Load testing with circuit breakers enabled
   - Chaos engineering - kill dependencies
   - Recovery time measurement

3. **Operational Testing**
   - Admin endpoints accessible
   - Metrics collection working
   - Alerts firing correctly

4. **Documentation Updates**
   - Runbooks updated with new procedures
   - Architecture diagrams include circuit breakers
   - Team training materials current