---
status: ACTIVE
last_updated: 2026-01-19
---

# Foundation Hardening Plan Review: Fee Implementation Alignment Risk Assessment

**Status:** ANALYSIS COMPLETE
**Date:** 2025-12-16
**Reviewer:** Claude (Planning Mode)
**Referenced Documents:** FOUNDATION-HARDENING-PLAN.md

---

## Executive Summary

**YES - There are significant implementation divergences that could cause mismatches.**

The codebase contains **three parallel fee calculation systems** with different sophistication levels, different type enums, and different calculation contexts. The current FOUNDATION-HARDENING-PLAN.md focuses on test pass rates but does **not explicitly address implementation alignment risks**.

---

## Critical Finding: Parallel Fee Implementations

### Three Distinct Fee Calculation Systems

| System | Location | Sophistication | Basis Enum Values |
|--------|----------|----------------|-------------------|
| **fees.ts** | `client/src/lib/fees.ts` | Medium-High | 7 values (committed_capital, called_capital_period, gross_cumulative_called, net_cumulative_called, cumulative_invested, fair_market_value, unrealized_investments) |
| **fee-calculations.ts** | `client/src/lib/fee-calculations.ts` | High | 3 values (committed, called, fmv) |
| **fee-profile.ts** | `shared/schemas/fee-profile.ts` | Very High (Decimal.js) | 6 values (committed_capital, called_capital_cumulative, called_net_of_returns, invested, fmv, unrealized_cost) |

### Enum Mismatch Risk Matrix

```
fees.ts (7 values)        fee-calculations.ts (3)    fee-profile.ts (6)
-----------------         ----------------------      ------------------
committed_capital    <--> committed            <--> committed_capital
called_capital_period     [NO MATCH]                 [NO MATCH]
gross_cumulative_called   [NO MATCH]                 [NO MATCH]
net_cumulative_called     [NO MATCH]            <--> called_net_of_returns
cumulative_invested       [NO MATCH]            <--> invested
fair_market_value    <--> fmv                  <--> fmv
unrealized_investments    [NO MATCH]            <--> unrealized_cost
                          called                <--> called_capital_cumulative
```

**Risk:** A fee calculation using `called_capital_period` (from fees.ts) has no equivalent in fee-calculations.ts or fee-profile.ts. This could cause:
- Silent fallback to default basis
- Incorrect fee amounts
- Truth case failures that appear as "implementation bugs" but are actually type mismatches

---

## Two Separate Carried Interest Implementations

### Implementation 1: Simplified (fee-calculations.ts)
- Location: `client/src/lib/fee-calculations.ts:calculateCarriedInterest()`
- Type: American/European selector
- Features: Basic hurdle, catch-up percentages

### Implementation 2: Full Waterfall (waterfall-policy.ts)
- Location: `shared/schemas/waterfall-policy.ts:calculateAmericanWaterfall()`
- Type: Deal-by-deal with clawback
- Features: 4-tier distribution, clawback lookback, GP commitment from fees

**Risk:** Code using `calculateCarriedInterest()` may produce different results than code using `calculateAmericanWaterfall()` for the same fund parameters. This is NOT a bug - they model different things - but the hardening plan should clarify which is authoritative.

---

## Recycling Logic Duplication

| Location | Function | Cap Logic |
|----------|----------|-----------|
| fee-calculations.ts | `calculateFeeRecycling()` | Array-based, term + cap |
| fee-profile.ts | `calculateRecyclableFees()` | Context-based, single cap |

**Risk:** Different cap calculations could produce different recyclable amounts. The fund-math.ts integrates with fee-profile.ts, but UI components may use fee-calculations.ts.

---

## Admin Expenses Gap

- **Implemented:** `client/src/lib/fee-calculations.ts` (growth rate support)
- **NOT Implemented:** `shared/schemas/fee-profile.ts`

**Risk:** Server-side fee projections (if using shared schemas) will omit admin expenses that client-side projections include.

---

## Recommendations for Foundation Hardening

### 1. Add Fee Alignment Phase (Insert Before Phase 2)

**Phase 1.5: Fee Implementation Parity Audit**

- [ ] Create fee basis mapping table (authoritative enum translation)
- [ ] Add adapter layer tests verifying basis conversion
- [ ] Document which implementation is authoritative (recommendation: fee-profile.ts for precision)
- [ ] Add cross-implementation validation in truth cases

