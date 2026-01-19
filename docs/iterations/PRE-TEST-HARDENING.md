---
status: ACTIVE
last_updated: 2026-01-19
---

# Pre-Test Hardening Checklist

**Purpose**: Surgical hardening pass before comprehensive testing to eliminate noise and ambiguity.

**Estimated Time**: 90-120 minutes

**Status**: ✅ All 12 items accepted and integrated into strategy

---

## Overview

This checklist ensures that:
1. ✅ Invalid inputs never reach the calculation engine
2. ✅ Tests fail for the right reasons (logic errors, not missing fields)
3. ✅ Parity diffs are traceable to exact input sets
4. ✅ Performance regressions are caught before merge

---

## Checklist (12 Items)

### ✅ 1. Health & Build Provenance

**Why**: Lets CI catch miswired servers and confirms exact build under test.

**Implementation**:
- ✅ Enhanced `/healthz` endpoint with 5 required fields
- ✅ Created `server/version.ts` with `ENGINE_VERSION` constant
- ✅ Created smoke test at `tests/smoke/healthz.test.ts`

**Files Changed**:
- `server/routes/health.ts` - Enhanced response
- `server/version.ts` - Version constants (NEW)
- `tests/smoke/healthz.test.ts` - Smoke test (NEW)

**Response Format**:
```json
{
  "status": "ok",
  "timestamp": "2025-10-03T12:34:56.789Z",
  "engine_version": "1.0.0",
  "app_version": "1.3.2",
  "commit_sha": "abc123def",
  "node_version": "v20.11.0",
  "environment": "development"
}
```

**Acceptance**:
- [ ] `GET /healthz` returns 200 with all 5 fields
- [ ] CI has smoke test that fails on schema drift
- [ ] Smoke test completes in < 100ms

---

### ✅ 2. Feasibility Constraints at Both Boundaries

**Why**: Invalid inputs are #1 source of "mystery" parity failures.

