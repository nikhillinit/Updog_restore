# ADR 0001 — Iteration-A Deterministic Engine (Scope, Gates & Delivery)

- **Status**: Accepted
- **Date**: 2025-10-12
- **Owner**: Core maintainers
- **Decision type**: Product & Engineering governance
- **Supersedes**: STRATEGY-SUMMARY.md, HANDOFF_MEMO.md (archived for reference)

## Context

We have multiple strategic directions in flight (STRATEGY-SUMMARY, HANDOFF_MEMO, various planning docs) that create confusion and scope creep risk. Multi-agent validation (2025-10-12) confirmed:
- **Actual completion:** 50-60% (not 85-95% as previously claimed)
- **TypeScript errors:** 695 (not zero)
- **Test pass rate:** 64.5% (not 95-100%)
- **Engine-UI integration:** 33% (2/6 engines wired)

To deliver user value quickly and reduce rework, we will ship a **deterministic, auditable engine** first, wire it to a frozen CSV/JSON interface, and enforce **quality gates in CI** (typecheck, unit/prop tests, golden-dataset parity, and lightweight perf smoke). Downstream scope (fees/waterfalls/recycling, stochastic sims, richer UX) will be enabled by today's data shapes but **NOT** implemented in Iteration-A.

## Decision

### Scope (Iteration-A)

**IN SCOPE:**
- Deterministic reserve allocation engine (`shared/core/reserves/DeterministicReserveEngine.ts`)
- Liquidity analysis engine (`client/src/core/LiquidityEngine.ts`) - already wired ✅
- Clear public API with frozen I/O schema (CSV/JSON with lineage fields)
- "Construction vs Current" views permitted by schema, even if "Current" is minimal
- Eight accounting & integrity **invariants** (see below)
- Golden dataset parity testing (XIRR, TVPI, DPI within 1e-6 tolerance)
- Performance budgets (p95 < 800ms for 100-company simulation)

**OUT OF SCOPE (Deferred to Iteration-B):**
- GP carry / carried interest calculations
- European waterfall, hurdle rates, clawback
- Fee recycling, fund expenses beyond management fees
- Paced capital calls (locked to "upfront" mode for Iteration-A)
- Distribution lag / retained cash modeling
- Reserve recycling strategies
- Monte Carlo / probabilistic simulations
- PacingEngine UI integration (engine exists, defer wiring)
- CohortEngine UI integration (engine exists, defer wiring)

### Delivery Model

- **Trunk-based development** with small, reviewable slices
- **No PR > 400 LOC** (excluding snapshots/golden fixtures)
- Feature flags for incomplete features within Iteration-A scope
- Golden datasets (5-10 curated scenarios) act as truth for parity tests
- Changes to golden datasets are PR-reviewed and versioned like code

### CI Gate Order (PR-Blocking)

1. **`tsc --noEmit`** (strict mode, fail-fast) - TypeScript errors must be zero
2. **`npm run lint`** (ESLint + Prettier, --max-warnings=0)
3. **`npm run test:unit`** (fast unit + property-based tests)
4. **`npm run test:parity`** (golden dataset validation, ±1e-6 tolerance)
5. **`npm run test:perf:smoke`** (budgeted, non-flaky, p95 < 800ms)
6. *(optional)* Bundle size check (runs in parallel, advisory until enforced)

### Observability

Every engine run emits structured metadata:
- `engine_version` - Semantic version of engine code
- `model_version_hash` - Git SHA of model logic
- `inputs_hash` - SHA256 of input parameters (for reproducibility)
- `scenario_id` - User-assigned scenario identifier
- `created_at` - ISO 8601 timestamp
- `compute_ms` - Execution time in milliseconds

These fields enable:
- Reproducibility (same inputs → same outputs)
- Parity validation (compare against Excel outputs)
- Performance regression detection
- Audit trail for fund model changes

## Eight Critical Invariants

These invariants MUST hold for every engine run and are validated in `tests/integration/invariants.test.ts`:

### 1. Non-Negativity Invariant
**Rule:** `contributions[t] >= 0`, `distributions[t] >= 0`, `nav[t] >= 0` for all periods `t`

**Rationale:** Negative capital flows or NAV indicate accounting errors

**Implementation:**
```typescript
test('Invariant 1: Non-negativity', () => {
  const results = runEngine(seedData);
  results.forEach((period, t) => {
    expect(period.contributions).toBeGreaterThanOrEqual(0);
    expect(period.distributions).toBeGreaterThanOrEqual(0);
    expect(period.nav).toBeGreaterThanOrEqual(0);
  });
});
```

---

### 2. Paid-In Capital (PIC) Conservation
**Rule:** `PIC[t] = PIC[t-1] + contributions[t] - returned_capital[t]` where `PIC[t] >= 0`

**Rationale:** Paid-in capital can only increase via contributions or decrease via explicit capital returns. It never goes negative.

