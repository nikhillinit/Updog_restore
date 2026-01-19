---
status: ACTIVE
last_updated: 2026-01-19
---

# Comprehensive Divergence Assessment: Recent PRs & Implementation Mismatches

**Status:** ANALYSIS COMPLETE **Date:** 2025-12-16 **Coverage:** PRs merged
2025-12-02 through 2025-12-15 (22 PRs analyzed) **Branch:**
claude/review-hardening-plans-F5q5J

---

## Executive Summary

Analysis of 22 PRs merged in the past two weeks reveals **significant
implementation divergence** across four critical domains:

| Domain                 | # Implementations | Severity    | Risk                                                          |
| ---------------------- | ----------------- | ----------- | ------------------------------------------------------------- |
| **XIRR**               | 4                 | CRITICAL    | Different algorithms, error handling, precision               |
| **Capital Allocation** | 6+                | HIGH        | Different unit systems (cents/BigInt/Decimal/dollars)         |
| **Waterfall**          | 3+                | MEDIUM-HIGH | Clawback not uniform, EUROPEAN removed but ghost types remain |
| **Fees**               | 3                 | HIGH        | Different basis enums, recycling logic                        |

**Recommendation:** Add "Implementation Parity Phase" before or during
Foundation Hardening Sprint.

---

## Section 1: XIRR Divergence (CRITICAL)

### Recent PR Impact: #266 (XIRR Excel Parity)

PR #266 changed day count convention from 365 to **365.25** in two files:

- `client/src/lib/finance/xirr.ts` (line 40)
- `client/src/lib/xirr.ts` (line 70)

However, the codebase has **4 separate XIRR implementations**:

### Implementation Matrix

| File                                           | Algorithm                  | Day Convention | Precision  | Error Handling |
| ---------------------------------------------- | -------------------------- | -------------- | ---------- | -------------- |
| `client/src/lib/finance/xirr.ts`               | Newton + Brent + Bisection | **365.25**     | JS number  | Result object  |
| `client/src/lib/xirr.ts`                       | Newton + Bisection         | **365.25**     | Decimal.js | Returns null   |
| `client/src/core/selectors/xirr.ts`            | Newton only                | **365.25**     | JS number  | **THROWS**     |
| `server/services/actual-metrics-calculator.ts` | Newton only                | **365.25**     | Decimal.js | Returns **0**  |

### Critical Divergences

1. **Algorithm Fallback Chain**
   - Finance: Newton -> Brent -> Bisection (3-tier)
   - Lib: Newton -> Bisection (2-tier)
   - Selector/Server: Newton only (no fallback)

   **Risk:** Same cashflows may converge to different rates or fail differently.

2. **Error Handling Mismatch**
   - Finance/Lib: Return result objects (null or struct)
   - Selector: **THROWS exceptions** (can crash UI)
   - Server: Returns **0** (silently masks errors)

3. **Code Duplication**
   - Server has its own XIRR implementation instead of importing from client
   - Tests import from client, but server uses different logic
   - **Risk:** If finance/xirr.ts is updated, server diverges immediately

4. **Rate Bounds**
   - Finance: MIN=-0.999999, MAX=9.0
   - Lib: LOWER=-0.999, UPPER=10.0
   - Server: Checks < -0.99 || > 10
   - Selector: Only checks < -0.99

   **Risk:** Same input accepted/rejected differently.

### Files Affected

```
client/src/lib/finance/xirr.ts         # PRIMARY (used by workers, tests)
client/src/lib/xirr.ts                 # SECONDARY (used by fund-calc)
client/src/core/selectors/xirr.ts      # LEGACY (used by hooks, UI)
server/services/actual-metrics-calculator.ts  # ISOLATED (server-only)
```

---

## Section 2: Capital Allocation Divergence (HIGH)

### Recent PR Impact: #264, #266, #268, #279, #280

These PRs implemented the Capital Allocation engine with:

- Integer cents (number type)
- Banker's rounding
- LRM (Largest Remainder Method) allocation
- 1e7 weight scale

**But the codebase has 6+ separate allocation engines with different
conventions:**

### Implementation Matrix

