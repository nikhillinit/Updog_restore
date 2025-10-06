# Metrics & Meanings: AI Agent Evaluation

## Fund Performance Metrics

### Core Metrics (Tactyc-aligned)

**IRR (Internal Rate of Return)**
- Annualized return accounting for cash flow timing
- Computed from quarterly XIRR using Actual/365 day-count convention
- Sign convention: LP view (investments negative, distributions positive)
- Formula: Quarterly XIRR → annualized via `(1 + quarterly)^4 - 1`

**TVPI (Total Value to Paid-In)**
- `(DPI + RVPI)` = Total value (realized + residual) / invested capital
- Invariant: `TVPI ≥ DPI` (always true for mark-to-market NAV)
- Unitless multiple (2.5x TVPI = $2.50 returned per $1 invested)

**DPI (Distributions to Paid-In)**
- Cash returned to LPs / total invested capital
- Realized returns only (distributions, not paper gains)

**NAV (Net Asset Value)**
- Current portfolio value (mark-to-market)
- `NAV = unrealized value + cash - fees`
- Always ≥ 0 (negative NAV is invalid)

### Reserve-Specific Metrics

**Exit MOIC on Planned Reserves**
- Industry-standard metric for follow-on investment quality
- Expected return (MOIC) on next dollar of follow-on capital
- Used by `DeterministicReserveEngine` for ranking investments
- Formula: `(exit value / (initial + planned reserves)) * graduation probability`

**7-Flavor MOIC Vocabulary**
1. **Current MOIC**: Current valuation / invested capital
2. **Exit MOIC**: Expected exit valuation / total capital (initial + reserves)
3. **Initial MOIC**: Calculated on initial investment only
4. **Follow-on MOIC**: Incremental return on follow-on rounds
5. **Blended MOIC**: Weighted average across all rounds
6. **Probability-weighted MOIC**: Adjusted for graduation likelihood
7. **Net MOIC**: After fees and carry

### Construction vs Current

**Construction Scenario**
- Pro-forma portfolio based on planned investments
- Includes uncommitted capital, planned follow-ons
- Used for forward-looking optimization

**Current Scenario**
- Actual portfolio as it stands today
- Only committed/deployed capital
- Baseline for measuring Construction improvements

## AI Evaluation Metrics

**irrDelta**: `Construction IRR - Current IRR`
**tvpiDelta**: `Construction TVPI - Current TVPI`
**exitMoicOnPlannedReserves**: From `DeterministicReserveEngine.calculateOptimalReserveAllocation()`

## Determinism Guarantees

- **Fixed Decimal precision**: 28 digits, ROUND_HALF_UP mode
- **No ambient Date.now()** or `Math.random()` in core evaluation paths
- **Excel parity tolerance**: `|Δ IRR| ≤ 1e-6`, `|Δ TVPI| ≤ 1e-6`
- **Prohibited in `ai/**` and `core/reserves/**`**: Ambient `Number` arithmetic, `Math.*` functions
- **Required**: Use `Decimal.js` (or equivalent) for all financial math

## Implementation Notes

### Decimal.js Configuration
```typescript
import Decimal from 'decimal.js';

// Standard configuration for all financial math
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -7,
  toExpPos: 21
});
```

### IRR Calculation
```typescript
// Quarterly XIRR → Annualized IRR
const quarterlyRate = xirr(cashFlows, dates);
const annualizedIRR = new Decimal(1).plus(quarterlyRate).pow(4).minus(1);
```

### TVPI Calculation
```typescript
// Total Value to Paid-In
const tvpi = (distributions + currentNAV) / capitalCalled;
// Invariant check
assert(tvpi >= dpi, 'TVPI must be >= DPI');
```

## References

- [Evaluator Metrics ADR](adr/003-evaluator-metrics.md) - Detailed rationale for metric selection
- [Determinism ADR](adr/002-deterministic-computation.md) - Why we enforce deterministic math
- [Observability Metrics](observability/ai-metrics.md) - Prometheus metrics for monitoring