**Implementation:**
```typescript
test('Invariant 2: PIC conservation', () => {
  let pic = 0;
  results.forEach(period => {
    pic += period.contributions - (period.returnedCapital || 0);
    expect(pic).toBeGreaterThanOrEqual(0);
    expect(period.pic).toBeCloseTo(pic, 2); // $0.01 tolerance
  });
});
```

---

### 3. NAV Accounting Identity
**Rule:** `NAV[t] = NAV[t-1] + contributions[t] + unrealizedPnL[t] - distributions[t]`

**Rationale:** NAV changes only through capital flows and valuation changes. This is the fundamental accounting equation.

**Implementation:**
```typescript
test('Invariant 3: NAV accounting identity', () => {
  results.forEach((period, t) => {
    if (t === 0) return; // Skip first period
    const prev = results[t - 1];
    const expected = prev.nav + period.contributions + period.unrealizedPnL - period.distributions;
    expect(period.nav).toBeCloseTo(expected, 2); // $0.01 tolerance
  });
});
```

---

### 4. Monotone DPI (Non-Decreasing)
**Rule:** `DPI[t] >= DPI[t-1]` for all `t` where DPI = distributions / PIC

**Rationale:** DPI (Distributed to Paid-In) can only increase over time as more capital is returned. It never decreases.

**Implementation:**
```typescript
test('Invariant 4: Monotone DPI', () => {
  let prevDPI = 0;
  results.forEach(period => {
    expect(period.dpi).toBeGreaterThanOrEqual(prevDPI - 1e-6); // Allow tiny floating-point error
    prevDPI = period.dpi;
  });
});
```

---

### 5. Terminal NAV Consistency
**Rule:** If all companies exited by period `T`, then `NAV[T] ≈ 0` (within tolerance)

**Rationale:** Once all investments are liquidated and proceeds distributed, NAV should be near zero (only rounding errors remain).

**Implementation:**
```typescript
test('Invariant 5: Terminal NAV consistency', () => {
  const lastPeriod = results[results.length - 1];
  if (lastPeriod.companiesRemaining === 0) {
    expect(Math.abs(lastPeriod.nav)).toBeLessThan(1.0); // $1 tolerance for rounding
  }
});
```

---

### 6. TVPI Coherence
**Rule:** `TVPI[t] = (distributions[t] + NAV[t]) / PIC[t]` where `PIC[t] > 0`

**Rationale:** TVPI (Total Value to Paid-In) is the sum of realized (distributions) and unrealized (NAV) value divided by total capital deployed.

**Implementation:**
```typescript
test('Invariant 6: TVPI coherence', () => {
  results.forEach(period => {
    if (period.pic > 0) {
      const expectedTVPI = (period.totalDistributions + period.nav) / period.pic;
      expect(period.tvpi).toBeCloseTo(expectedTVPI, 4); // 4 decimal places
    }
  });
});
```

---

### 7. No Distributions Without Value
**Rule:** `distributions[t] > 0` only if `realizedPnL[t] > 0` OR explicit `returnedCapital[t] > 0`

**Rationale:** Capital can only be distributed if it came from exit proceeds (realized PnL) or return of invested capital. Prevents "phantom distributions".

**Implementation:**
```typescript
test('Invariant 7: No distributions without value', () => {
  results.forEach(period => {
    if (period.distributions > 0) {
      const hasValue = period.realizedPnL > 0 || period.returnedCapital > 0;
      expect(hasValue).toBe(true);
    }
  });
});
```

---

### 8. Determinism (Reproducibility)
**Rule:** `hash(inputs) === hash(outputs)` across multiple runs with same inputs

**Rationale:** Deterministic engines must produce **identical** outputs for identical inputs, enabling parity testing and audit trails.

**Implementation:**
```typescript
test('Invariant 8: Determinism', () => {
  const run1 = runEngine(seedData);
  const run2 = runEngine(seedData); // Same inputs

  // Bitwise equality after rounding
  expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
});
```

---

## Data Schemas & Interfaces

### Input Schema (Frozen for Iteration-A)

**`inputs/scenario.json`**:
```json
{
  "scenarioId": "string",
  "fundSize": "number",
  "periodLengthMonths": "number",
  "capitalCallMode": "upfront",  // LOCKED for Iteration-A
  "managementFeeRate": "number",  // Annualized percentage
  "managementFeeYears": "number",  // Default 10
  "stageAllocations": [
    { "stage": "string", "percentage": "number" }
  ],
  "reservePoolPct": "number",
  "averageCheckSizes": { "stage": "number" },
  "graduationRates": { "stage": "number" },
  "exitRates": { "stage": "number" },
  "monthsToGraduate": { "stage": "number" },
  "monthsToExit": { "stage": "number" }
}
```

### Output Schema (CSV with Lineage)

**`outputs/timeline.csv`**:
```csv
engine_version,model_version_hash,inputs_hash,scenario_id,created_at,quarter,contributions,distributions,nav,dpi,tvpi,irr_annualized
```

