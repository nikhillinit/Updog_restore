---
status: ACTIVE
last_updated: 2026-01-19
---

# Unified Metrics Layer - Operator Runbook

**Quick Reference for Production Operations**

---

## 🚨 When Metrics Look Wrong - Diagnostic Checklist

### Step 1: Check Metric Status

```bash
# Fetch metrics with status information
curl -H "Authorization: Bearer $TOKEN" \
  https://api.yourapp.com/api/funds/123/metrics
```

Look for `_status` field in response:
```json
{
  "_status": {
    "engines": {
      "actual": "success",
      "projected": "partial",  // ⚠️ Warning
      "variance": "success"
    },
    "partial": true,
    "errors": ["ProjectedMetricsCalculator: insufficient graduation data"]
  }
}
```

**Status meanings:**
- `success`: Engine ran without issues
- `partial`: Engine ran with fallback/defaults (check `errors` array)
- `failed`: Engine failed completely (metrics may be missing)

### Step 2: Invalidate Cache (If Data Recently Changed)

```bash
# Force fresh calculation
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  https://api.yourapp.com/api/funds/123/metrics/invalidate
```

**When to invalidate:**
- New investment created
- Valuation updated
- Company data changed
- Fund configuration modified

**Rate limit:** 6 requests/minute per fund

### Step 3: Verify Source Data

**DPI shows "N/A" or 0.00x:**
- Check if distributions are recorded in database
- DPI = `null` (renders "N/A") when no distributions exist
- This is **not an error** - it prevents false "0.00x" that implies failure

**IRR is null:**
- Check cashflows have both positive (distributions) and negative (calls) flows
- XIRR requires at least 2 flows with opposite signs
- Review error logs for "Invalid sign convention" warning

**Projected metrics missing:**
- Check if `skipProjections=true` query param was used
- Verify fund has graduation matrix configured
- Look for "INSUFFICIENT_DATA" errors in `_status`

### Step 4: Export Test Vectors for Excel Comparison

```typescript
// In browser console on metrics page
const metrics = await fetch('/api/funds/123/metrics').then(r => r.json());
const flows = [
  { date: '2020-01-01', amount: -100000 },  // calls
  { date: '2025-01-01', amount: 150000 }    // distributions
];
console.table(flows);
// Copy to Excel: =XIRR(amounts, dates)
```

**Excel tolerance:** XIRR should match within ±1e-7 (0.00001%)

---

## 🔧 Safe Cache Invalidation Protocol

### Manual Invalidation

```bash
# 1. Check current cache status
curl https://api.yourapp.com/api/funds/123/metrics | jq '._cache'

# 2. Invalidate (requires auth + fund access)
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  https://api.yourapp.com/api/funds/123/metrics/invalidate

# 3. Verify fresh data (should show cache.hit: false)
curl https://api.yourapp.com/api/funds/123/metrics | jq '._cache'
```

### Bulk Invalidation (Admin Only)

```bash
# Invalidate all funds (use with caution)
for fundId in $(seq 1 100); do
  curl -X POST -H "Authorization: Bearer $TOKEN" \
    https://api.yourapp.com/api/funds/$fundId/metrics/invalidate
  sleep 0.2  # Respect rate limits
done
```

### Security Controls

- **Authentication:** Required (401 without token)
- **Authorization:** Fund-scoped (403 if no access)
- **Rate Limiting:** 6 requests/min/fund (429 if exceeded)
- **Stampede Prevention:** Automatic (serves stale during recompute)

---

## 📊 Understanding "Partial" Status

**When `_status.partial === true`:**

The system calculated metrics using fallback data when ideal data was unavailable.

### Common Partial Scenarios

| Status | Cause | Impact | Action |
|--------|-------|--------|--------|
| `projected: partial` | No graduation matrix | Uses default 20% grad rate | Add matrix to fund config |
| `actual: partial` | Missing investment dates | Uses fund inception | Fix investment records |
| `variance: partial` | No target configured | Shows 0% variance | Set target IRR/TVPI |

### Viewing Partial Details

```json
{
  "_status": {
    "partial": true,
    "engines": {
      "actual": "success",
      "projected": "partial"
    },
    "warnings": [
      "Using default graduation rate (20%) - no matrix configured"
    ]
  }
}
```

**UI rendering:** Show badge "Calculated" / "Partial" with tooltip on metrics header

---

## 🧮 Metric Calculation Deep Dive

### DPI (Distributions / Paid-In Capital)

```
DPI = Total Distributions / Total Called Capital
```

**Null semantics:**
- `null` → Renders "—" or "N/A" (no distributions recorded)
- `0.0` → Never shown (prevents false failure signal)
- `> 0` → Normal value

### IRR (Internal Rate of Return)

**Calculation strategy:**
1. Try Newton-Raphson (fast, ~10ms)
2. Fall back to Brent's method (robust, ~50ms)
3. Last resort: Bisection (always converges, ~100ms)

**Convergence criteria:**
- NPV error < 1e-7
- Rate bounded: [-99.9%, 100,000%]
- Returns `null` for invalid inputs (all-positive/all-negative flows)

### TVPI (Total Value / Paid-In)

```
TVPI = (Current NAV + Total Distributions) / Total Called Capital
```

**Invariants (self-check):**
- `TVPI >= DPI` (always true if data correct)
- `DPI == 0` ⟺ no distributions (null semantics)
- `MOIC == TVPI` when paid-in equals called capital

---

## 🔍 Troubleshooting Quick Reference

### Problem: Metrics API returns 503

**Cause:** Engine failure (reserve/pacing/cohort)

**Fix:**
1. Check `_status.engines` to identify failing component
2. Review error logs for stack trace
3. Verify database connectivity
4. Check Redis/cache health

### Problem: Cache hit ratio < 50%

**Cause:** Excessive invalidations or low TTL

**Fix:**
1. Review invalidation frequency (should be < 10/hour/fund)
2. Check TTL (default: 300s)
3. Verify stampede lock is working (no duplicate recomputes)

### Problem: XIRR fails to converge

**Cause:** Pathological cashflows or invalid data

**Fix:**
1. Export flows and validate in Excel
2. Check for sign convention (need ≥1 positive, ≥1 negative)
3. Review for extreme values (>1000% or <-99%)
4. Check logs for "Cannot bracket root" warning

### Problem: Performance p95 > 500ms

**Cause:** Cache miss + expensive projections

**Fix:**
1. Enable `skipProjections=true` for fast loading
2. Warm cache on app startup (prefetch top funds)
3. Check database query performance (N+1 risk)
4. Review portfolio company count (>100 may need optimization)

---

## 📞 Escalation Contacts

**Production Issues:**
- On-call: #oncall-backend
- Metrics SME: @metrics-team

**Data Issues:**
- Finance team: #finance-ops
- Data integrity: @data-quality

**Performance:**
- Platform SRE: #sre-platform
- Database team: #db-support

---

## 📈 Monitoring & Alerts

**Key Metrics to Watch:**

- `metrics_calculation_duration_ms` (p50/p95/p99)
- `metrics_cache_hit_ratio` (target: >80%)
- `metrics_engine_outcome` (by engine + status)
- `metrics_api_errors` (rate per fund)

**Alert Thresholds:**

- p95 latency > 1000ms (warning)
- Cache hit ratio < 60% (warning)
- Error rate > 0.1% (critical)
- Engine failures > 5/min (page)

---

**Version:** 1.0
**Last Updated:** 2025-10-04
**Owner:** Metrics Team
