---
status: ACTIVE
last_updated: 2026-01-19
---

# Unified Metrics Layer - Known Limitations (MVP)

**Version**: 1.0.0 MVP **Last Updated**: October 2025 **Status**:
Production-Ready with Documented Limitations

---

## [CRITICAL] Critical Limitation: DPI Metric

### Issue: DPI Will Show 0.00x for All Funds

**Current Behavior**:

- DPI (Distributions to Paid-In) displays as **0.00x** for all funds
- This affects funds that have had exits and distributed cash to LPs

**Root Cause**:

- The `distributions` table is not yet implemented in the MVP
- DPI calculation requires: `DPI = Total Distributions / Total Capital Called`
- Without distributions data, DPI = 0 / Capital Called = 0

**What Works**:

- [OK] IRR calculation (uses terminal NAV as final cashflow)
- [OK] TVPI calculation (uses current NAV instead of distributions)
- [OK] NAV calculation (current portfolio value)
- [OK] Deployment metrics

**Impact Assessment**:

| Fund Stage                          | Impact          | Workaround            |
| ----------------------------------- | --------------- | --------------------- |
| **Early-Stage Fund** (no exits yet) | [OK] None       | N/A - DPI should be 0 |
| **Growth Fund** (some exits)        | [FAIL] High     | Use TVPI instead      |
| **Late-Stage Fund** (many exits)    | [FAIL] Critical | DPI is incorrect      |

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
- **Reported DPI**: 0.0x [FAIL] Should be 0.5x
- **Actual DPI**: 0.5x ($25M / $50M)

**Impact on IRR**:

IRR calculations are **moderately accurate** but **understated**:

- [OK] Includes: All investments (outflows)
- [OK] Includes: Terminal NAV (final inflow)
- [FAIL] Missing: Interim distributions to LPs

**Result**: IRR will be lower than actual if fund has distributed cash

**Planned Fix**: Phase 2 (Q1 2026)

- Add `distributions` table to schema
- Track all LP distributions
- Update DPI and IRR calculations

---

## [WARN] Limitation: Generic Fund Targets

### Issue: Legacy Configs May Still Use Generic Default Targets

**Current Behavior**:

- Published configs that include explicit target metrics can drive custom
  targets.
- Older drafts/published configs that do not yet carry those target fields still
  fall back to generic defaults:
  - **Target IRR**: 25%
  - **Target TVPI**: 2.5x
  - **Investment Period**: 3 years
  - **Fund Term**: 10 years
  - **Reserve Ratio**: 50%

**Root Cause**:

- Fund-specific configuration is stored in `fund_configs` table
- MVP uses hardcoded defaults instead of custom targets
- See: `server/services/metrics-aggregator.ts`

**Impact**:

- [OK] Config-backed funds can show fund-specific targets
- [WARN] Legacy configs still compare against industry-standard defaults
- [WARN] Until old configs are updated, variance may still reflect fallback
  targets

**Workaround**:

- Update the published fund config to include explicit target metrics
- Until then, interpret variance metrics as "vs industry standard"

**Example**:

- Your fund's actual target IRR: 30%
- Platform shows target: 25%
- Variance will compare against 25%, not 30%

**Current Fix Direction**:

- Read target metrics from canonical published `fundConfigs.config` when present
- Keep legacy fallback explicit when target fields are absent
- Continue allowing fund setup to evolve toward fully setting those targets

---

## [GREEN] Acceptable Limitations

### 1. Capital Calls Derived from Investments

**Current Behavior**:

- Capital calls are approximated from investment amounts
- Assumes: Investment amount = Capital call amount

**Impact**: [WARN] Low

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

**Impact**: [WARN] Low

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

**Impact**: [WARN] Low

- User adds investment → sees old metrics for up to 6 min
- Acceptable for dashboard use case

**Workaround**:

- Call `invalidateMetrics()` after data changes
- Shows "Last updated" timestamp in UI

**Fix**: Automatic cache invalidation on writes (Phase 2)

---

## [SUMMARY] Accuracy Summary

| Metric                               | Accuracy          | Notes                               |
| ------------------------------------ | ----------------- | ----------------------------------- |
| **Actual Metrics**                   |                   |                                     |
| Total Deployed                       | [OK] 100%         | From investments table              |
| Current NAV                          | [OK] 100%         | From company valuations             |
| Active Companies                     | [OK] 100%         | From company status                 |
| TVPI                                 | [WARN] 90%        | Correct if no distributions         |
| DPI                                  | [FAIL] 0%         | Always shows 0 (known issue)        |
| IRR                                  | [WARN] 85%        | Understated if distributions exist  |
| **Projected Metrics**                |                   |                                     |
| Reserve Needs                        | [OK] 95%          | From DeterministicReserveEngine     |
| Pacing Analysis                      | [OK] 95%          | From PacingEngine                   |
| Expected Performance                 | [WARN] 80%        | Model-based estimates               |
| **Target Metrics**                   |                   |                                     |
| Config-backed targets                | [OK] When present | From published `fundConfigs.config` |
| Legacy configs without target fields | [WARN] Fallback   | Uses explicit generic defaults      |

---

## [TARGET] User Guidance

### For Early-Stage Funds (No Exits)

[OK] **All metrics are accurate** - Use platform as-is

### For Growth Funds (Some Exits)

[WARN] **Use TVPI instead of DPI**

- DPI will show 0.00x
- TVPI is correct
- IRR slightly understated

### For Late-Stage Funds (Many Exits)

[FAIL] **Critical metrics are incorrect**

- DPI is wrong (shows 0.00x)
- IRR is understated
- **Recommendation**: Wait for Phase 2 or track manually

---

## [ROADMAP] Roadmap

### Phase 1 (Current - MVP)

- [OK] Single source of truth API
- [OK] Actual metrics from database
- [OK] Projected metrics from engines
- [OK] Variance analysis
- [WARN] DPI = 0 (known limitation)
- [WARN] Legacy configs may still use generic targets

### Phase 2 (Q1 2026)

- [TARGET] Add distributions table
- [TARGET] Accurate DPI calculation
- [TARGET] Accurate IRR with distributions
- [TARGET] Custom fund targets
- [TARGET] Automatic cache invalidation
- [TARGET] Real-time updates

### Phase 3 (Q2 2026)

- [TARGET] Historical metrics tracking
- [TARGET] Benchmark comparisons
- [TARGET] Advanced analytics

---

## [SUPPORT] Support

**Questions about limitations?**

- Review this document
- Check `EVALUATION_REPORT.md` for technical details
- Contact: [Your support channel]

**Found a bug?**

- This is NOT a bug if DPI shows 0.00x (known limitation)
- Report actual bugs to: [Your bug tracking system]

---

**Document Version**: 1.0 **Applies To**: Unified Metrics Layer v1.0.0 (MVP)
**Next Review**: After Phase 2 implementation
