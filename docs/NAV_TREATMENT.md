# NAV Treatment at Fund Termination

## End-of-Term Handling

This document clarifies how the Unified Metrics Layer handles **residual Net Asset Value (NAV)** when a fund reaches its term end date.

### Current Implementation

**Approach**: **Extended Horizon (No Forced Liquidation)**

- NAV continues to be tracked after fund term end date
- No automatic FMV (Fair Market Value) liquidation at term maturity
- Future exits beyond term are included in TVPI/MOIC calculations
- This matches modeling tools that allow "extended fund horizons"

### Rationale

This approach reflects real-world VC fund operations:

1. **Extensions Are Common**: Most VC funds negotiate 1-3 year extensions
2. **Partial Realizations**: Funds often realize portfolio piecemeal beyond initial term
3. **LP Alignment**: LPs expect to see full portfolio realization, not artificial term cutoffs
4. **TVPI Accuracy**: Including post-term exits provides true total value to paid-in capital

### Alternative Approach (FMV Liquidation)

Some modeling tools (e.g., Tactyc "liquidate at term" mode) use:

```
At term end date:
- Residual NAV → Realized at current FMV
- No further exits recorded
- TVPI frozen at term date
```

**We do NOT use this approach currently.**

### Impact on Metrics

| Metric | Treatment |
|--------|-----------|
| **NAV** | Continues tracking post-term |
| **TVPI** | Includes post-term exits |
| **MOIC** | Includes post-term exits |
| **DPI** | Includes post-term distributions |
| **IRR** | Cash flow dates can extend beyond term |

### Example

```
Fund Term: 10 years (2014-2024)
Portfolio Company XYZ exit: 2026 (2 years after term)

Extended Horizon (Current):
- Exit included in TVPI calculation
- IRR calculated using actual 2026 exit date
- NAV reduced by exit value in 2026

FMV Liquidation (Alternative):
- NAV marked to FMV in 2024 (term end)
- No 2026 exit event recorded
- TVPI frozen at 2024 value
```

### Configuration

This behavior is **fixed** in the current implementation. To implement FMV liquidation:

1. Add `liquidateAtTerm` flag to fund configuration
2. Modify `ProjectedMetricsCalculator` to cap exit dates at term end
3. Add FMV realization event at term end date
4. Update XIRR calculation to exclude post-term cash flows

### Parity with External Tools

| Tool | Default Behavior | Our Behavior |
|------|------------------|--------------|
| **Tactyc** | Configurable (liquidate vs extend) | Extended only |
| **Chronograph** | Extended horizon | ✅ Match |
| **eFront** | Extended horizon | ✅ Match |
| **Excel Models** | Varies | Partial match |

### Migration Path

If you need to switch to FMV liquidation:

```typescript
// Add to fund configuration schema
interface FundConfig {
  // ... existing fields
  terminationPolicy: {
    liquidateAtTerm: boolean;
    fmvMultiplier?: number; // Default: 1.0 (book value)
  };
}
```

---

**Last Updated**: 2025-10-04
**Applies To**: Unified Metrics Layer v2+
**Related**: `METRICS_SCHEMA_VERSION = 2` in `metrics-aggregator.ts`