| Engine                         | Location                                        | Unit Type              | Rounding      | Arithmetic |
| ------------------------------ | ----------------------------------------------- | ---------------------- | ------------- | ---------- |
| **CapitalAllocationEngine**    | client/src/core/capitalAllocation/              | integer cents (number) | Banker's      | number     |
| **PeriodLoopEngine**           | client/src/core/capitalAllocation/periodLoop.ts | integer cents (number) | Banker's      | number     |
| **DeterministicReserveEngine** | shared/core/reserves/                           | Decimal.js (28dp)      | ROUND_HALF_UP | Decimal    |
| **ConstrainedReserveEngine**   | shared/core/reserves/                           | **BigInt**             | implicit      | BigInt     |
| **ReserveEngine**              | client/src/core/reserves/                       | dollars (number)       | multipliers   | number     |
| **PacingEngine**               | client/src/core/pacing/                         | dollars (number)       | standard      | number     |

### Critical Divergences

1. **Unit Type Mismatch (CRITICAL)**

   ```
   CapitalAllocationEngine: number (integer cents)
   ConstrainedReserveEngine: BigInt (Cents type)
   DeterministicReserveEngine: Decimal (28 decimal places)
   PacingEngine: number (raw dollars)
   ```

   **Risk:** Mixing values without explicit conversion causes silent bugs.

2. **Breaking Change in PR #279**

   > `max_allocation_per_cohort` now expects a **percentage** (float, e.g., 0.5
   > for 50%) instead of an absolute cent value.

   **Risk:** Any code using old absolute format will produce wrong results.

3. **Weight Scale Inconsistency**
   - CA Engine LRM: WEIGHT_SCALE = 1e7 (7 decimal precision)
   - Lib units: basis points = 1e4 (2 decimal precision)

   **Risk:** Using bpsToMoic() in LRM context produces wrong allocations.

4. **Rounding Strategy Divergence**
   - CA Engine: Banker's rounding (half-to-even)
   - Lib units: Math.round (standard)
   - Reserve engines: implicit/none

   **Risk:** Small differences compound over multi-period calculations.

### Files Affected

```
client/src/core/capitalAllocation/CapitalAllocationEngine.ts
client/src/core/capitalAllocation/periodLoop.ts
client/src/core/capitalAllocation/allocateLRM.ts
client/src/core/capitalAllocation/units.ts
shared/core/reserves/DeterministicReserveEngine.ts
shared/core/reserves/ConstrainedReserveEngine.ts
client/src/core/reserves/ReserveEngine.ts
client/src/core/pacing/PacingEngine.ts
client/src/lib/units.ts
shared/money.ts
```

---

## Section 3: Waterfall Divergence (MEDIUM-HIGH)

### Recent PR Impact: #239 (Clawback), #247 (Waterfall Harness)

PR #239 added fund-level clawback to American waterfall:

- `client/src/lib/waterfall/american-ledger.ts`

**But clawback is NOT implemented uniformly:**

### Implementation Matrix

| File                                          | Has Clawback          | Precision  | Tier System                |
| --------------------------------------------- | --------------------- | ---------- | -------------------------- |
| `client/src/lib/waterfall/american-ledger.ts` | YES (shortfall-based) | JS number  | 4-tier event-based         |
| `shared/schemas/waterfall-policy.ts`          | YES (schema only)     | Decimal.js | 4-tier with tiers array    |
| `client/src/lib/fee-calculations.ts`          | NO                    | JS number  | American/European selector |
| `client/src/lib/waterfall.ts`                 | NO (type guards only) | N/A        | Type switching helpers     |

### Critical Divergences

1. **Clawback Implementation Gap**
   - `american-ledger.ts`: Full clawback with `clawbackLpHurdleMultiple`
   - `fee-calculations.ts:calculateCarriedInterest()`: No clawback
   - `waterfall-policy.ts`: Schema has `ClawbackPolicySchema` but no calculation
     function