**Columns:**
- `engine_version`: Semantic version (e.g., "1.0.0-iteration-a")
- `model_version_hash`: Git SHA of engine code
- `inputs_hash`: SHA256 of input JSON
- `scenario_id`: User-assigned identifier
- `created_at`: ISO 8601 timestamp
- `quarter`: Period index (0, 1, 2, ...)
- `contributions`: Capital called this period (decimal)
- `distributions`: Capital returned this period (decimal)
- `nav`: Net Asset Value at period end (decimal)
- `dpi`: Distributed / Paid-In Capital (decimal, 4 places)
- `tvpi`: Total Value / Paid-In Capital (decimal, 4 places)
- `irr_annualized`: XIRR-based IRR (decimal, 6 places)

**`outputs/companies.csv`** (if applicable):
```csv
engine_version,model_version_hash,inputs_hash,scenario_id,created_at,company_id,entry_stage,exit_stage,total_invested,exit_value,ownership_pct
```

---

## Golden Dataset Location

**Current Structure:** `tests/parity/golden/`
- `seed-fund-basic.csv` - Input cashflows
- `seed-fund-basic.results.csv` - Expected Excel results

**Expected Results (from documentation):**
- **XIRR:** -0.062418 (6 decimal precision)
- **TVPI:** 0.875000 (4 decimal precision)
- **DPI:** 0.125000 (4 decimal precision)
- **Tolerance:** ±1e-6 (0.000001) for all metrics

**Golden Dataset Policy:**
1. Golden datasets are **semantic fixtures** and MUST be reviewed like code
2. Changes require PR with explanation in description
3. New golden datasets require approval from at least one core maintainer
4. Golden datasets are versioned with engine code (Git SHA in lineage)

---

## Consequences

### Positive Outcomes
- ✅ Faster merges and smaller rollbacks (400 LOC limit)
- ✅ Stable validation surface (golden datasets + 8 invariants)
- ✅ Future features can slot into reserved shapes without schema churn
- ✅ Clear decision authority (ADR is source of truth for scope questions)
- ✅ Reduced technical debt (strict TypeScript, PR gates prevent accumulation)
- ✅ Audit trail (lineage fields enable reproducibility)

### Trade-offs
- ⚠️ Iteration-A features are limited (no waterfalls, no Monte Carlo, no pacing UI)
- ⚠️ 400 LOC limit may require multi-PR features (increases coordination)
- ⚠️ Strict gates slow down PRs (but prevent regressions)
- ⚠️ Golden dataset changes require review (but prevent accidental breakage)

### Risks
- **Scope creep:** Features outside Iteration-A may be requested mid-development
  - **Mitigation:** Point to this ADR; defer to Iteration-B
- **Performance regressions:** New code may slow down engine
  - **Mitigation:** Perf smoke test runs on every PR
- **Parity drift:** Engine outputs may diverge from Excel
  - **Mitigation:** Golden dataset parity gate fails PR on mismatch

---

## Alignment with Multi-Agent Validation (2025-10-12)

This ADR directly addresses findings from our 5-agent validation:

| Agent Finding | ADR Solution |
|---------------|--------------|
| **TypeScript Agent:** 695 errors | Strict mode + typecheck gate (Section: CI Gate Order) |
| **Test Suite Agent:** 64.5% pass rate | Unit tests PR-blocking (Section: CI Gate Order) |
| **CI/CD Agent:** 66% failure rate | Consolidated gate order (Section: CI Gate Order) |
| **Integration Agent:** 33% wired (2/6 engines) | Scope freeze prevents adding more (Section: Out of Scope) |
| **Security Agent:** 3 HIGH vulns | Not addressed in ADR (separate concern) |

**Validation Confidence:** ⭐⭐⭐⭐⭐ (ADR reflects actual 50-60% completion, not 85-95%)

---

## References

- **Source:** ChatGPT 4 governance artifacts (2025-10-12)
- **Validation:** Multi-agent consensus report (2025-10-12)
- **Supersedes:** STRATEGY-SUMMARY.md (archived), HANDOFF_MEMO.md (archived)
- **Related:** CONTRIBUTING.md (development process), CI workflow (gate implementation)

---

## Appendix A: Migration from Previous Strategies

### From STRATEGY-SUMMARY.md (Oct 3, 2025)
**Aligned:**
- ✅ 2-week deterministic-only approach → Iteration-A scope
- ✅ 8 accounting invariants → Codified in this ADR
- ✅ Excel parity validation → Golden dataset parity gate
- ✅ IndexedDB persistence → Still in scope

**Diverged:**
- ❌ Claimed 85% complete → Actual 50-60% per validation
- ❌ 2-week timeline → Realistic 4-6 weeks

### From HANDOFF_MEMO.md (Oct 7, 2025)
**Deferred to Iteration-B:**
- ❌ Progressive wizard integration (10-12 week plan)
- ❌ Dual-mode dashboard (Construction vs Current)
- ❌ Full-featured platform vision

**Reason:** Multi-agent validation revealed 50-60% actual completion. Iteration-A focuses on stabilization and deterministic core. Iteration-B can revisit full platform vision.

---

**Status:** ✅ **ACCEPTED** (2025-10-12)
**Next Review:** After Iteration-A completion (estimated 4-6 weeks)
