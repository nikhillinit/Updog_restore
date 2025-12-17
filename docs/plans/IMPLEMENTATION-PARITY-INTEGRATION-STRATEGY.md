# Implementation Parity Integration Strategy

**Status:** DRAFT **Date:** 2025-12-16 **Context:** Divergence assessment
completed, integrating with Foundation Hardening Sprint

---

## Decision: Contextual Triage Strategy

### Track 1: Foundation Hardening (ACTIVE - Phases 2.1-2.4)

**Goal:** 72.3% → 90% test pass rate **Mode:** Test repair with contextual
divergence fixes **Timeline:** 4-6 days (as planned) **Divergence handling:**
Fix simple divergences when encountered, defer complex refactoring

### Track 2: Implementation Parity Sprint (Fallback for Complex Refactoring)

**Goal:** Consolidate duplicate implementations requiring architectural
decisions **Mode:** Focused architectural refactoring (10+ files, cross-domain)
**Timeline:** 3-5 days (separate sprint, only if needed)

**Triggers (Parity Sprint is REQUIRED if ANY apply):**

1. **≥3 P0/P1 entries** in ARCHITECTURAL-DEBT.md after hardening completes
2. **Any P0 entry** blocks truth-case domains (XIRR, CA, Waterfall, Fees)
3. **Multiple clusters** (≥2) touched same math seam during repair, creating
   coupling debt

**Triggers (Parity Sprint is OPTIONAL if):**

- 1-2 P1/P2 entries accumulated, none blocking truth cases
- All deferred issues are isolated (no shared seam coupling)

**Parity Sprint is NOT NEEDED if:**

- Zero entries in ARCHITECTURAL-DEBT.md (all divergences were simple fixes)
- Only P2 tech debt entries (can be backlog items, not sprint)

---

## Rationale

### Contextual Awareness Over Rigid Deferral

**Core Principle:** Fix what's obviously broken when you encounter it. Defer
only complex architectural work.

**Why this matters:**

- Test repair reveals root causes in real-time - some divergences block tests,
  others don't
- Simple 1-file fixes (field name, format conversion) take 5-30 minutes - not
  worth deferring
- Complex refactoring (consolidating 4 XIRR implementations) takes days - should
  be focused effort

### What Gets Fixed During Hardening:

**Simple divergence fixes (DO fix immediately):**

- Single file changes (<30 minutes)
- Obvious format mismatches (e.g., percentage vs cents)
- Field name corrections
- Ghost type removal from tests
- No architectural decisions required

**Complex refactoring (DEFER to Parity Sprint):**

- Multi-file consolidation (10+ files)
- Cross-domain changes (affects XIRR + CA + Waterfall)
- Requires architectural decisions (which implementation is canonical?)
- Needs new validators or infrastructure

### Why Track 2 is a "Fallback":

Implementation Parity Sprint only happens if:

1. ARCHITECTURAL-DEBT.md accumulates complex issues during hardening
2. Issues are too complex to fix contextually (>30 min, architectural scope)
3. Post-hardening consolidation provides more value than immediate fixes

If all divergences encountered are simple (1-file fixes), Track 2 may not be
needed.

---

## Triage Decision Framework

When a test fails during repair, ask: **"Is a divergence DIRECTLY causing this
failure?"**

**Default Assumption:** Treat as **Scenario 3** (divergence NOT root cause)
until you have evidence that divergence is blocking the test. Don't reach for
refactors preemptively.

### What Qualifies as "Divergence"?

**Divergence = Implementation mismatch causing incorrect behavior or test
failure**

**Types:**

1. **Schema/contract mismatch** - Different type signatures, field names, or
   validation rules
2. **Unit mismatch** - Same value in different units (cents vs dollars,
   percentage vs ratio)