2. **EUROPEAN Waterfall Ghost Types** Despite ADR-004 documenting EUROPEAN
   removal (commit `ebd963a`), ghost references remain:

   ```
   shared/contracts/kpi-selector.contract.ts: z.enum(['american', 'european'])
   client/src/stores/fundStore.ts: 'american' | 'european' | 'hybrid'
   tests/waterfall-step.test.tsx: type: 'EUROPEAN'
   tests/fund-schema-updates.test.ts: type: 'EUROPEAN'
   ```

   **Risk:** Tests pass but production code may not handle these types.

3. **Carry Calculation Divergence**
   - `american-ledger.ts`: Deal-by-deal with recycling, clawback
   - `fee-calculations.ts`: Simplified European/American selector without
     clawback

   **Risk:** Using wrong function produces different GP distributions.

### Files Affected

```
client/src/lib/waterfall/american-ledger.ts    # PRIMARY (clawback implemented)
shared/schemas/waterfall-policy.ts              # SCHEMA (clawback defined, not calculated)
client/src/lib/fee-calculations.ts              # LEGACY (no clawback, both types)
client/src/lib/waterfall.ts                     # HELPERS (type guards only)
shared/contracts/kpi-selector.contract.ts       # GHOST (still has 'european')
```

---

## Section 4: Fee Divergence (HIGH)

_See separate document: FOUNDATION-HARDENING-FEE-ALIGNMENT-REVIEW.md_

### Summary

| System                               | Basis Enum Values | Precision  | Recycling     |
| ------------------------------------ | ----------------- | ---------- | ------------- |
| `client/src/lib/fees.ts`             | 7 values          | JS number  | Tier-based    |
| `client/src/lib/fee-calculations.ts` | 3 values          | JS number  | Array-based   |
| `shared/schemas/fee-profile.ts`      | 6 values          | Decimal.js | Context-based |

**Risk:** `called_capital_period` (fees.ts) has no equivalent in other systems.

---

## Section 5: Cross-Cutting Issues

### 5.1 Precision Tower

```
Layer 4: Decimal.js (28 decimal places) - shared/ schemas
Layer 3: BigInt (arbitrary precision integers) - ConstrainedReserveEngine
Layer 2: number (53-bit float) - Most client code
Layer 1: Integer cents (number) - CA Engine

When values cross layers without explicit conversion, precision is lost or gained unexpectedly.
```

### 5.2 Error Handling Taxonomy

| Pattern              | Used By                  | Risk                              |
| -------------------- | ------------------------ | --------------------------------- |
| **Throws exception** | selectors/xirr.ts        | Crashes UI without error boundary |
| **Returns null**     | lib/xirr.ts              | Caller must check, often doesn't  |
| **Returns 0**        | server/actual-metrics.ts | Silently masks errors             |
| **Result object**    | finance/xirr.ts          | Best practice, not universal      |

### 5.3 Unit Inference Ambiguity

The CA Engine's `inferUnitScale()` has an "ambiguous zone":

- `< 1K` -> millions
- `1K - 10M` -> **FAIL-FAST** (requires explicit `units` config)
- `>= 10M` -> raw dollars

**Risk:** Values in 1K-10M range fail silently if `units` not specified.

---

## Recommendations

### Immediate (Before Hardening Sprint)

1. **Create canonical implementation map** - Document which implementation is
   authoritative for each domain
2. **Add import guards** - Lint rules to prevent importing non-canonical
   implementations

### During Hardening Sprint

3. **Add cross-implementation parity tests**

   ```typescript
   describe('XIRR Parity', () => {
     it('all 4 implementations produce same result for golden set', () => {
       // Run each implementation against same inputs
       // Assert results within tolerance
     });
   });
   ```

4. **Fix ghost types** - Remove 'european' from contracts, stores, tests

5. **Propagate clawback** - Either add clawback to fee-calculations.ts or
   deprecate its carry function

### Post-Hardening

6. **Consolidate XIRR** - Single implementation in shared/, imported everywhere
7. **Standardize units** - Pick one (recommend: integer cents with Banker's
   rounding)
8. **Unify error handling** - Result objects everywhere, no throws for expected
   failures

---

## Phoenix Coordination Context

**Phoenix Truth-Case Validation** provides correctness specs for the domains
identified in this divergence assessment:

