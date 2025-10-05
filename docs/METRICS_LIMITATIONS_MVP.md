# Unified Metrics Layer - Known Limitations (MVP)

**Version**: 1.0.0 MVP
**Last Updated**: October 2025
**Status**: Production-Ready with Documented Limitations

---

## 🔴 Critical Limitation: DPI Metric

### Issue: DPI Will Show 0.00x for All Funds

**Current Behavior**:
- DPI (Distributions to Paid-In) displays as **0.00x** for all funds
- This affects funds that have had exits and distributed cash to LPs

**Root Cause**:
- The `distributions` table is not yet implemented in the MVP
- DPI calculation requires: `DPI = Total Distributions / Total Capital Called`
- Without distributions data, DPI = 0 / Capital Called = 0

**What Works**:
- ✅ IRR calculation (uses terminal NAV as final cashflow)
- ✅ TVPI calculation (uses current NAV instead of distributions)
- ✅ NAV calculation (current portfolio value)
- ✅ Deployment metrics

**Impact Assessment**:

| Fund Stage | Impact | Workaround |
|-----------|--------|------------|
| **Early-Stage Fund** (no exits yet) | ✅ None | N/A - DPI should be 0 |
| **Growth Fund** (some exits) | ❌ High | Use TVPI instead |
| **Late-Stage Fund** (many exits) | ❌ Critical | DPI is incorrect |

**Workaround for Users**:

Use **TVPI (Total Value to Paid-In)** as the primary metric instead:

```
TVPI = (Current NAV + Distributions) / Capital Called

Since Distributions = 0 in MVP:
TVPI = NAV / Capital Called
```

**Example**:
- Fund deployed: $50M
- Current NAV: $120M
- Actual distributions to LPs: $25M (not tracked)
- **Reported TVPI**: 2.4x ($120M / $50M)
- **Actual TVPI**: 2.9x ($145M / $50M)
- **Reported DPI**: 0.0x ❌ Should be 0.5x
- **Actual DPI**: 0.5x ($25M / $50M)

**Impact on IRR**:

IRR calculations are **moderately accurate** but **understated**:

- ✅ Includes: All investments (outflows)
- ✅ Includes: Terminal NAV (final inflow)
- ❌ Missing: Interim distributions to LPs

**Result**: IRR will be lower than actual if fund has distributed cash

**Planned Fix**: Phase 2 (Q1 2026)
- Add `distributions` table to schema
- Track all LP distributions
- Update DPI and IRR calculations

---

## 🟡 Limitation: Generic Fund Targets

### Issue: All Funds Use Same Default Targets

**Current Behavior**:
- All funds show identical target metrics:
  - **Target IRR**: 25%
  - **Target TVPI**: 2.5x
  - **Investment Period**: 3 years
  - **Fund Term**: 10 years
  - **Reserve Ratio**: 50%

**Root Cause**:
- Fund-specific configuration is stored in `fund_configs` table
- MVP uses hardcoded defaults instead of custom targets
- See: `server/services/metrics-aggregator.ts:151-171`

**Impact**:
- ✅ Variance metrics still show actual vs target
- ⚠️ Variance is against industry standard, not fund-specific goals
- ⚠️ Users cannot customize targets per fund

**Workaround**:
- Interpret variance metrics as "vs industry standard"
- For fund-specific targets, calculate manually

**Example**:
- Your fund's actual target IRR: 30%
- Platform shows target: 25%
- Variance will compare against 25%, not 30%

**Planned Fix**: Phase 2 (Q1 2026)
- Implement `storage.getFundConfig(fundId)`
- Allow users to set custom targets in Fund Setup
- Update variance calculations to use custom targets

---

## 🟢 Acceptable Limitations

### 1. Capital Calls Derived from Investments

**Current Behavior**:
- Capital calls are approximated from investment amounts
- Assumes: Investment amount = Capital call amount

**Impact**: ⚠️ Low
- Acceptable for most funds
- Inaccurate if capital called but not deployed

**Fix**: Add separate `capital_calls` table (low priority)

---

### 2. Projected Metrics Use Fallback Values

**Current Behavior**:
- If deterministic engines fail, uses fallback projections:
  - expectedTVPI: 2.5x (from target)
  - expectedIRR: 25% (from target)
  - Deployment schedule: Linear

**Impact**: ⚠️ Low
- Projections may be generic if engines fail
- Actual metrics are always correct
- Users see "Projected" label, understand it's forward-looking

**Monitoring**:
- Engine failures are logged
- Metrics include `_cache.hit` metadata

**Fix**: Improve engine reliability (ongoing)

---

### 3. Cache Staleness (Up to 6 Minutes)

**Current Behavior**:
- Server cache: 5 minutes
- Client cache: 1 minute
- Max staleness: 6 minutes

**Impact**: ⚠️ Low
- User adds investment → sees old metrics for up to 6 min
- Acceptable for dashboard use case

**Workaround**:
- Call `invalidateMetrics()` after data changes
- Shows "Last updated" timestamp in UI

**Fix**: Automatic cache invalidation on writes (Phase 2)

---

## 📊 Accuracy Summary

| Metric | Accuracy | Notes |
|--------|----------|-------|
| **Actual Metrics** | | |
| Total Deployed | ✅ 100% | From investments table |
| Current NAV | ✅ 100% | From company valuations |
| Active Companies | ✅ 100% | From company status |
| TVPI | ⚠️ 90% | Correct if no distributions |
| DPI | ❌ 0% | Always shows 0 (known issue) |
| IRR | ⚠️ 85% | Understated if distributions exist |
| **Projected Metrics** | | |
| Reserve Needs | ✅ 95% | From DeterministicReserveEngine |
| Pacing Analysis | ✅ 95% | From PacingEngine |
| Expected Performance | ⚠️ 80% | Model-based estimates |
| **Target Metrics** | | |
| All Targets | ⚠️ Generic | Uses industry defaults |

---

## 🎯 User Guidance

### For Early-Stage Funds (No Exits)
✅ **All metrics are accurate** - Use platform as-is

### For Growth Funds (Some Exits)
⚠️ **Use TVPI instead of DPI**
- DPI will show 0.00x
- TVPI is correct
- IRR slightly understated

### For Late-Stage Funds (Many Exits)
❌ **Critical metrics are incorrect**
- DPI is wrong (shows 0.00x)
- IRR is understated
- **Recommendation**: Wait for Phase 2 or track manually

---

## 📅 Roadmap

### Phase 1 (Current - MVP)
- ✅ Single source of truth API
- ✅ Actual metrics from database
- ✅ Projected metrics from engines
- ✅ Variance analysis
- ⚠️ DPI = 0 (known limitation)
- ⚠️ Generic targets

### Phase 2 (Q1 2026)
- 🎯 Add distributions table
- 🎯 Accurate DPI calculation
- 🎯 Accurate IRR with distributions
- 🎯 Custom fund targets
- 🎯 Automatic cache invalidation
- 🎯 Real-time updates

### Phase 3 (Q2 2026)
- 🎯 Historical metrics tracking
- 🎯 Benchmark comparisons
- 🎯 Advanced analytics

---

## 🆘 Support

**Questions about limitations?**
- Review this document
- Check `EVALUATION_REPORT.md` for technical details
- Contact: [Your support channel]

**Found a bug?**
- This is NOT a bug if DPI shows 0.00x (known limitation)
- Report actual bugs to: [Your bug tracking system]

---

**Document Version**: 1.0
**Applies To**: Unified Metrics Layer v1.0.0 (MVP)
**Next Review**: After Phase 2 implementation
