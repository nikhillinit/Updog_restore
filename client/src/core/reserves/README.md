# Graduation-Driven Reserves Engine

> Replace fixed reserve % with **computed follow-on dollars + timing** derived from graduation rates and months-to-next-round.

## Purpose
Given portfolio construction inputs, model expected follow-on demand across quarters and compute:
- **Total reserves** (\$)
- **Reserve ratio** (% of fund)
- **Stage totals** (A/B/C)
- **Quarterly follow-on timeline**

## Inputs (EV-v1)
- `totalCommitment: number` – fund size (for ratio)
- `targetCompanies: number` – initial company count
- `avgCheckSize: number` – average initial check (for context; not required for follow-on calc)
- `deploymentPacePerYear?: number` or `deploymentQuarters?: number[]` – initial pacing
- `graduationRates`:
  - `seedToA | aToB | bToC` each with `{ graduate, fail, remain, months }` (percentages sum to **100**)
- `followOnChecks: { A, B, C }` – \$ sizes per stage
- `startQuarter: number` – default `0`
- `horizonQuarters: number` – e.g., `60` (15 years)

## Outputs
```ts
{
  valid: boolean
  errors: string[]
  totalReserves: number           // dollars
  reserveRatioPct: number         // 0..100
  aggregateByStage: { A: number, B: number, C: number }
  followOnByQuarter: Record<number, { A: number, B: number, C: number, total: number }>
}
```

## Method (Expected Value v1)
1. Initial deployment is spread via `deploymentPacePerYear` (or explicit quarters).
2. Each quarter, move the expected portion of companies along transitions after `months` (rounded to quarters).
3. Multiply stage headcount by `followOnChecks` → $ per quarter.
4. Sum per stage and overall; compute `reserveRatioPct = totalReserves / totalCommitment * 100`.

## Invariants & Validation
- Each transition's `graduate + fail + remain === 100`.
- Months are non-negative; horizon covers all transitions.
- If invalid, `valid=false` with `errors[]`.

## v1.1 Features ✅
- **Remain pass**: Optional retry attempts for "remain" companies with configurable delay and success rates
- **Horizon binding**: Derives `horizonQuarters = investmentHorizonYears * 4` from Fund Basics
- **Realistic timing**: Delayed retry attempts with reduced success rates for more accurate modeling

## Usage
```ts
import { computeReservesFromGraduation } from "./computeReservesFromGraduation";

const res = computeReservesFromGraduation({
  totalCommitment: 100_000_000,
  targetCompanies: 30,
  deploymentPacePerYear: 12,
  graduationRates: {
    seedToA: { graduate: 35, fail: 35, remain: 30, months: 18 },
    aToB:    { graduate: 50, fail: 25, remain: 25, months: 24 },
    bToC:    { graduate: 60, fail: 20, remain: 20, months: 30 },
  },
  followOnChecks: { A: 800_000, B: 1_500_000, C: 2_500_000 },
  startQuarter: 0,
  horizonQuarters: 64,
  // v1.1: Enable remain pass for higher reserves
  remainAttempts: 1,          // One extra attempt for remain companies
  remainDelayQuarters: 2,     // 6 months delay before retry
});

if (!res.valid) throw new Error(res.errors.join("; "));
console.log(res.reserveRatioPct, res.aggregateByStage, res.followOnByQuarter);
```

## Test Hints
- **Row sum invalid** → `valid=false` with clear error
- **Sensitivity**: raising Seed→A increases `totalReserves` and ratio
- **Range**: defaults typically 45–65% (sanity band, not a guarantee)
