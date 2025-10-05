# Unified Metrics Layer - Operator Runbook

**Target Audience**: Platform operators and site reliability engineers
**Last Updated**: 2025-10-04
**Version**: 1.0

---

## Page 1: Operations & Monitoring

### When Metrics Look Wrong - Troubleshooting Checklist

**Follow this decision tree when metrics appear incorrect:**

1. **Check `_status` field in response**
   ```bash
   curl http://localhost:5000/api/funds/1/metrics | jq '._status'
   ```
   - `quality: "complete"` → All engines succeeded
   - `quality: "partial"` → Some engines failed (check `warnings`)
   - `quality: "fallback"` → Critical failure, using defaults

2. **Inspect engine breakdown**
   ```bash
   curl http://localhost:5000/api/funds/1/metrics | jq '._status.engines'
   ```
   - `actual: "failed"` → Database query issue (check DB connectivity)
   - `projected: "failed"` → Calculation engine error (check logs)
   - `projected: "skipped"` → Performance optimization active (expected)
   - `target: "failed"` → Config missing (check fund_configs table)
   - `variance: "failed"` → Dependent engine failed

3. **Review warnings array**
   ```bash
   curl http://localhost:5000/api/funds/1/metrics | jq '._status.warnings[]'
   ```
   - Look for: "XIRR not converging", "Insufficient data", "N+1 query detected"

4. **Verify data freshness**
   ```bash
   curl http://localhost:5000/api/funds/1/metrics | jq '.lastUpdated, ._cache.hit'
   ```
   - If `_cache.hit: true` and data is stale → Invalidate cache
   - If `_cache.staleWhileRevalidate: true` → Rebuild in progress

### Cache Invalidation - Safe Operations

**When to invalidate**:
- After creating/updating investments
- After valuation updates
- After fund configuration changes
- When users report stale data

**How to invalidate (authenticated)**:
```bash
# Invalidate specific fund
curl -X POST http://localhost:5000/api/funds/1/metrics/invalidate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"

# Expected: HTTP 204 No Content
```

**Rate limits**: 6 requests per minute per IP (prevents DoS)

**Clear all caches (emergency only)**:
```bash
# Not implemented - use Redis CLI
redis-cli KEYS "fund:*:unified-metrics:v1" | xargs redis-cli DEL
```

### Understanding `_status` Field

**Complete Status Example**:
```json
{
  "_status": {
    "quality": "complete",
    "engines": {
      "actual": "success",
      "projected": "success",
      "target": "success",
      "variance": "success"
    },
    "computeTimeMs": 145
  }
}
```

**Partial Status Example (Projections skipped)**:
```json
{
  "_status": {
    "quality": "partial",
    "engines": {
      "actual": "success",
      "projected": "skipped",  // ← skipProjections=true used
      "target": "success",
      "variance": "success"
    },
    "warnings": ["Projections skipped for performance"],
    "computeTimeMs": 68
  }
}
```

**What "Partial" Means**:
- Actual metrics: ✅ Reliable
- Target metrics: ✅ Reliable
- Projected metrics: ⚠️ May be defaults or missing
- Variance: ✅ Calculated (but variance against projections may be inaccurate)
- **Impact**: Dashboard shows actual performance, but forecasts unreliable

### Performance Monitoring - Key Metrics

**Target SLAs**:
- **p95 latency**: < 500ms (100 companies)
- **Cache hit ratio**: > 80%
- **Cache speedup**: 3-5x faster than miss
- **Concurrent requests**: < 2s for 10 parallel requests

**Monitor with performance tests**:
```bash
npm test -- metrics-performance.test.ts
```

**Check current latency**:
```bash
# With timing
time curl http://localhost:5000/api/funds/1/metrics?skipProjections=true

# Extract compute time from response
curl http://localhost:5000/api/funds/1/metrics | jq '._status.computeTimeMs'
```

**Performance degradation indicators**:
- ⚠️ `computeTimeMs > 500ms` → Check for N+1 queries, review engine performance
- ⚠️ Cache hit ratio < 50% → Increase TTL or investigate cache invalidation frequency
- ⚠️ `skipProjections=false` taking > 1000ms → Projection engines too slow

**Quick wins**:
- Use `skipProjections=true` for dashboard initial load (68ms vs 145ms)
- Increase cache TTL from 300s to 600s (if data staleness acceptable)
- Enable stampede prevention (already active in MetricsAggregator)

---

## Page 2: Validation & Troubleshooting

### Export Test Vectors to Excel (XIRR Validation)

**Step 1: Extract cashflows from database**
```bash
# Get investments (negative cashflows)
psql $DATABASE_URL -c "
  SELECT investment_date as date, -initial_investment as amount
  FROM portfolio_companies
  WHERE fund_id = 1
  ORDER BY investment_date;
" > cashflows.csv

# Get current NAV (terminal value)
curl http://localhost:5000/api/funds/1/metrics | jq -r '.actual.currentNAV'
```

**Step 2: Compare with Excel XIRR**
1. Import `cashflows.csv` to Excel
2. Add row: `=TODAY()` and NAV value
3. Calculate: `=XIRR(amounts, dates)`
4. Compare with API: `curl ... | jq '.actual.irr'`
5. **Acceptable variance**: < 0.01% (0.0001)