3. **Precision/rounding mismatch** - Different numeric handling (Decimal vs
   number, banker's vs standard rounding)
4. **Algorithm divergence** - Different calculation paths producing different
   results
5. **Error handling mismatch** - Throws vs returns null vs returns 0

**Examples of what IS divergence:**

- CA truth case expects percentage (0.5), gets cents (50000000)
- XIRR implementation A returns 0.24, implementation B returns 0.26 for same
  cashflows
- Field named `intent` in one layer, `navigationIntent` in another

**Examples of what is NOT divergence:**

- Missing await (async bug)
- Wrong mock data (test setup issue)
- Logic error in single implementation (isolated bug)

---

### Scenario 1: Divergence IS Root Cause + Simple Fix

**Characteristics:**

- Error message clearly points to divergence (e.g., "Expected percentage 0.5,
  got 50000000 cents")
- Fix is 1-2 files, <30 minutes
- No architectural decisions required

**Action: FIX NOW**

**Examples:**

- CA truth case fails: "expected %, got cents" → Update adapter to percentage
  format (1 file)
- Wizard test fails: field 'intent' not found → Change to 'navigationIntent' (1
  file)
- Test fails: type 'EUROPEAN' invalid → Remove ghost type from test (1 file)

**Time investment:** 5-30 minutes → Worth fixing immediately

**Stop Conditions (reclassify to Scenario 2 if ANY apply):**

- Can't demonstrate fix with single local test run in ≤30 min
- Fix requires touching shared seams (common mocks, base classes, utility
  functions)
- Fix affects truth-case expected values (requires Excel parity verification)
- Fix touches Decimal/rounding helpers (precision-sensitive)
- Uncertainty about which implementation is "correct" (requires architectural
  decision)

**Rule:** If you can't prove the fix works locally in one test session, defer
it.

---

### Scenario 2: Divergence IS Root Cause + Complex Fix

**Characteristics:**

- Root cause is divergence, but fix requires:
  - 10+ files across multiple domains
  - Architectural decision (which implementation is canonical?)
  - New infrastructure or validators

**Action: DOCUMENT in ARCHITECTURAL-DEBT.md, defer to Parity Sprint**

**Examples:**

- XIRR test fails: Different implementations return different results →
  Consolidating 4 implementations requires architectural decision (which is
  canonical?) + multi-file refactor
- Waterfall test fails: Missing clawback logic → Adding clawback to
  fee-calculations.ts OR deprecating it requires architectural decision
- Fee test fails: Basis enum mismatch → Consolidating 3 fee systems with
  different enums requires cross-domain coordination

**Time investment:** Multiple hours to days → Defer to focused sprint

---

### Scenario 3: Divergence NOT Root Cause

**Characteristics:**

- Test fails, divergence exists, but they're unrelated
- Root cause is missing await, wrong mock, logic bug, etc.

**Action: FIX THE ACTUAL ROOT CAUSE, ignore divergence**

**Examples:**

- ops-webhook test fails with Redis timeout → Root cause: missing await (not
  related to any divergence)
- stage-validation test fails → Root cause: wrong mock data (divergence exists
  but isn't blocking)

**Note:** Document divergence in ARCHITECTURAL-DEBT.md only if it's a genuine
issue, not every time you see duplicate code

---

## Complexity Threshold Quick Reference

| Factor                  | Simple (Fix Now)    | Complex (Defer)                           |
| ----------------------- | ------------------- | ----------------------------------------- |
| **Files affected**      | 1-2                 | 10+                                       |
| **Time estimate**       | <30 minutes         | Hours to days                             |
| **Domains**             | Single              | Cross-cutting (XIRR + CA + Waterfall)     |
| **Decisions needed**    | None                | Architectural (canonical implementation)  |
| **Infrastructure**      | Existing tools work | Needs new validators/agents               |
| **Shared seams**        | No                  | Yes (base classes, common mocks, helpers) |
| **Truth-case impact**   | No                  | Yes (changes expected values)             |
| **Precision-sensitive** | No                  | Yes (Decimal/rounding/unit conversions)   |

**Operational Rule - Treat as Complex if ANY apply:**

- Touches shared seams (common mocks, base classes, utility functions used by 3+
  files)
- Affects truth-case expected values (requires Excel parity verification)
- Touches Decimal/BigInt/rounding helpers (precision drift risk)
- Requires choosing between implementations (architectural decision)
- Can't prove fix locally in ≤30 min

**When in doubt:** If you can fix it in one test repair session (<30 min) AND it
doesn't touch shared seams, fix it. Otherwise, defer it.

---

## ARCHITECTURAL-DEBT.md Structure

Create now, populate during hardening:

```markdown
# Architectural Debt Registry

**Purpose:** Track deferred refactoring opportunities discovered during
Foundation Hardening Sprint

---

## CRITICAL: XIRR Implementation Divergence

**Discovered:** Phase 2.2 (Truth Cases) **Impact:** 4 separate XIRR
implementations with different algorithms, error handling, precision **Effort:**
2-3 days **Priority:** P0 (production correctness risk)

**Files:**

- `client/src/lib/finance/xirr.ts` (CANONICAL - ADR-005)
- `client/src/lib/xirr.ts` (SECONDARY)
- `client/src/core/selectors/xirr.ts` (LEGACY - throws exceptions)
- `server/services/actual-metrics-calculator.ts` (ISOLATED - returns 0 on error)

**Recommended Fix:**

1. Consolidate to single implementation in `shared/lib/xirr.ts`
2. Use Result object error handling (no throws, no null, no 0)
3. Standardize on 365.25 day count (already done per PR #266)
4. 3-tier fallback: Newton → Brent → Bisection

**Blockers:** None (can be done post-hardening)

---

## HIGH: Capital Allocation Unit Mismatch

[... Similar structure ...]

---

## Template for New Entries

### [SEVERITY]: [Title]

**Discovered:** Phase X.Y ([Cluster Name]) **Impact:** [1-2 sentence
description] **Effort:** [days estimate] **Priority:** P0/P1/P2

**Files:** [bullet list]

**Recommended Fix:** [numbered steps]

**Blockers:** [dependencies or none]
```

---

## Integration Points with Hardening Plan

### Phase 2.1 (Integration Seams)

- **If** ops-webhook or stage-validation tests fail due to XIRR exceptions →
  Apply immediate fix
- **Document** any unit mismatch issues in CA engine tests →
  ARCHITECTURAL-DEBT.md

### Phase 2.2 (Truth Cases)

- **If** CA truth cases fail due to PR #279 breaking change → Update adapter
  immediately
- **If** waterfall truth cases fail due to clawback gap → Assess if test
  expectations are wrong vs. implementation

### Phase 2.3 (UI/Wizard)

- **If** wizard tests reference EUROPEAN types → Remove ghost types immediately
- **Document** fee basis enum mismatches discovered in wizard →
  ARCHITECTURAL-DEBT.md

### Phase 2.4 (Regression Prevention)

- **Review** ARCHITECTURAL-DEBT.md entries → Prioritize for Parity Sprint
- **No parity fixes** unless blocking final 90% target

---

## Post-Hardening: Implementation Parity Sprint Plan

### Prerequisites (from Hardening Sprint)

- [x] ARCHITECTURAL-DEBT.md populated with discovered issues
- [x] All Phase 2.1-2.4 batch gates passing
- [x] Sprint gate (7 validators) passing
- [x] Test pass rate ≥90%

### Parity Sprint Phases

#### Phase P.1: XIRR Consolidation (1 day)

**Target:** Single canonical XIRR implementation

1. Create `shared/lib/xirr.ts` with 3-tier fallback
2. Migrate all 4 implementations to import from shared
3. Add cross-implementation parity tests
4. Remove legacy implementations

**Gate:** All existing XIRR tests pass + new parity tests pass

---

#### Phase P.2: Capital Allocation Unit Standardization (1.5 days)

**Target:** Consistent unit system (integer cents + Banker's rounding)

1. Audit all CA engines for unit type
2. Create `shared/lib/units.ts` with canonical conversion functions
3. Add unit tests for conversions (especially 1K-10M "ambiguous zone")
4. Migrate engines to use shared units

**Gate:** All CA truth cases pass + no schema drift

---

#### Phase P.3: Waterfall Parity (1 day)

**Target:** Clawback uniformly implemented or legacy deprecated

1. Document which waterfall implementation is canonical (recommend:
   american-ledger.ts)
2. Either:
   - Add clawback to fee-calculations.ts carry function, OR
   - Deprecate fee-calculations carry, migrate callers to american-ledger
3. Remove ghost EUROPEAN types (if not done in Phase 2.3)

**Gate:** All waterfall tests pass + `/phoenix-truth focus=waterfall`

---

#### Phase P.4: Fee Basis Alignment (1 day)

**Target:** Single authoritative fee basis enum

1. Create `shared/types/fee-basis.ts` with canonical enum (6 values from
   fee-profile.ts)
2. Create alias mapping for legacy 3-value and 7-value enums
3. Update truth case adapter to handle all basis types
4. Add cross-implementation validation tests

**Gate:** All fee tests pass + `/phoenix-truth focus=fees`

---

#### Phase P.5: Error Handling Standardization (0.5 days)

**Target:** Result objects everywhere, no throws for expected failures

1. Create `shared/types/result.ts` (Success/Failure discriminated union)
2. Wrap all calculation functions that can fail
3. Update callers to handle Result objects
4. Remove try/catch blocks that mask errors

**Gate:** TypeScript check passes + all tests pass

---

### Parity Sprint Success Criteria

- [ ] Zero duplicate implementations (1 canonical per domain)
- [ ] All cross-implementation parity tests pass
- [ ] No ghost types remaining
- [ ] Consistent error handling (Result objects)
- [ ] ARCHITECTURAL-DEBT.md entries marked RESOLVED
- [ ] Test pass rate maintained or improved (≥90%)

---

## Immediate Actions (Before Starting Phase 2.1)

### 1. Create ARCHITECTURAL-DEBT.md (Now)

```bash
touch docs/ARCHITECTURAL-DEBT.md
# Populate with template structure above
```

### 2. Check for PR #279 Breaking Change Impact (Now)

```bash
# Search for old max_allocation_per_cohort usage (absolute cents)
rg "max_allocation_per_cohort.*[0-9]{6,}" --type ts
# If found → Fix immediately before Phase 2.1
```

### 3. Check for XIRR Exception Risk (Now)

```bash
# Search for direct xirr selector usage without error boundary
rg "import.*from.*selectors/xirr" --type ts
rg "calculateXIRR\(" tests/ --type ts
# If UI code imports selector → Add to Phase 2.3 hotspot watch list
```

### 4. Update FOUNDATION-HARDENING-EXECUTION-PLAN.md (Now)

Add reference to this integration strategy:

```markdown
## Related Documents

- **Implementation Parity Integration Strategy**:
  docs/plans/IMPLEMENTATION-PARITY-INTEGRATION-STRATEGY.md
- **Architectural Debt Registry**: docs/ARCHITECTURAL-DEBT.md (created during
  sprint)
- **Divergence Assessment**: docs/plans/COMPREHENSIVE-DIVERGENCE-ASSESSMENT.md
```

---

## Key Principles

1. **Test Repair First** - Don't let parity work derail 90% pass rate goal
2. **Document, Don't Fix** - Unless divergence BLOCKS test repair
3. **Validator-Driven** - Parity Sprint needs NEW validators (not yet built)
4. **Evidence-Based** - Only fix divergences proven to cause test failures
5. **Single Canonical** - Each domain gets ONE authoritative implementation

**Phoenix Coordination**: See
[PHOENIX-FOUNDATION-HARDENING-CROSSWALK.md](PHOENIX-FOUNDATION-HARDENING-CROSSWALK.md)
for how Phoenix truth-case validation coordinates with this implementation
parity strategy.

---

## Decision Log

| Date       | Decision                               | Rationale                                                |
| ---------- | -------------------------------------- | -------------------------------------------------------- |
| 2025-12-16 | Defer parity work to separate sprint   | Scope discipline, unknown causality, resource contention |
| 2025-12-16 | Create ARCHITECTURAL-DEBT.md now       | Capture issues during repair without blocking progress   |
| 2025-12-16 | Fix XIRR exceptions if blocking        | Crashes are P0, divergence is P1                         |
| 2025-12-16 | Fix ghost types if Phase 2.3 hits them | Test repair priority over architectural cleanup          |

---

## Success Metrics

### Foundation Hardening (Track 1)

- Test pass rate: 72.3% → ≥90%
- Architectural debt entries: 0 → 4-8 (documented, not fixed)
- Immediate divergence fixes: 0-3 (only if blocking)

### Implementation Parity Sprint (Track 2 - Future)

- Duplicate implementations: 16 → 4 (one per domain)
- Cross-implementation test coverage: 0% → 100%
- Ghost type references: ~10 → 0
- ARCHITECTURAL-DEBT.md resolved entries: 0 → 4-8

---

## File References

- [FOUNDATION-HARDENING-EXECUTION-PLAN.md](../../FOUNDATION-HARDENING-EXECUTION-PLAN.md)
- [COMPREHENSIVE-DIVERGENCE-ASSESSMENT.md](COMPREHENSIVE-DIVERGENCE-ASSESSMENT.md)
- [FOUNDATION-HARDENING-FEE-ALIGNMENT-REVIEW.md](FOUNDATION-HARDENING-FEE-ALIGNMENT-REVIEW.md)
- [ARCHITECTURAL-DEBT.md](../ARCHITECTURAL-DEBT.md) (to be created)
