---
status: ACTIVE
last_updated: 2026-01-19
---

# SLOs & Error Budgets

**Primary SLO**: p95 end-to-end latency ≤ 400 ms in normal conditions.

## SLIs
- Request latency (p50/p95/p99)
- Error rate (5xx + degraded-failed fallbacks)
- Fallback rate (% of requests served via fallback)

## Alerts (multi-window burn rates)
- p95 > 400 ms for 5 min (critical)
- Fallback rate > 10% for 5 min (warning)
- Circuit stuck OPEN > 5 min (critical)

## Dashboards
- State over time (CLOSED / HALF_OPEN / OPEN)
- Success/failure/fallback counts
- Time in OPEN / time-to-half-open