**Standalone validation script**:
```bash
npx tsx scripts/validate-xirr.ts
```

### Common Failure Modes & Resolutions

#### 1. XIRR Not Converging (Negative IRR)

**Symptom**: `irr: 0` in response, warning: "XIRR not converging"

**Root cause**: Newton-Raphson algorithm fails when:
- IRR < -99% (total loss)
- IRR > 1000% (unrealistic)
- Insufficient cashflows (< 2)

**Resolution**:
```bash
# Check cashflow count
curl http://localhost:5000/api/funds/1/metrics | jq '.actual.totalCompanies'

# If totalCompanies < 2, this is expected behavior
# Algorithm returns 0 when convergence fails (see actual-metrics-calculator.ts:206)
```

**Prevention**: Display "N/A" in UI when `irr === 0` and `totalCompanies < 2`

#### 2. DPI Showing N/A (Expected for Early Funds)

**Symptom**: `dpi: null` in response

**Root cause**: Intentional design - no distributions recorded yet

**Resolution**: **No action needed** - this is correct behavior
```bash
# Verify distributions exist
curl http://localhost:5000/api/funds/1/metrics | jq '.actual.totalDistributions'

# If totalDistributions === 0, then dpi: null is correct
```

**Why null, not 0.00x?**
- `null` semantics = "N/A" (data not yet available)
- `0.00x` would be misleading (implies distributions occurred with zero value)
- See: `shared/types/metrics.ts:67` and `actual-metrics-calculator.ts:68`

#### 3. Slow Response Times (N+1 Queries)

**Symptom**: `computeTimeMs > 500ms`, p95 latency high

**Root cause**: Database N+1 query anti-pattern

**Diagnosis**:
```bash
# Enable query logging
export DEBUG=drizzle:query

# Check parallel fetches in ActualMetricsCalculator
# Should use Promise.all() for: funds, companies, investments, calls, distributions
```

**Resolution**:
- Verify `ActualMetricsCalculator.calculate()` uses `Promise.all()` (line 40)
- Check no loops with await inside (common N+1 pattern)
- Add database indexes on `fund_id` columns

#### 4. Stale Data After Updates

**Symptom**: Dashboard shows old values after investment creation

**Root cause**: Cache not invalidated

**Resolution**:
```bash
# Backend invalidation (preferred)
curl -X POST http://localhost:5000/api/funds/1/metrics/invalidate \
  -H "Authorization: Bearer $TOKEN"

# Frontend invalidation (client-side)
# Call useInvalidateMetrics() hook after mutations
# See: client/src/hooks/useFundMetrics.ts:154-199
```

**Prevention**: Always call `invalidateMetrics()` after:
- Creating investments
- Updating valuations
- Modifying fund config
- Recording distributions

### Emergency Procedures

#### Clear All Caches (Last Resort)

**When**: Widespread data corruption, cache poisoning suspected

**Steps**:
```bash
# 1. Identify Redis instance
echo $REDIS_URL

# 2. Connect to Redis
redis-cli -u $REDIS_URL

# 3. Find all metrics caches
KEYS "fund:*:unified-metrics:v1"

# 4. Delete all (DESTRUCTIVE)
KEYS "fund:*:unified-metrics:v1" | xargs DEL

# 5. Verify
KEYS "fund:*:unified-metrics:v1"  # Should return (empty array)
```

**Impact**: All funds will experience cache miss on next request (slower but fresh data)

#### Force Recompute (skipCache)

**When**: Single fund has incorrect cached data

**Steps**:
```bash
# Force fresh calculation (bypasses cache)
curl "http://localhost:5000/api/funds/1/metrics?skipCache=true"

# This will also update the cache with corrected values
```

**Note**: `skipCache` is a query parameter, not authenticated by default (consider adding auth)

#### Rollback if Needed

**When**: Metrics layer causing production incidents

**Steps**:
```bash
# 1. Identify deployment
git log --oneline -10

# 2. Revert to previous version
git revert <commit-hash>

# 3. Redeploy
npm run build
pm2 restart all

# 4. Verify rollback
curl http://localhost:5000/api/funds/1/metrics | jq '._status'
```

**Alternative**: Feature flag (if implemented)
```bash
# Disable unified metrics layer
export FEATURE_UNIFIED_METRICS=false
pm2 restart all
```

---

## Quick Reference

| Issue | Check | Fix |
|-------|-------|-----|
| Wrong values | `._status.quality` | Invalidate cache |
| DPI showing null | `totalDistributions` | Expected for early funds |
| Slow response | `computeTimeMs`, N+1 queries | Use `skipProjections=true` |
| Stale data | `lastUpdated`, `_cache.hit` | POST to `/invalidate` |
| XIRR = 0 | `totalCompanies` | Display "N/A" if < 2 companies |
| Cache stampede | Concurrent requests | Built-in lock (no action) |

**Rate Limits**: 6 invalidations/min per IP
**Cache TTL**: 300s (5 minutes)
**Stampede Lock**: 60s TTL
**Test Command**: `npm test -- metrics-performance.test.ts`