- **XIRR**: N scenarios (Excel parity) -
  [/docs/xirr.truth-cases.json](/docs/xirr.truth-cases.json)
- **Waterfall**: N ledger + N tier scenarios -
  [/docs/waterfall-ledger.truth-cases.json](/docs/waterfall-ledger.truth-cases.json),
  [/docs/waterfall-tier.truth-cases.json](/docs/waterfall-tier.truth-cases.json)
- **Fees**: N scenarios -
  [/docs/fees.truth-cases.json](/docs/fees.truth-cases.json)
- **Capital Allocation**: N scenarios -
  [/docs/capital-allocation.truth-cases.json](/docs/capital-allocation.truth-cases.json)

**Phoenix Domain Knowledge** (NotebookLM sources, 85K words) provides canonical
semantics and achieves 91-99% Promptfoo documentation validation scores.

**Coordination Strategy**: See
[PHOENIX-FOUNDATION-HARDENING-CROSSWALK.md](PHOENIX-FOUNDATION-HARDENING-CROSSWALK.md)
for how Phoenix truth-case validation coordinates with Foundation Hardening
implementation parity work. The crosswalk document contains:

- Domain overlap matrix (no duplication here)
- Coordination commands (`/phoenix-truth focus=<domain>`)
- Triage decision framework integration
- Success criteria for maintaining truth-case pass rates during hardening

---

## PR Reference Table

| PR   | Date  | Domain    | Key Change                                                        | Divergence Risk |
| ---- | ----- | --------- | ----------------------------------------------------------------- | --------------- |
| #282 | 12-15 | Docs      | Strategy guides                                                   | LOW             |
| #281 | 12-15 | Infra     | Hygiene Sprint                                                    | LOW             |
| #280 | 12-15 | CA        | TypeScript fixes                                                  | LOW             |
| #279 | 12-15 | CA        | Period Loop Engine, **BREAKING: max_allocation_per_cohort now %** | HIGH            |
| #268 | 12-15 | CA/XIRR   | Runner + XIRR precision                                           | MEDIUM          |
| #266 | 12-14 | XIRR      | 365.25 day count (2 files updated)                                | MEDIUM          |
| #264 | 12-14 | CA        | Phase 1 Implementation                                            | HIGH            |
| #260 | 12-13 | Recycling | Exit recycling adapter                                            | LOW             |
| #247 | 12-12 | Waterfall | Phase 1B harness                                                  | LOW             |
| #239 | 12-04 | Waterfall | **Clawback added** (1 file only)                                  | HIGH            |

---

## Appendix: File Inventory by Domain

### XIRR (4 implementations)

```
client/src/lib/finance/xirr.ts          # CANONICAL (ADR-005)
client/src/lib/xirr.ts                  # SECONDARY
client/src/core/selectors/xirr.ts       # LEGACY
server/services/actual-metrics-calculator.ts  # ISOLATED
```

### Capital Allocation (6+ implementations)

```
client/src/core/capitalAllocation/      # CANONICAL (Phase 1)
  CapitalAllocationEngine.ts
  periodLoop.ts
  allocateLRM.ts
  units.ts
shared/core/reserves/                   # RELATED (different domain)
  DeterministicReserveEngine.ts
  ConstrainedReserveEngine.ts
client/src/core/reserves/ReserveEngine.ts      # LEGACY
client/src/core/pacing/PacingEngine.ts         # RELATED
```

### Waterfall (3+ implementations)

```
client/src/lib/waterfall/american-ledger.ts    # CANONICAL (clawback)
shared/schemas/waterfall-policy.ts              # SCHEMA
client/src/lib/fee-calculations.ts              # LEGACY (no clawback)
client/src/lib/waterfall.ts                     # HELPERS
```

### Fees (3 implementations)

```
client/src/lib/fees.ts                  # WIZARD (7 basis types)
client/src/lib/fee-calculations.ts      # ANALYTICS (3 basis types)
shared/schemas/fee-profile.ts           # CANONICAL (6 basis types, Decimal.js)
```

---

**Author:** Claude (Divergence Analysis) **Last Updated:** 2025-12-16
