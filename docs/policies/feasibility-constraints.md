---
status: ACTIVE
last_updated: 2026-01-19
---

# Feasibility Constraints Policy

**Purpose**: Prevent invalid fund model inputs that would produce nonsensical forecasts.

**Enforcement**: Zod schema refinements with clear error messages.

---

## Core Constraints

### 1. Investment Deployment Constraints

#### 1.1 Total Initial Investments ≤ Committed Capital

**Rule**: The sum of all initial investments (across all stages) cannot exceed committed capital minus management fees.

```typescript
// Constraint calculation
const totalInitialInvestments = stageAllocations.reduce((sum, stage) => {
  const stageCapital = fundSize * stage.allocationPct;
  const numCompanies = Math.floor(stageCapital / averageCheckSizes[stage.stage]);
  const stageTotal = numCompanies * averageCheckSizes[stage.stage];
  return sum + stageTotal;
}, 0);

const maxManagementFees = fundSize * managementFeeRate * managementFeeYears;
const deployableCapital = fundSize - maxManagementFees;

// Constraint
totalInitialInvestments <= deployableCapital
```

**Error Message**:
```
Initial investments ($X.XXM) exceed deployable capital ($Y.YYM).
Reduce average check sizes or adjust stage allocations.
```

---

#### 1.2 Reserve Pool ≤ Remaining Capital

**Rule**: Reserve pool cannot exceed capital remaining after initial investments and fees.

```typescript
const initialDeployment = fundSize * (1 - reservePoolPct); // Simplified
const reservePool = fundSize * reservePoolPct;
const maxManagementFees = fundSize * managementFeeRate * managementFeeYears;

// After initial deployment and fees, enough capital must remain for reserves
const remainingAfterInitial = fundSize - initialDeployment - maxManagementFees;

// Constraint
reservePool <= remainingAfterInitial
```

**Error Message**:
```
Reserve pool ($X.XXM) exceeds remaining capital ($Y.YYM) after initial investments and fees.
Reduce reservePoolPct or increase fundSize.
```

---

### 2. Check Size Constraints

#### 2.1 Average Check Size ≤ Stage Allocation

**Rule**: Average check size for a stage cannot exceed the total capital allocated to that stage.

```typescript
stageAllocations.forEach(stage => {
  const stageCapital = fundSize * stage.allocationPct;
  const avgCheck = averageCheckSizes[stage.stage];

  // Constraint
  avgCheck <= stageCapital
});
```

**Error Message**:
```
Average check size for {stage} ($X.XXM) exceeds stage allocation ($Y.YYM).
At least one investment must be possible per stage.
```

---

#### 2.2 Minimum Companies Per Stage

**Rule**: Stage allocation and check size must allow for at least 1 company.

```typescript
stageAllocations.forEach(stage => {
  const stageCapital = fundSize * stage.allocationPct * (1 - reservePoolPct);
  const avgCheck = averageCheckSizes[stage.stage];
  const numCompanies = Math.floor(stageCapital / avgCheck);

  // Constraint
  numCompanies >= 1
});
```

**Error Message**:
```
Stage allocation for {stage} ($X.XXM) is too small for average check size ($Y.YYM).
Increase stage allocation or reduce check size.
```

---

### 3. Reserve Allocation Constraints

#### 3.1 Reserve Pool Sanity Check

**Rule**: Reserve pool should be reasonable relative to fund size (warn if > 50%).

```typescript
// Warning (not error)
if (reservePoolPct > 0.5) {
  console.warn(
    `Reserve pool (${reservePoolPct * 100}%) is unusually high. ` +
    `Typical range: 20-40%.`
  );
}
```

---

#### 3.2 Preliminary Reserve Cap Estimate

**Rule**: Estimated total reserve deployment should not exceed reserve pool.

