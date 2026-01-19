---
status: ACTIVE
last_updated: 2026-01-19
---

# LP Reporting Dashboard - Service Level Objectives (SLOs)

## Overview

This document defines the Service Level Objectives (SLOs) for the LP Reporting Dashboard API. These objectives represent our commitments to Limited Partners regarding system availability, performance, and reliability.

## SLO Summary

| Metric | Target | Measurement Window | Priority |
|--------|--------|-------------------|----------|
| Availability | 99.9% | 30 days | P1 |
| API Latency (p95) | < 500ms | 5 minutes | P2 |
| API Latency (p99) | < 2000ms | 5 minutes | P2 |
| Error Rate | < 0.1% | 5 minutes | P1 |
| Report Generation Time (p95) | < 30 seconds | 10 minutes | P2 |
| Cache Hit Rate | > 50% | 30 minutes | P3 |

## Detailed SLO Definitions

### 1. Availability SLO

**Objective**: 99.9% uptime
**Error Budget**: 43 minutes of downtime per month

**Definition**:
- Service is considered "available" when the API returns 2xx/3xx responses or valid 4xx client errors
- Service is considered "unavailable" when returning 5xx errors or timing out

**Measurement**:
```promql
(
  sum(rate(lp_api_requests_total{status=~"2..|3..|4.."}[30d]))
  /
  sum(rate(lp_api_requests_total[30d]))
) >= 0.999
```

**Error Budget Calculation**:
- Monthly time: 30 days × 24 hours × 60 minutes = 43,200 minutes
- Error budget: 43,200 × 0.001 = 43.2 minutes
- Weekly budget: 43.2 / 4.3 ≈ 10 minutes
- Daily budget: 43.2 / 30 ≈ 1.4 minutes

**Impact of Violation**:
- LPs cannot access their portfolio data
- Reports cannot be generated
- Regulatory compliance risk
- Investor relations damage

---

### 2. API Latency SLO (p95 < 500ms)

**Objective**: 95% of requests complete in under 500ms
**Error Budget**: 5% of requests may exceed 500ms

**Definition**:
- Measured from request receipt to response completion
- Includes all processing, database queries, and network time
- Excludes client-side network latency

**Measurement**:
```promql
histogram_quantile(0.95,
  sum(rate(lp_api_request_duration_ms_bucket[5m])) by (le, endpoint)
) < 500
```

**Endpoints Covered**:
- `/api/lp/profile` - LP profile details
- `/api/lp/summary` - Dashboard summary
- `/api/lp/capital-account` - Capital transactions
- `/api/lp/funds/:fundId/detail` - Fund details
- `/api/lp/funds/:fundId/holdings` - Portfolio holdings
- `/api/lp/performance` - Performance timeseries
- `/api/lp/performance/benchmark` - Benchmark comparison
- `/api/lp/reports` - Report listing
- `/api/lp/reports/:reportId` - Report status

**Impact of Violation**:
- Degraded user experience
- Dashboard feels slow and unresponsive
- Increased bounce rate
- Reduced investor engagement

---

### 3. API Latency SLO (p99 < 2000ms)

**Objective**: 99% of requests complete in under 2 seconds
**Error Budget**: 1% of requests may exceed 2 seconds

**Definition**:
- Measured from request receipt to response completion
- Ensures worst-case performance is bounded
- Critical for long-running queries (capital account, performance)

**Measurement**:
```promql
histogram_quantile(0.99,
  sum(rate(lp_api_request_duration_ms_bucket[5m])) by (le, endpoint)
) < 2000
```

**Impact of Violation**:
- Some users experience unacceptable delays
- Risk of request timeouts
- Potential data quality concerns (users may refresh, creating duplicate requests)

---

### 4. Error Rate SLO

**Objective**: < 0.1% error rate (99.9% success rate)
**Error Budget**: 1 error per 1,000 requests

**Definition**:
- Errors include 5xx server errors and unhandled exceptions
- Does not include 4xx client errors (bad requests, unauthorized, etc.)
- Measured across all LP API endpoints

**Measurement**:
```promql
(
  sum(rate(lp_api_errors_total[5m]))
  /
  sum(rate(lp_api_requests_total[5m]))
) < 0.001
```

**Error Categories**:
- **Database errors**: Connection failures, query timeouts
- **Service errors**: Calculation failures, data inconsistencies
- **Integration errors**: External service failures (if applicable)
- **System errors**: Out of memory, file system errors

**Impact of Violation**:
- Data integrity concerns
- Missing or incorrect LP reporting
- Compliance violations
- Investor confidence loss

---

### 5. Report Generation Time SLO

**Objective**: 95% of reports generated in under 30 seconds
**Error Budget**: 5% of reports may take longer

**Definition**:
- Measured from report request to completion
- Includes all data gathering, calculation, and PDF/Excel generation
- Does not include download time