### 2. Strengthen Truth Case Coverage

Current truth case adapter (`tests/unit/truth-cases/fee-adapter.ts`) only maps:
- 'fmv' -> 'nav'
- Basic stepDown

**Missing coverage:**
- All 7 fee basis types
- Admin expenses
- Fee recycling with cap edge cases
- European vs American carry comparison

### 3. Add Integration Tests

```typescript
// Suggested test: Verify parallel implementations agree
describe('Fee Implementation Parity', () => {
  it('should produce same management fee for all basis types', () => {
    // Test that fees.ts, fee-calculations.ts, and fee-profile.ts
    // produce the same result for equivalent inputs
  });
});
```

### 4. Create Authoritative Type Source

Consolidate basis enums into shared/types/fee-basis.ts:

```typescript
// Single source of truth for fee basis types
export const FeeBasisTypes = {
  COMMITTED_CAPITAL: 'committed_capital',
  CALLED_CAPITAL_CUMULATIVE: 'called_capital_cumulative',
  // ... etc
} as const;

// Mapping tables for legacy compatibility
export const basisAliases = {
  'committed': 'committed_capital',
  'called': 'called_capital_cumulative',
  'fmv': 'fair_market_value',
  // ... etc
};
```

---

## Impact on Success Criteria

The current hardening plan success criteria:

> ALL Phoenix truth cases passing (waterfall, XIRR, fees, capital)

This criterion could pass even with implementation divergence if:
1. Truth cases only exercise one implementation
2. Basis type mismatches happen to be masked by default fallbacks
3. Different implementations aren't exercised by the same truth case

**Recommended Addition:**
> Fee implementation parity verified (cross-implementation regression tests pass)

---

## Answers to Original Question

**Q: Should there be an understanding of more robust or sophisticated implementations (Fees) that should be adopted?**

**A: Yes, unambiguously.**

1. **fee-profile.ts** (shared) is the most sophisticated - uses Decimal.js for precision, context-based calculations, and is designed for production use. It should be authoritative.

2. **fee-calculations.ts** (client) has the richest business logic (admin expenses, European waterfall, fee impact analysis) but uses JavaScript numbers. This should be migrated to use Decimal.js for calculations that matter.

3. **fees.ts** (client) is wizard-specific and deliberately simpler. It should remain as a UI preview tool, not authoritative calculation.

**Q: May result in errors via mismatches or otherwise?**

**A: Yes, current structure creates multiple mismatch vectors:**

| Vector | Severity | Manifestation |
|--------|----------|---------------|
| Basis type enum mismatch | HIGH | Wrong fee calculation, silent fallback |
| Carry implementation divergence | MEDIUM | Different GP distributions |
| Recycling cap logic difference | MEDIUM | Different available recycling |
| Admin expense omission | LOW | Server projections under-state fees |
| Precision drift (number vs Decimal) | LOW | Cumulative rounding errors |

---

## Recommended Action Items

### Immediate (Before Hardening Sprint)

1. **Document authoritative implementation** - Add to DECISIONS.md which fee implementation is canonical
2. **Create basis type mapping** - Explicit translation table between all three enum systems

### During Hardening Sprint

3. **Add parity tests** - Cross-implementation regression tests
4. **Extend truth case adapter** - Cover all basis types, not just committed/called/fmv

### Post-Hardening

5. **Consider consolidation** - Long-term goal of single fee calculation engine in shared/
6. **Decimal.js migration** - Upgrade fee-calculations.ts precision for carry calculations

---

## Files Referenced

- `/home/user/Updog_restore/FOUNDATION-HARDENING-PLAN.md`
- `/home/user/Updog_restore/client/src/lib/fees.ts`
- `/home/user/Updog_restore/client/src/lib/fee-calculations.ts`
- `/home/user/Updog_restore/client/src/lib/fees-wizard.ts`
- `/home/user/Updog_restore/shared/schemas/fee-profile.ts`
- `/home/user/Updog_restore/shared/schemas/waterfall-policy.ts`
- `/home/user/Updog_restore/shared/lib/fund-math.ts`
- `/home/user/Updog_restore/tests/unit/truth-cases/fee-adapter.ts`

---

**Author:** Claude (Planning Analysis)
**Last Updated:** 2025-12-16