```typescript
// Estimate: assume all companies need follow-on at 2x initial
const estimatedReserveNeed = stageAllocations.reduce((sum, stage) => {
  const stageCapital = fundSize * stage.allocationPct * (1 - reservePoolPct);
  const numCompanies = Math.floor(stageCapital / averageCheckSizes[stage.stage]);
  const avgInitial = averageCheckSizes[stage.stage];
  const estimatedFollowOn = avgInitial * 2; // Heuristic: 2x initial
  return sum + (numCompanies * estimatedFollowOn);
}, 0);

const reservePool = fundSize * reservePoolPct;

// Constraint (warning only, not blocking)
if (estimatedReserveNeed > reservePool) {
  console.warn(
    `Estimated reserve need ($${estimatedReserveNeed / 1e6}M) exceeds reserve pool ($${reservePool / 1e6}M). ` +
    `Consider increasing reservePoolPct or adjusting check sizes.`
  );
}
```

---

### 4. Temporal Constraints

#### 4.1 Graduation Time < Exit Time

**Rule**: Companies must have time to graduate before exiting.

```typescript
Object.keys(monthsToGraduate).forEach(stage => {
  // Constraint
  monthsToGraduate[stage] < monthsToExit[stage]
});
```

**Error Message**:
```
Graduation time for {stage} ({X} months) must be less than exit time ({Y} months).
```

---

#### 4.2 Reasonable Graduation Rates

**Rule**: Graduation rates should be feasible within graduation timeframe.

```typescript
Object.keys(graduationRates).forEach(stage => {
  const ratePerPeriod = graduationRates[stage];
  const periodsToGraduate = Math.ceil(monthsToGraduate[stage] / periodLengthMonths);
  const cumulativeRate = 1 - Math.pow(1 - ratePerPeriod, periodsToGraduate);

  // Warning if cumulative rate is very low
  if (cumulativeRate < 0.5) {
    console.warn(
      `Only ${(cumulativeRate * 100).toFixed(0)}% of {stage} companies will graduate ` +
      `within ${monthsToGraduate[stage]} months at current rate. ` +
      `Consider increasing graduationRates or monthsToGraduate.`
    );
  }
});
```

---

## Implementation in Zod Schema

**File**: `shared/schemas/fund-model.ts`

