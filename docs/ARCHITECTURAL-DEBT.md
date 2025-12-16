# Architectural Debt Registry

**Purpose:** Track COMPLEX refactoring opportunities that require focused
architectural effort (10+ files, cross-domain, architectural decisions)

**Status:** ACTIVE (Populated during Hardening Sprint) **Created:** 2025-12-16
**Sprint Context:** Foundation Hardening Sprint (72.3% → 90% test pass rate)

**Scope:** This document is for COMPLEX issues only. Simple 1-2 file fixes (<30
min) should be fixed immediately during test repair, not documented here.

---

## How to Use This Document

### During Foundation Hardening Sprint

When you encounter a COMPLEX architectural issue during test repair:

**Ask: "Is this a simple fix (<30 min, 1-2 files) or complex refactoring
(hours/days, 10+ files)?"**

**If SIMPLE:**

1. Fix it immediately (5-30 minutes)
2. Continue with test repair
3. Don't document here (not architectural debt, just normal repair)

**If COMPLEX:**

1. Document it here using the template below
2. Link from commit message (e.g., "See ARCHITECTURAL-DEBT.md#xirr-divergence")
3. Continue with test repair (don't start the refactoring now)

**Examples of what SHOULD be documented:**

- Consolidating 4 XIRR implementations (multi-file, architectural decision
  needed)
- Standardizing capital allocation units across 6 engines (cross-domain)
- Adding clawback to fee-calculations (requires deprecation decision)

**Examples of what should NOT be documented (just fix them):**

- Updating CA adapter to use percentage format (1 file change)
- Removing ghost 'EUROPEAN' type from tests (simple cleanup)
- Fixing field name 'intent' → 'navigationIntent' (trivial rename)

### After Foundation Hardening Sprint

This document becomes the backlog for the Implementation Parity Sprint:

1. Review all entries
2. Prioritize by P0/P1/P2
3. Create sprint plan with phases
4. Execute parity fixes
5. Mark entries RESOLVED

---

## CRITICAL (P0): Production Correctness Risks

### XIRR Implementation Divergence

**Discovered:** [Phase X.Y - To be filled during sprint] **Impact:** 4 separate
XIRR implementations with different algorithms, error handling, and precision.
Same cashflows may converge to different rates or fail differently.

**Severity:** CRITICAL (P0) **Effort:** 2-3 days **Status:** DEFERRED (unless
blocks test repair)

**Implementations:**

- `client/src/lib/finance/xirr.ts` - CANONICAL (ADR-005): Newton → Brent →
  Bisection, Result object
- `client/src/lib/xirr.ts` - SECONDARY: Newton → Bisection, returns null
- `client/src/core/selectors/xirr.ts` - LEGACY: Newton only, **THROWS
  exceptions**
- `server/services/actual-metrics-calculator.ts` - ISOLATED: Newton only,
  returns **0 on error**

**Key Divergences:**

1. **Algorithm fallback:** 3-tier vs 2-tier vs 1-tier (no fallback)
2. **Error handling:** Result object vs null vs throws vs returns 0
3. **Rate bounds:** Different min/max values across implementations
4. **Day count:** All now 365.25 (fixed in PR #266), but other differences
   remain

**Evidence:**

- [COMPREHENSIVE-DIVERGENCE-ASSESSMENT.md](plans/COMPREHENSIVE-DIVERGENCE-ASSESSMENT.md#section-1-xirr-divergence)

**Recommended Fix:**

1. Create `shared/lib/xirr.ts` with canonical implementation
2. 3-tier fallback: Newton → Brent → Bisection
3. Use Result<number, XirrError> for error handling
4. Migrate all 4 implementations to import from shared
5. Add cross-implementation parity tests

**Blockers:** None (can be done post-hardening)

**Related PRs:** #266 (XIRR Excel Parity - 365.25 day count)

---

## HIGH (P1): Data Integrity Risks

### Capital Allocation Unit Mismatch

**Discovered:** [Phase X.Y - To be filled during sprint] **Impact:** 6+ separate
allocation engines using different unit systems (cents/BigInt/Decimal/dollars).
Mixing values without explicit conversion causes silent bugs.

**Severity:** HIGH (P1) **Effort:** 1.5-2 days **Status:** DEFERRED

**Implementations:**

- `CapitalAllocationEngine` - integer cents (number), Banker's rounding
- `ConstrainedReserveEngine` - **BigInt** (Cents type)
- `DeterministicReserveEngine` - **Decimal.js** (28dp)
- `ReserveEngine` - dollars (number), multipliers
- `PacingEngine` - dollars (number), standard rounding

**Key Divergences:**

1. **Unit type:** number (cents) vs BigInt vs Decimal vs number (dollars)
2. **Rounding:** Banker's vs standard Math.round vs implicit
3. **Weight scale:** 1e7 (CA Engine LRM) vs 1e4 (basis points)
4. **Breaking change (PR #279):** `max_allocation_per_cohort` now expects
   **percentage** (float) instead of absolute cents

**Evidence:**

- [COMPREHENSIVE-DIVERGENCE-ASSESSMENT.md](plans/COMPREHENSIVE-DIVERGENCE-ASSESSMENT.md#section-2-capital-allocation-divergence)

**Recommended Fix:**

1. Standardize on integer cents with Banker's rounding (most precise, portable)
2. Create `shared/lib/units.ts` with canonical conversion functions
3. Add unit tests for conversions (especially 1K-10M "ambiguous zone")
4. Migrate all engines to use shared units
5. Document unit conventions in DECISIONS.md

**Blockers:**

- Requires decision: cents vs Decimal vs BigInt (recommend: cents)

**Related PRs:** #279 (Breaking change - max_allocation_per_cohort now
percentage), #264 (CA Phase 1)

---

### Waterfall Clawback Implementation Gap

**Discovered:** [Phase X.Y - To be filled during sprint] **Impact:** Clawback
only implemented in `american-ledger.ts`. Fee-calculations carry function has no
clawback support. Different GP distributions for same fund parameters.

**Severity:** HIGH (P1) **Effort:** 1 day **Status:** DEFERRED

**Implementations:**

- `client/src/lib/waterfall/american-ledger.ts` - **HAS clawback**
  (shortfall-based)
- `shared/schemas/waterfall-policy.ts` - **Schema only** (ClawbackPolicySchema
  defined, not calculated)
- `client/src/lib/fee-calculations.ts` - **NO clawback**
  (calculateCarriedInterest)

**Key Divergences:**

1. **Clawback logic:** Only in american-ledger.ts
2. **Carry calculation:** Deal-by-deal (ledger) vs simplified (fee-calculations)

**Evidence:**

- [COMPREHENSIVE-DIVERGENCE-ASSESSMENT.md](plans/COMPREHENSIVE-DIVERGENCE-ASSESSMENT.md#section-3-waterfall-divergence)

**Recommended Fix:**

1. Document which implementation is canonical (recommend: american-ledger.ts)
2. Either:
   - Add clawback to fee-calculations.ts carry function, OR
   - Deprecate fee-calculations carry, migrate callers to american-ledger
3. Add cross-implementation parity tests

**Blockers:**

- Requires decision: Single implementation or keep both with documented use
  cases

**Related PRs:** #239 (Waterfall Clawback), #247 (Waterfall Harness)

---

### Fee Basis Enum Mismatch

**Discovered:** [Phase X.Y - To be filled during sprint] **Impact:** 3 separate
fee systems with different basis enums (7 values vs 3 values vs 6 values). Fee
using `called_capital_period` (from fees.ts) has no equivalent in other systems.

**Severity:** HIGH (P1) **Effort:** 1 day **Status:** DEFERRED

**Implementations:**

- `client/src/lib/fees.ts` - **7 basis values** (includes called_capital_period)
- `client/src/lib/fee-calculations.ts` - **3 basis values** (committed, called,
  fmv)
- `shared/schemas/fee-profile.ts` - **6 basis values** (Decimal.js precision)

**Key Divergences:**

1. **Enum values:** 7 vs 3 vs 6 (no universal mapping)
2. **Precision:** JS number vs Decimal.js
3. **Recycling logic:** Array-based vs context-based

**Evidence:**

- [FOUNDATION-HARDENING-FEE-ALIGNMENT-REVIEW.md](plans/FOUNDATION-HARDENING-FEE-ALIGNMENT-REVIEW.md)

**Recommended Fix:**

1. Create `shared/types/fee-basis.ts` with canonical enum (6 values from
   fee-profile.ts)
2. Create alias mapping for legacy 3-value and 7-value enums
3. Update truth case adapter to handle all basis types
4. Add cross-implementation validation tests

**Blockers:** None

**Related PRs:** None directly, but affects all fee-related work

---

## MEDIUM (P2): Tech Debt

### Ghost EUROPEAN Waterfall Types

**Discovered:** [Phase X.Y - To be filled during sprint] **Impact:** Despite
ADR-004 documenting EUROPEAN removal (commit `ebd963a`), ghost references remain
in contracts, stores, and tests. Risk: Tests pass but production code may not
handle these types.

**Severity:** MEDIUM (P2) **Effort:** 0.5 days **Status:** DEFERRED (unless
Phase 2.3 hits them)

**Ghost References:**

- `shared/contracts/kpi-selector.contract.ts` - z.enum(['american', 'european'])
- `client/src/stores/fundStore.ts` - 'american' | 'european' | 'hybrid'
- `tests/waterfall-step.test.tsx` - type: 'EUROPEAN'
- `tests/fund-schema-updates.test.ts` - type: 'EUROPEAN'

**Evidence:**

- [COMPREHENSIVE-DIVERGENCE-ASSESSMENT.md](plans/COMPREHENSIVE-DIVERGENCE-ASSESSMENT.md#section-3-waterfall-divergence)

**Recommended Fix:**

1. Remove 'european' from all contracts and stores
2. Update tests to use 'american' only (or document hybrid if needed)
3. Add migration guide for any external consumers

**Blockers:**

- May require understanding of 'hybrid' type (is it different from 'american'?)

**Related PRs:** None (ADR-004 removed EUROPEAN but left ghosts)

---

### Precision Tower (Cross-Cutting)

**Discovered:** [Phase X.Y - To be filled during sprint] **Impact:** Values
crossing layers (Decimal → BigInt → number → cents) lose/gain precision
unpredictably.

**Severity:** MEDIUM (P2) **Effort:** 2-3 days (requires cross-domain changes)
**Status:** DEFERRED

**Layers:**

- Layer 4: Decimal.js (28 decimal places) - shared/ schemas
- Layer 3: BigInt (arbitrary precision integers) - ConstrainedReserveEngine
- Layer 2: number (53-bit float) - Most client code
- Layer 1: Integer cents (number) - CA Engine

**Evidence:**

- [COMPREHENSIVE-DIVERGENCE-ASSESSMENT.md](plans/COMPREHENSIVE-DIVERGENCE-ASSESSMENT.md#section-5-cross-cutting-issues)

**Recommended Fix:**

1. Standardize on ONE precision layer for financial calculations (recommend:
   integer cents)
2. Create explicit conversion functions with rounding contracts
3. Document precision expectations in DECISIONS.md
4. Add precision drift tests

**Blockers:**

- Requires cross-domain coordination (affects all engines)

---

### Error Handling Taxonomy

**Discovered:** [Phase X.Y - To be filled during sprint] **Impact:** Mix of
throws, null returns, zero returns, and result objects. Inconsistent caller
expectations.

**Severity:** MEDIUM (P2) **Effort:** 0.5 days **Status:** DEFERRED

**Patterns:**

- **Throws exception** - selectors/xirr.ts (crashes UI without error boundary)
- **Returns null** - lib/xirr.ts (caller must check, often doesn't)
- **Returns 0** - server/actual-metrics.ts (silently masks errors)
- **Result object** - finance/xirr.ts (best practice, not universal)

**Evidence:**

- [COMPREHENSIVE-DIVERGENCE-ASSESSMENT.md](plans/COMPREHENSIVE-DIVERGENCE-ASSESSMENT.md#52-error-handling-taxonomy)

**Recommended Fix:**

1. Create `shared/types/result.ts` (Success/Failure discriminated union)
2. Wrap all calculation functions that can fail
3. Update callers to handle Result objects
4. Remove try/catch blocks that mask errors

**Blockers:** None

---

## Required Entry Schema

**Every entry MUST include all fields below. No exceptions.**

If you can't fill out all required fields, the issue is not well-understood
enough to be architectural debt - investigate further or fix it immediately.

```markdown
### [Title] (Short, specific description)

**Symptom:** [What failed? User-visible impact? Which test(s)?] **Evidence:**
[Failing test names, error signatures, output snippets] **Root Cause
Hypothesis:** [1-2 lines - what mismatch causes the failure?] **Proposed Fix
Shape:** [Type of change needed, not full design] **Blast Radius:** [# files
affected, domains touched] **Gate Risk:** [Schema drift? Truth-case parity?
Performance regression?] **ETA Bucket:** [half-day | 1-2 days | 3-5 days]
**Link:** [GitHub issue # or PR # or "TBD"]

**Severity:** P0/P1/P2 (P0=production correctness, P1=data integrity, P2=tech
debt) **Status:** DEFERRED | IN-PROGRESS | RESOLVED

**Detailed Analysis:** [Link to deeper analysis if exists, or 2-3 paragraphs
explaining the issue]

**Recommended Fix:**

1. [Concrete step with file references]
2. [Concrete step with file references]
3. [Verification method]

**Blockers:** [Dependencies or "None"]
```

**Admission Criteria - ALL must be true:**

1. ✅ Has reproducible symptom (failing test or production issue)
2. ✅ Root cause is divergence (not isolated bug)
3. ✅ Fix is complex (meets ≥1 complexity threshold from integration strategy)
4. ✅ Blast radius is documented with specific file counts
5. ✅ ETA is realistic estimate (not placeholder)

**Rejection Criteria - If ANY apply, DO NOT add entry:**

- ❌ No failing test (speculative refactoring)
- ❌ Root cause is not divergence (e.g., missing await)
- ❌ Fix is simple (<30 min, 1-2 files, no shared seams)
- ❌ Issue is vague ("XIRR has problems" - which test? which error?)
- ❌ No proposed fix shape (must have at least rough approach)

---

## Summary Statistics

**Total Entries:** 8 **CRITICAL (P0):** 1 **HIGH (P1):** 3 **MEDIUM (P2):** 4

**Estimated Effort:** 9-12 days total (for all P0/P1 items)

---

## Related Documents

- [IMPLEMENTATION-PARITY-INTEGRATION-STRATEGY.md](plans/IMPLEMENTATION-PARITY-INTEGRATION-STRATEGY.md) -
  How this debt registry integrates with Foundation Hardening Sprint
- [COMPREHENSIVE-DIVERGENCE-ASSESSMENT.md](plans/COMPREHENSIVE-DIVERGENCE-ASSESSMENT.md) -
  Detailed analysis of 22 recent PRs
- [FOUNDATION-HARDENING-FEE-ALIGNMENT-REVIEW.md](plans/FOUNDATION-HARDENING-FEE-ALIGNMENT-REVIEW.md) -
  Fee-specific divergence analysis
- [FOUNDATION-HARDENING-EXECUTION-PLAN.md](../FOUNDATION-HARDENING-EXECUTION-PLAN.md) -
  Active sprint plan

---

## Maintenance Notes

- **Update during sprint:** Add new entries as they're discovered during test
  repair
- **Link from commits:** Include "See ARCHITECTURAL-DEBT.md#anchor" in commit
  messages
- **Don't remove entries:** Mark as RESOLVED when fixed, don't delete (preserves
  history)
- **Effort estimates:** Use actual time spent when marking RESOLVED