**Measurement**:
```promql
histogram_quantile(0.95,
  sum(rate(lp_report_generation_duration_ms_bucket[10m])) by (le, report_type)
) < 30000
```

**Report Types**:
- **Quarterly Statement**: Full capital account + performance
- **Annual Summary**: Year-end holdings + tax documents
- **Custom Report**: User-defined date ranges and metrics

**Impact of Violation**:
- LPs must wait excessively for reports
- Increased support burden
- Delayed decision-making
- Regulatory deadline risk

**Report Generation SLO Failure Budget**:
- If p95 > 30s: 1 occurrence per week tolerable
- If p95 > 60s: Immediate investigation required

---

### 6. Cache Hit Rate SLO

**Objective**: > 50% cache hit rate
**Error Budget**: Cache hit rate may drop below 50% temporarily

**Definition**:
- Percentage of requests served from cache vs. database
- Measured across cacheable endpoints
- Helps reduce database load and improve response times

**Measurement**:
```promql
(
  sum(rate(lp_cache_hits_total[30m]))
  /
  (sum(rate(lp_cache_hits_total[30m])) + sum(rate(lp_cache_misses_total[30m])))
) > 0.50
```

**Cacheable Endpoints**:
- `/api/lp/profile` - LP profile (5 min TTL)
- `/api/lp/summary` - Dashboard summary (5 min TTL)
- `/api/lp/capital-account` - Capital account (5 min TTL)
- `/api/lp/performance` - Performance data (5 min TTL)
- `/api/lp/performance/benchmark` - Benchmarks (60 min TTL)

**Cache Invalidation**:
- On capital activity events (calls, distributions)
- On fund valuation updates
- On LP profile changes

**Impact of Low Cache Hit Rate**:
- Increased database load
- Higher latency (especially p95/p99)
- Increased infrastructure costs
- Reduced system scalability

**Optimization Actions**:
- Increase TTL for stable data
- Implement cache warming for common queries
- Add cache preloading for anticipated requests

---

## Error Budget Policy

### Error Budget Calculation

Each SLO has an error budget that represents acceptable failure or degradation:

| SLO | Error Budget | Monthly Allowance |
|-----|--------------|-------------------|
| Availability 99.9% | 0.1% downtime | 43.2 minutes |
| Latency p95 < 500ms | 5% slow requests | ~64,800 requests (at 1M req/month) |
| Latency p99 < 2000ms | 1% very slow requests | ~10,000 requests (at 1M req/month) |
| Error rate < 0.1% | 0.1% errors | ~1,000 errors (at 1M req/month) |
| Report gen < 30s | 5% slow reports | ~150 slow reports (at 3K reports/month) |

### Error Budget Consumption

**When error budget is healthy (> 50% remaining)**:
- Proceed with normal feature development
- Deploy changes with standard testing
- Experiment with new optimizations

**When error budget is low (< 50% remaining)**:
- Increase change review scrutiny
- Add extra monitoring to deployments
- Consider feature freeze for stability focus

**When error budget is exhausted (< 10% remaining)**:
- **Freeze non-critical deployments**
- Focus entirely on reliability improvements
- Conduct incident reviews and root cause analysis
- Implement corrective actions before resuming feature work

### SLO Review Cadence

- **Daily**: Check current error budget consumption
- **Weekly**: Review SLO compliance and trends
- **Monthly**: Formal SLO review with stakeholders
- **Quarterly**: Adjust SLOs based on business needs and system evolution

---

## Monitoring and Alerting

### Alert Priorities

**P1 (Critical)**:
- Availability violations
- High error rate (> 1%)
- Complete service outage

**P2 (High)**:
- Latency violations (p95/p99)
- Report generation failures
- Significant error budget burn

**P3 (Medium)**:
- Cache performance degradation
- Business metric anomalies
- Approaching error budget thresholds

### Dashboards

**Primary Dashboard**: LP API Health
- Real-time SLO compliance status
- Error budget burn rate
- Request rate and latency trends
- Cache hit rate
- Active alerts

**Secondary Dashboard**: LP Business Metrics
- Active LPs
- Report generation metrics
- Capital activity events
- User engagement metrics

---

## SLO Exception Handling

### Planned Maintenance

Planned maintenance windows are excluded from SLO calculations:
- Must be scheduled during low-traffic periods (weekends preferred)
- Must be announced 7 days in advance to LPs
- Maximum 4 hours per quarter

### Third-Party Dependencies

If SLO violations are caused by third-party service failures:
- Document the external dependency failure
- Implement circuit breaker to fail fast
- Exclude from SLO calculation if external root cause is proven

---

## Revision History

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-12-23 | 1.0 | Initial SLO definitions | DevOps Team |

---

## Related Documents

- [LP API Documentation](./lp-api.md)
- [Monitoring Runbooks](../monitoring/runbooks/)
- [Incident Response Playbook](./incident-response.md)
- [Performance Optimization Guide](./performance-optimization.md)