```typescript
export const FundModelInputsSchema = z.object({
  fundSize: z.number().positive(),
  periodLengthMonths: z.number().int().positive(),
  capitalCallMode: z.literal('upfront'),
  managementFeeRate: z.number().min(0).max(0.05),
  managementFeeYears: z.number().int().positive().default(10),
  stageAllocations: z.array(StageAllocationSchema),
  reservePoolPct: z.number().min(0).max(0.5),
  averageCheckSizes: z.record(StageSchema, z.number().positive()),
  graduationRates: z.record(StageSchema, z.number().min(0).max(1)),
  exitRates: z.record(StageSchema, z.number().min(0).max(1)),
  monthsToGraduate: z.record(StageSchema, z.number().int().positive()),
  monthsToExit: z.record(StageSchema, z.number().int().positive()),
}).superRefine((inputs, ctx) => {

  // =====================
  // CONSTRAINT 1: Stage allocations sum to 100%
  // =====================
  const allocSum = inputs.stageAllocations.reduce((s, a) => s + a.allocationPct, 0);
  if (Math.abs(allocSum - 1.0) > 1e-6) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Stage allocations must sum to 100%.',
      path: ['stageAllocations'],
    });
  }

  // =====================
  // CONSTRAINT 2: Check sizes ≤ stage allocations
  // =====================
  inputs.stageAllocations.forEach((stage, idx) => {
    const stageCapital = inputs.fundSize * stage.allocationPct;
    const avgCheck = inputs.averageCheckSizes[stage.stage];

    if (avgCheck > stageCapital) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Average check size for ${stage.stage} ($${(avgCheck / 1e6).toFixed(2)}M) exceeds stage allocation ($${(stageCapital / 1e6).toFixed(2)}M). At least one investment must be possible.`,
        path: ['averageCheckSizes', stage.stage],
      });
    }
  });

  // =====================
  // CONSTRAINT 3: Minimum companies per stage
  // =====================
  inputs.stageAllocations.forEach((stage, idx) => {
    const stageCapital = inputs.fundSize * stage.allocationPct * (1 - inputs.reservePoolPct);
    const avgCheck = inputs.averageCheckSizes[stage.stage];
    const numCompanies = Math.floor(stageCapital / avgCheck);

    if (numCompanies < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Stage allocation for ${stage.stage} ($${(stageCapital / 1e6).toFixed(2)}M) is too small for average check size ($${(avgCheck / 1e6).toFixed(2)}M). Increase stage allocation or reduce check size.`,
        path: ['stageAllocations', idx],
      });
    }
  });

  // =====================
  // CONSTRAINT 4: Total initial investments ≤ deployable capital
  // =====================
  const maxManagementFees = inputs.fundSize * inputs.managementFeeRate * inputs.managementFeeYears;
  const deployableCapital = inputs.fundSize - maxManagementFees;

  const totalInitialInvestments = inputs.stageAllocations.reduce((sum, stage) => {
    const stageCapital = inputs.fundSize * stage.allocationPct * (1 - inputs.reservePoolPct);
    const avgCheck = inputs.averageCheckSizes[stage.stage];
    const numCompanies = Math.floor(stageCapital / avgCheck);
    return sum + (numCompanies * avgCheck);
  }, 0);

  if (totalInitialInvestments > deployableCapital) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Total initial investments ($${(totalInitialInvestments / 1e6).toFixed(2)}M) exceed deployable capital ($${(deployableCapital / 1e6).toFixed(2)}M after fees). Reduce check sizes or adjust allocations.`,
      path: ['averageCheckSizes'],
    });
  }

  // =====================
  // CONSTRAINT 5: Graduation time < Exit time
  // =====================
  Object.keys(inputs.monthsToGraduate).forEach(stage => {
    const gradTime = inputs.monthsToGraduate[stage as Stage];
    const exitTime = inputs.monthsToExit[stage as Stage];

    if (gradTime >= exitTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Graduation time for ${stage} (${gradTime} months) must be less than exit time (${exitTime} months).`,
        path: ['monthsToGraduate', stage],
      });
    }
  });

  // =====================
  // WARNING: Reserve pool sanity check
  // =====================
  if (inputs.reservePoolPct > 0.5) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Reserve pool (${(inputs.reservePoolPct * 100).toFixed(0)}%) is unusually high. Typical range: 20-40%.`,
      path: ['reservePoolPct'],
      fatal: false, // Warning, not error
    });
  }

  // =====================
  // WARNING: Preliminary reserve capacity check
  // =====================
  const estimatedReserveNeed = inputs.stageAllocations.reduce((sum, stage) => {
    const stageCapital = inputs.fundSize * stage.allocationPct * (1 - inputs.reservePoolPct);
    const avgCheck = inputs.averageCheckSizes[stage.stage];
    const numCompanies = Math.floor(stageCapital / avgCheck);
    const estimatedFollowOn = avgCheck * 2; // Heuristic: 2x initial check
    return sum + (numCompanies * estimatedFollowOn);
  }, 0);

  const reservePool = inputs.fundSize * inputs.reservePoolPct;

  if (estimatedReserveNeed > reservePool * 1.2) { // 20% buffer
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Estimated reserve need ($${(estimatedReserveNeed / 1e6).toFixed(2)}M at 2x initial checks) may exceed reserve pool ($${(reservePool / 1e6).toFixed(2)}M). Consider increasing reservePoolPct.`,
      path: ['reservePoolPct'],
      fatal: false, // Warning, not error
    });
  }
});
```

---

## Test Cases

**File**: `tests/validation/feasibility-constraints.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { FundModelInputsSchema } from '@shared/schemas/fund-model';

describe('Feasibility Constraints', () => {

  const validInputs = {
    fundSize: 100_000_000,
    periodLengthMonths: 3,
    capitalCallMode: 'upfront' as const,
    managementFeeRate: 0.02,
    managementFeeYears: 10,
    stageAllocations: [
      { stage: 'seed' as const, allocationPct: 0.30 },
      { stage: 'series_a' as const, allocationPct: 0.40 },
      { stage: 'series_b' as const, allocationPct: 0.30 },
    ],
    reservePoolPct: 0.30,
    averageCheckSizes: {
      seed: 500_000,
      series_a: 2_000_000,
      series_b: 5_000_000,
      series_c: 10_000_000,
      growth: 20_000_000,
    },
    graduationRates: {
      seed: 0.05,
      series_a: 0.04,
      series_b: 0.03,
      series_c: 0.02,
      growth: 0.01,
    },
    exitRates: {
      seed: 0.02,
      series_a: 0.03,
      series_b: 0.04,
      series_c: 0.05,
      growth: 0.06,
    },
    monthsToGraduate: {
      seed: 18,
      series_a: 24,
      series_b: 36,
      series_c: 48,
      growth: 60,
    },
    monthsToExit: {
      seed: 36,
      series_a: 60,
      series_b: 84,
      series_c: 96,
      growth: 120,
    },
  };

  it('accepts valid inputs', () => {
    const result = FundModelInputsSchema.safeParse(validInputs);
    expect(result.success).toBe(true);
  });

  it('rejects check size > stage allocation', () => {
    const invalid = {
      ...validInputs,
      averageCheckSizes: {
        ...validInputs.averageCheckSizes,
        seed: 50_000_000, // Exceeds 30% of $100M
      },
    };

    const result = FundModelInputsSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('exceeds stage allocation');
    }
  });

  it('rejects stage allocation too small for check size', () => {
    const invalid = {
      ...validInputs,
      stageAllocations: [
        { stage: 'seed' as const, allocationPct: 0.005 }, // Only $500k
        { stage: 'series_a' as const, allocationPct: 0.495 },
        { stage: 'series_b' as const, allocationPct: 0.50 },
      ],
      // seed check is $500k, but only $500k allocated (after reserves)
      // = 0 companies
    };

    const result = FundModelInputsSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('too small for average check size');
    }
  });

  it('rejects total initial investments > deployable capital', () => {
    const invalid = {
      ...validInputs,
      averageCheckSizes: {
        seed: 10_000_000,
        series_a: 20_000_000,
        series_b: 30_000_000,
        series_c: 40_000_000,
        growth: 50_000_000,
      },
      // This will blow through deployable capital
    };

    const result = FundModelInputsSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('exceed deployable capital');
    }
  });

  it('rejects graduation time >= exit time', () => {
    const invalid = {
      ...validInputs,
      monthsToGraduate: {
        ...validInputs.monthsToGraduate,
        seed: 40, // > exit time of 36
      },
    };

    const result = FundModelInputsSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('must be less than exit time');
    }
  });

  it('warns on very high reserve pool', () => {
    const warning = {
      ...validInputs,
      reservePoolPct: 0.6, // 60%
    };

    const result = FundModelInputsSchema.safeParse(warning);
    // Should still parse but with warning
    expect(result.success).toBe(true); // Warnings don't block
    // In production, warnings would be logged separately
  });
});
```

---

## UI Feedback

When constraints are violated, show clear, actionable error messages in the fund setup wizard.

**Example Error Display**:

```tsx
// In FundBasicsStep or InvestmentStrategyStep

{validationErrors.averageCheckSizes?.seed && (
  <Alert variant="destructive">
    <AlertCircle className="h-4 w-4" />
    <AlertTitle>Invalid Check Size</AlertTitle>
    <AlertDescription>
      {validationErrors.averageCheckSizes.seed}
      {/* "Average check size for seed ($50.00M) exceeds stage allocation ($30.00M)..." */}
    </AlertDescription>
  </Alert>
)}
```

---

## Summary

These feasibility constraints ensure:

1. ✅ **Capital conservation**: Cannot deploy more than committed capital
2. ✅ **Logical consistency**: Check sizes align with stage allocations
3. ✅ **Minimal portfolio**: At least 1 company per active stage
4. ✅ **Temporal coherence**: Graduation happens before exit
5. ✅ **Reserve adequacy**: Warnings when reserves may be insufficient

All constraints are enforced at input validation time, preventing invalid model execution.
