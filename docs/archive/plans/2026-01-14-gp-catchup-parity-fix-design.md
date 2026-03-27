---
status: HISTORICAL
last_updated: 2026-01-19
---

# GP Catch-Up Parity Formula Fix - Issue #256

**Date**: 2026-01-14 **Status**: Ready for Implementation **Priority**: HIGH -
Blocks Phoenix Phase 0 completion

## Problem Statement

The GP catch-up tier allocates ALL remaining proceeds instead of stopping at the
parity target, preventing the carry tier from receiving any distribution.

**Root Cause**: `shared/schemas/waterfall-policy.ts` lines 257-271

```typescript
// BUGGY CODE
const catchUpRate = tier.catchUpRate || new Decimal(1);
const allocation = Decimal.min(remaining, remaining.times(catchUpRate));
// With 100% catchUpRate: allocation = min(remaining, remaining * 1.0) = remaining
// GP gets EVERYTHING, carry tier gets NOTHING
```

## Industry-Standard Parity Formula

The GP catch-up mechanism is designed to bring the GP to a target percentage
(carry rate) of total profits distributed **after** preferred return is paid.
The parity formula:

```
GP_target = LP_preferred * (carry_rate / (1 - carry_rate))
```

**Example** (Scenario 04):

- Exit: $1.5M, Cost: $1M, 8% hurdle, 20% carry
- Preferred paid to LP: $80K (8% of $1M)
- GP catch-up target: $80K \* (0.20 / 0.80) = $20K
- After catch-up: GP has $20K, LP has $80K
- Parity check: $20K / ($80K + $20K) = 0.20 [CHECK]

## Corrected Implementation

Replace lines 257-271 in `shared/schemas/waterfall-policy.ts`:

```typescript
case 'gp_catch_up': {
  // 1. Get the carry rate from carry tier (default 20%)
  const carryTier = sortedTiers.find(t => t.tierType === 'carry');
  const carryRate = carryTier?.rate || new Decimal(0.20);

  // 2. Get catch-up rate (default 100%)
  const catchUpRate = tier.catchUpRate || new Decimal(1);

  // Safety: If catch-up rate is 0, skip this tier
  if (catchUpRate.eq(0)) break;

  // 3. Calculate GP catch-up target using parity formula
  // Target = (PreferredPaid * CarryRate) / (1 - CarryRate)
  const preferredPaid = breakdown
    .find(b => b.tier === 'preferred_return')?.lpAmount || new Decimal(0);

  const denominator = new Decimal(1).minus(carryRate);
  const targetCatchUp = denominator.eq(0)
    ? new Decimal(0) // Safety for 100% carry edge case
    : preferredPaid.times(carryRate).div(denominator);

  // 4. Calculate gross flow needed to hit target
  // If catchUpRate is 100%, we need exactly $Target
  // If catchUpRate is 50%, we need $Target / 0.5 (since half goes to LP)
  const grossFlowNeeded = targetCatchUp.div(catchUpRate);

  // 5. Allocate from remaining (capped at gross flow needed)
  const allocation = Decimal.min(remaining, grossFlowNeeded);

  const gpAllocation = allocation.times(catchUpRate);
  const lpAllocation = allocation.minus(gpAllocation);

  // 6. Update totals
  gpTotal = gpTotal.plus(gpAllocation);
  lpTotal = lpTotal.plus(lpAllocation);
  remaining = remaining.minus(allocation);

  if (allocation.gt(0)) {
    breakdown.push({
      tier: tier.tierType,
      amount: allocation,
      lpAmount: lpAllocation,
      gpAmount: gpAllocation,
    });
  }

  break;
}
```

## Truth Case Corrections

The truth cases JSON contains buggy expected values. Required corrections:

### Scenario 04 (Standard full waterfall)

- **Current (Wrong)**: LP=$1,080K, GP=$420K (GP gets all remaining)
- **Correct**: LP=$1,400K, GP=$100K
- **Breakdown**: ROC=$1M, Pref=$80K, Catch-up=$20K to GP, Carry=$320K/$80K

### Scenario 08 (Full 100% catch-up, smaller proceeds)

- **Current (Wrong)**: LP=$1,080K, GP=$120K (all remaining to catch-up)
- **Correct**: LP=$1,160K, GP=$40K
- **Breakdown**: ROC=$1M, Pref=$80K, Catch-up=$20K, Carry=$60K/$20K (remaining
  $80K at 80/20)

### Scenario 09 (50% partial catch-up)

- Needs Excel validation - catch-up splits 50/50 until GP reaches target

### Scenario 10 (Zero hurdle with catch-up)

- **Current (Wrong)**: LP=$1M, GP=$500K (all to catch-up)
- **Correct**: LP=$1,400K, GP=$100K (no preferred = no catch-up target = skip to
  carry)
- With zero hurdle, preferredPaid=0, so targetCatchUp=0, GP catch-up allocates
  nothing

### Scenario 11 (GP commit as LP)

- Needs recalculation with GP commitment factored in

### Scenario 15 (Large proceeds precision)

- **Current (Wrong)**: LP=$10.8M, GP=$89.2M
- **Correct**: LP=$82M, GP=$18M (approximate, needs Excel validation)
- GP catch-up target: $800K \* (0.20/0.80) = $200K

## Implementation Steps

1. [ ] Create branch `fix/gp-catchup-parity-256`
2. [ ] Update `shared/schemas/waterfall-policy.ts` lines 257-271
3. [ ] Calculate correct expected values for affected scenarios
4. [ ] Update `docs/waterfall.truth-cases.json` with corrected values
5. [ ] Run waterfall tests to verify all 15 scenarios pass
6. [ ] Run full test suite to check for regressions
7. [ ] Update CHANGELOG.md
8. [ ] Create PR with detailed explanation

## Verification Formula

After implementation, every catch-up scenario should satisfy:

```
GP_catchup / (LP_preferred + GP_catchup) = carry_rate
```

For 20% carry, this means GP catch-up should be exactly 25% of LP preferred.

## Edge Cases

1. **Zero hurdle**: preferredPaid=0, targetCatchUp=0, catch-up tier allocates
   nothing
2. **100% carry rate**: denominator=0, targetCatchUp=0 (degenerate case)
3. **Partial catch-up (50%)**: grossFlowNeeded doubles, LP gets half during
   catch-up phase
4. **Insufficient proceeds**: allocation capped at remaining, partial catch-up

## Risk Assessment

- **LOW**: Change is isolated to one case block in one function
- **MEDIUM**: Truth cases need careful Excel validation
- **MITIGATION**: Run existing tests first, then targeted waterfall tests

## Related

- Issue: #256
- PR: #255 (added 9 new scenarios, documented this bug)
- Files: `shared/schemas/waterfall-policy.ts`, `docs/waterfall.truth-cases.json`