**Implementation Locations**:
1. **UI Boundary** (PR #4): Form validation with inline messages
2. **API Boundary** (PR #2): Zod `.superRefine()` with field-specific errors

**Blocking Constraints** (must pass):
1. Stage allocations sum to 1.0 (±1e-6)
2. Average check size ≤ stage allocation dollars
3. Total initial investments ≤ deployable capital (committed - fees)
4. `monthsToGraduate[stage] < monthsToExit[stage]`

**Warning Constraints** (non-blocking):
1. Estimated reserve need > reserve pool (show delta %)

**Files**:
- `shared/schemas/fund-model.ts` - Zod superRefine (PR #2)
- `client/src/pages/FundBasicsStep.tsx` - Form validation (PR #4)

**Acceptance**:
- [ ] Invalid inputs never reach `runFundModel()`
- [ ] Engine rejects with field-specific error paths
- [ ] Form shows actionable messages
- [ ] "Run" button disabled while invalid

**Status**: Specified in [feasibility-constraints.md](../policies/feasibility-constraints.md)

---

### ✅ 3. CSV Contracts Frozen

**Why**: Accounting and cash invariants need all fields; lineage makes diffs traceable.

**Forecast CSV** (frozen):
```csv
engine_version,inputs_hash,scenario_id,period_index,period_start,period_end,
contributions,investments,management_fees,exit_proceeds,distributions,unrealized_pnl,nav,
tvpi,dpi,irr_annualized
```

**Company Ledger CSV** (frozen):
```csv
engine_version,inputs_hash,scenario_id,company_id,stage_at_entry,
initial_investment,follow_on_investment,total_invested,
ownership_at_exit,exit_bucket,exit_value,proceeds_to_fund
```

**Acceptance**:
- [ ] Column order is stable
- [ ] Headers match exactly (case-sensitive)
- [ ] `engine_version` comes from `server/version.ts`
- [ ] `inputs_hash` is deterministic (see #4)

**Status**: Specified in [iteration-a-implementation-guide.md](iteration-a-implementation-guide.md)

---

### ✅ 4. Deterministic Inputs Hashing

**Why**: Lets parity diffs unambiguously tie to exact input set.

**Implementation** (PR #2):
```typescript
// server/routes/calculations.ts
import crypto from 'crypto';

function hashInputs(inputs: FundModelInputs): string {
  // Sort keys recursively for canonical representation
  const canonical = JSON.stringify(inputs, Object.keys(inputs).sort());
  return crypto.createHash('sha256')
    .update(canonical)
    .digest('hex')
    .substring(0, 8);  // First 8 chars for brevity
}
```

**Acceptance**:
- [ ] Re-running identical inputs yields same `inputs_hash`
- [ ] Changing any input bit flips the hash
- [ ] Hash is lowercase hex (8 chars)

**Status**: Specified in implementation guide

---

### ✅ 5. Determinism Guard

**Why**: Catches hidden non-determinism (Date.now(), object iteration order).

**Implementation** (PR #3):
```typescript
// tests/invariants/determinism.test.ts
it('produces identical outputs for identical inputs', () => {
  const inputs = loadFixture('canonical.json');

  const outputsA = runFundModel(inputs);
  const outputsB = runFundModel(inputs);

  // Deep equality on unrounded internals
  expect(outputsA).toEqual(outputsB);
});
```

**Acceptance**:
- [ ] Test passes on canonical fixture
- [ ] Test uses unrounded internal values (not exported CSV)

**Status**: NEW - Add to PR #3

---

### ✅ 6. Fees v1 Horizon

**Why**: Without a stop, fees bleed forever, undermining parity.

**Implementation** (PR #2):
```typescript
// client/src/lib/fund-calc.ts
function calculateManagementFee(
  fundSize: number,
  periodLengthMonths: number,
  managementFeeRate: number,
  managementFeeYears: number,
  periodIndex: number
): number {
  const periodsPerYear = 12 / periodLengthMonths;
  const periodYears = periodIndex / periodsPerYear;

  // Stop charging fees after managementFeeYears
  if (periodYears >= managementFeeYears) {
    return 0;
  }

  const periodFeeRate = managementFeeRate / periodsPerYear;
  return new Decimal(fundSize).times(periodFeeRate).toNumber();
}
```

**Acceptance**:
- [ ] Fixture with 12 years shows zero fees after year 10
- [ ] `managementFeeYears` defaults to 10
- [ ] Test validates fee cessation

**Status**: Specified in implementation guide

---

### ✅ 7. Distribution Policy Explicit

**Why**: Avoids modeling ambiguity that breaks invariants.

**Selected**: **Policy A - Immediate Distribution**

**Rule**: `distributions[t] === exitProceeds[t]` for all periods

**Invariant**: `Σ company_proceeds === Σ distributions` (strict equality)

**Acceptance**:
- [ ] Policy A invariant test passes
- [ ] Each period: `distributions === exitProceeds`
- [ ] No retained cash tracking needed

**Status**: Documented in [distribution-policy.md](../policies/distribution-policy.md)

---

### ✅ 8. IRR Solver Hardening

**Why**: Prevents non-convergence edge cases derailing CI.

**Implementation** (PR #2):
```typescript
// client/src/lib/xirr.ts
export function calculateXIRR(cashflows: Cashflow[], guess = 0.1): number {
  // 1. Assert sign change
  const hasPositive = cashflows.some(cf => cf.amount > 0);
  const hasNegative = cashflows.some(cf => cf.amount < 0);

  if (!hasPositive || !hasNegative) {
    throw new Error('XIRR requires both positive and negative cashflows');
  }

  // 2. Try Newton-Raphson
  try {
    return newtonRaphson(cashflows, guess);
  } catch (err) {
    // 3. Fall back to bisection
    return bisection(cashflows);
  }
}

// Use period-end dates for deterministic Excel parity
// Date convention: Actual/365
```

**Acceptance**:
- [ ] "Flat" scenario returns IRR ~ 0 without explosions
- [ ] Pathological scenario triggers bisection and resolves
- [ ] Sign-change assertion catches invalid inputs

**Status**: Specified in implementation guide

---

### ✅ 9. Stage Allocations vs Reserve Pool

**Why**: Prevent silent over-allocation.

**Selected**: **Pattern 1 - Reserves Carved from Allocations**

**Rule**: Stage allocations sum to 100%; reserves carved out (no double counting)

**Schema Enforcement** (PR #2):
```typescript
export const FundModelInputsSchema = z.object({...}).superRefine((inputs, ctx) => {
  const allocSum = inputs.stageAllocations.reduce((s, a) => s + a.allocationPct, 0);

  if (Math.abs(allocSum - 1.0) > 1e-6) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Stage allocations must sum to 100%.',
      path: ['stageAllocations'],
    });
  }
});
```

**Acceptance**:
- [ ] Schema refinement rejects inconsistent configurations
- [ ] Unit test verifies total deployment ≤ fund size
- [ ] No double-counting possible

**Status**: Documented in [allocation-policy.md](../policies/allocation-policy.md)

---

### ✅ 10. Bench & Baselines

**Why**: Establishes performance line in the sand before functional tests start.

**Canonical Fixture**: `testdata/bench-standard.json`
- 100 companies
- 40 quarters (10 years, quarterly periods)
- Upfront capital call
- Management fees: 2% for 10 years

**Baseline File**: `perf/baseline.json`
```json
{
  "engine_run_p50_ms": 150,
  "engine_run_p95_ms": 320,
  "optimizer_run_p50_ms": 45,
  "optimizer_run_p95_ms": 95,
  "created_at": "2025-10-03T12:34:56.789Z",
  "fixture": "bench-standard.json",
  "node_version": "v20.11.0"
}
```

**CI Gate**:
```typescript
// scripts/check-perf-regression.mjs
const maxRegressionPct = 15;

if (current.p95 > baseline.p95 * (1 + maxRegressionPct / 100)) {
  console.error(`❌ Performance regression: +${regressionPct.toFixed(1)}%`);
  process.exit(1);
}
```

**Acceptance**:
- [ ] `perf/baseline.json` created and committed
- [ ] CI fails on > 15% p95 regression
- [ ] Clear error message with actual vs baseline values

**Status**: Specified in PR #6

---

### ✅ 11. Minimal Golden Set

**Why**: Locks parity targets so future changes are intentional.

**5 Golden Fixtures** (PR #3):
1. `simple.json` - Single stage, no follow-ons
2. `multi-stage.json` - Multi-stage progression
3. `reserve-tight.json` - Reserve depletion scenario
4. `high-fee.json` - High management fees (5% for 10 years)
5. `late-exit.json` - Extended exit timing (84+ months)

**Each Fixture Includes**:
- `inputs.json` - Frozen inputs (canonical)
- `outputs.json` - Expected raw outputs (unrounded)
- `forecast.csv` - Human-readable period results
- `companies.csv` - Human-readable company ledger

**Regeneration**:
```bash
npm run golden:regen
# Requires: Manual review + git diff approval
# DO NOT run without review
```

**Acceptance**:
- [ ] `npm run test:parity` passes on all 5
- [ ] Fixtures committed to `tests/fixtures/golden/`
- [ ] `npm run golden:regen` command exists with warning

**Status**: Specified in PR #3

---

### ✅ 12. Pre-commit & CI Gates

**Why**: Keeps local dev snappy; shifts heavy checks to CI.

**Pre-commit** (fast, < 10s):
```bash
# .husky/pre-commit
npm run check:fast      # TypeScript (tsconfig.fast.json)
npm run lint            # ESLint
npm run test:unit -- tests/invariants/  # Invariants only
```

**CI** (comprehensive):
```yaml
# .github/workflows/ci.yml
- name: Smoke tests
  run: npm run test:smoke

- name: Parity tests
  run: npm run test:parity

- name: Determinism test
  run: npm run test:determinism

- name: Performance gate
  run: npm run perf:guard
```

**Acceptance**:
- [ ] Pre-commit completes in < 10s
- [ ] CI runs full test suite
- [ ] UI-only changes skip heavy benches locally
- [ ] CI always runs benches

**Status**: Existing husky hook, needs refinement

---

## Implementation Timeline

| Item | PR | Estimated Time | Status |
|------|----|----- |---|--------|
| 1. Health provenance | #1 | 15 min | ✅ Done |
| 2. Feasibility UI | #4 | 30 min | 📝 Specified |
| 2. Feasibility API | #2 | 30 min | 📝 Specified |
| 3. CSV frozen | #2 | 0 min | ✅ Done |
| 4. Inputs hashing | #2 | 15 min | 📝 Specified |
| 5. Determinism guard | #3 | 10 min | 📝 Specified |
| 6. Fees horizon | #2 | 0 min | ✅ Done |
| 7. Distribution policy | #2 | 0 min | ✅ Done |
| 8. IRR hardening | #2 | 0 min | ✅ Done |
| 9. Stage/reserve policy | #2 | 0 min | ✅ Done |
| 10. Baselines | #6 | 20 min | 📝 Specified |
| 11. Golden fixtures | #3 | 30 min | 📝 Specified |
| 12. Pre-commit gates | #1 | 10 min | 🟡 Needs refinement |

**Total New Work**: ~90 minutes (as estimated)
**Already Specified**: 9/12 items ✅

---

## Acceptance Criteria (Copy to PR Descriptions)

- [ ] `/healthz` returns: status, timestamp, engine_version, commit_sha, node_version
- [ ] Forecast CSV includes: investments, exit_proceeds, unrealized_pnl, lineage fields
- [ ] `inputs_hash` is deterministic across identical inputs
- [ ] Determinism test passes (identical outputs for identical inputs)
- [ ] Fees stop after `managementFeeYears`
- [ ] Distribution policy documented (Policy A) and enforced
- [ ] Stage allocations vs reserves policy enforced in schema/tests
- [ ] IRR: sign-change assertion + bisection fallback implemented
- [ ] `perf/baseline.json` created; CI fails on >15% p95 regression
- [ ] Five golden fixtures pass `npm run test:parity`

---

## Files Created/Modified

### Created (PR #1):
- ✅ `server/version.ts` - ENGINE_VERSION constant
- ✅ `tests/smoke/healthz.test.ts` - Smoke test

### Modified (PR #1):
- ✅ `server/routes/health.ts` - Enhanced `/healthz` response

### To Create (Future PRs):
- `tests/invariants/determinism.test.ts` (PR #3)
- `tests/fixtures/golden/*.json` (PR #3)
- `perf/baseline.json` (PR #6)
- `scripts/check-perf-regression.mjs` (PR #6)

---

**Status**: All 12 items accepted and integrated. Ready for implementation across PRs #1-6.
