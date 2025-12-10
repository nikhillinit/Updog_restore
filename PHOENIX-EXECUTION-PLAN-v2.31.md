# Phoenix Execution Plan v2.31 - Plan ↔ JSON Synchronized

**Date:** December 9, 2025 **Status:** ACTIVE - Ready for Execution **Author:**
Solo Developer **Approach:** Validation-First, Evidence-Driven, Skills-Enhanced

**Version Note:** v2.31 = v2.30 + Plan ↔ JSON synchronization + verification
gate refinements

---

## Executive Summary

This plan validates and hardens 6 financial calculation modules through
empirical testing before optimization. Enhanced with skills framework and agent
delegation for optimal solo developer workflow.

**Modules covered by truth-case validation:**

- XIRR (50 scenarios)
- Waterfall - Tier-based (15 scenarios)
- Waterfall - Ledger-based (14 scenarios)
- Fees (10 scenarios)
- Capital Allocation (20 scenarios)
- Exit Recycling (10 scenarios)

**Total:** 119 truth case scenarios

**Core Principle:** Production code + JSON truth cases are the joint source of
truth. We validate current behavior against truth cases first, then only change
code where behavior is demonstrably wrong.

**Timeline (Optimized):**

- **Best case:** 5-8 days (calculations work + automation saves time)
- **Moderate case:** 12-15 days (bug fixes + agent assistance)
- **Worst case:** 4-6 weeks (rebuild path)

**Optimization Strategy:**

- Leverage 50 existing XIRR test cases (don't rebuild)
- Delegate to memory-enabled agents (waterfall-specialist, test-repair)
- Use slash commands (`/test-smart`, `/fix-auto`, `/deploy-check`)
- Activate skills at key decision points

### Path Summary

| Path | Trigger (Phase 0)                        | Focus                  | Duration                          |
| ---- | ---------------------------------------- | ---------------------- | --------------------------------- |
| 1A   | Core tests >= 70% AND module gates met   | Cleanup + hardening    | 1-2 wks (optimized to 4-5 days)   |
| 1B   | Core tests >= 50% AND truth cases >= 60% | Bug fixes then cleanup | 2-3 wks (optimized to 12-15 days) |
| 1C   | Anything below                           | Targeted rebuild       | 4-6 wks                           |

**Note:** As of 2025-12-09, test pass rate is ~74.7%, so Phase 1A is the
expected path unless significant regressions occur.

---

## Verified Ground Truth

### Truth Case Distribution

| Module             | File                                       | Count   | Status                                               |
| ------------------ | ------------------------------------------ | ------- | ---------------------------------------------------- |
| XIRR               | `docs/xirr.truth-cases.json`               | 50      | HIGH confidence (Excel `XIRR()` verified)            |
| Waterfall (Tier)   | `docs/waterfall-tier.truth-cases.json`     | 15      | MEDIUM confidence (hand-verified, needs spot-check)  |
| Waterfall (Ledger) | `docs/waterfall-ledger.truth-cases.json`   | 14      | MEDIUM confidence (migrated from unit tests)         |
| Fees               | `docs/fees.truth-cases.json`               | 10      | HIGH confidence (simple arithmetic)                  |
| Capital Allocation | `docs/capital-allocation.truth-cases.json` | 20      | LOW confidence (unknown origin, priority spot-check) |
| Exit Recycling     | `docs/exit-recycling.truth-cases.json`     | 10      | LOW confidence (needs investigation)                 |
| **Total**          |                                            | **119** |                                                      |

### Truth Case Provenance

| Module             | Source                     | Validation Method                           | Confidence                    |
| ------------------ | -------------------------- | ------------------------------------------- | ----------------------------- |
| XIRR               | Excel `XIRR()` function    | `excelFormula` field in JSON                | HIGH - Excel is authoritative |
| Waterfall (Tier)   | Internal spreadsheet model | Hand-verified arithmetic                    | MEDIUM - Needs spot-check     |
| Waterfall (Ledger) | Unit tests + LPA terms     | Migrated from `analytics-waterfall.test.ts` | MEDIUM - Needs spot-check     |
| Fees               | Arithmetic derivations     | 2% of commitment, etc.                      | HIGH - Simple math            |
| Capital Allocation | Unknown                    | 1,381 lines, unclear origin                 | LOW - Priority for spot-check |
| Exit Recycling     | Unknown                    | Needs investigation                         | LOW - Priority for spot-check |

**Action:** Phase 0 spot-check (Step 0.4) specifically targets LOW/MEDIUM
confidence scenarios.

### parseFloat Triage (Estimated)

| Priority  | Description         | Est. Files | Est. Occurrences |
| --------- | ------------------- | ---------- | ---------------- |
| P0        | Calculation paths   | ~12        | ~20              |
| P1        | Config/ENV parsing  | ~3         | ~15              |
| P2        | UI input boundaries | ~25        | ~65              |
| P3        | Tests/fixtures      | ~56        | ~200             |
| **Total** |                     | **96**     | **301**          |

**Note:** P0+P1 (~35 occurrences) are the only ones that matter for calculation
precision. Phase 1A focuses exclusively on P0.

### Waterfall Ledger Implementation - Clawback Semantics

**Implementation Type:** Shortfall-based partial clawback

**Semantics:**

- GP carry is limited by fund-level profit above the LP shortfall
- If LPs haven't achieved full return of capital + preferred return, GP carry is
  reduced proportionally
- NOT a binary "all or nothing" clawback
- NOT a time-based clawback (uses cumulative fund performance)

**Truth Case Example (L08):**

```
Scenario: Partial clawback with 1.1x hurdle
- Total contributions: $1M
- Exit proceeds: $1.1M
- GP carry before clawback: $20K (20% of $100K profit)
- LP shortfall: $1.1M required - $1.1M distributed = $4K short
- GP clawback: $4K returned to LPs
- GP carry net: $16K
```

**Critical for Validation:**

- L08 truth case (Step 0.4 spot-check) must verify shortfall calculation
- Cross-validation (Step 0.9) won't work for clawback scenarios (tier-based
  doesn't have clawback)
- waterfall-specialist agent must be invoked for L08 validation (has memory of
  clawback edge cases)

### Skills, Agents, and Commands Available

**Skills Framework (22 skills from .claude/skills/):**

- `systematic-debugging` - MANDATORY: Root cause analysis before fixes
- `verification-before-completion` - MANDATORY at phase gates
- `multi-model-consensus` - For complex logic validation
- `test-driven-development` - RED-GREEN-REFACTOR discipline
- `root-cause-tracing` - Backward trace from failures
- `iterative-improvement` - Small cycles with verification
- `pattern-recognition` - Anti-pattern detection
- `inversion-thinking` - Failure mode analysis

**Agents (23 agents from .claude/agents/):**

- `waterfall-specialist` - Memory of waterfall edge cases
- `test-repair` - Automated failure triage
- `code-reviewer` - CLAUDE.md compliance
- `perf-guard` - Bundle analysis
- `db-migration` - Schema validation

**Slash Commands (Project-Specific):**

- `/test-smart` - Intelligent test selection based on file changes
  - Fallback: `npm test -- --changed`
- `/fix-auto` - Automated repair of lint, format, simple test failures
  - Fallback: `npm run lint:fix && npm run format:fix`
- `/deploy-check` - Pre-deployment validation (8 phases)
  - Fallback: `npm run check && npm run build && npm test`

**Superpowers Commands (Plugin):**

- `/superpowers:brainstorm` - Socratic design refinement
- `/superpowers:write-plan` - Detailed implementation plans
- `/superpowers:execute-plan` - Batch execution with review checkpoints

**Usage Notes:**

- Skills auto-activate (e.g., `systematic-debugging` when debugging)
- Invoke agents explicitly when specialized knowledge needed
- Use slash commands for common workflows; fallback to npm if unavailable

---

## Phase 0: Validation & Routing (7-8 hours)

**Objective:** Run all truth cases, establish baseline, route to Phase 1A/1B/1C

**Skills:** `verification-before-completion`, `pattern-recognition`

**Commands:** `/test-smart`, `/fix-auto`

### Step 0.0: Pre-Flight Environment Check (30 min)

**CRITICAL:** Fix environment BEFORE invoking agents.

**Problem:** Agents need working test environment to function. If `npm test` is
broken, agents can't help fix tests.

**Solution:** Human fixes infrastructure first.

**Actions:**

1. Verify test runner works:

   ```bash
   npm test -- --run --reporter=verbose 2>&1 | head -20
   # Should show "Test Files  X passed" or specific failures
   # Should NOT show "cross-env: command not found"
   ```

2. If `cross-env` missing (Windows):

   ```bash
   npm install --save-dev cross-env
   git add package.json package-lock.json
   git commit -m "fix(test): install cross-env for Windows compatibility"
   ```

3. Verify truth case files exist:
   ```bash
   ls docs/*.truth-cases.json | wc -l
   # Expected: 6 files
   ```

**Gate:** Test runner executes without infrastructure errors (may have test
failures, that's OK).

### Step 0.1: Baseline Test Run (30 min)

**Objective:** Capture current state before any changes.

Run full suite with coverage:

```bash
/test-smart --coverage
# Fallback: npm test -- --coverage --run
```

**Capture:**

- Overall pass rate (e.g., 74.7% = 998/1,337)
- Module-level pass rates (see Step 0.10 for gates)
- Known failures (variance schema, integration infra, client globals)

**Skill Activation:** `verification-before-completion` - Document baseline
before proceeding.

### Step 0.2: Truth Case Runner Setup (1 hour)

**Objective:** Create unified runner for all 6 truth case JSON files.

**Why Needed:** No existing test harness loads these JSON files. We need to
create one.

**Location:** `tests/truth-cases/runner.test.ts`

**Implementation:**

```typescript
import { describe, it, expect } from 'vitest';
import xirrCases from '../../docs/xirr.truth-cases.json';
import waterfallTierCases from '../../docs/waterfall-tier.truth-cases.json';
import waterfallLedgerCases from '../../docs/waterfall-ledger.truth-cases.json';
// ... other imports

describe('Truth Case Validation', () => {
  describe('XIRR (50 scenarios)', () => {
    xirrCases.forEach((tc) => {
      it(tc.scenario, () => {
        const result = calculateXIRR(tc.input.cashflows);
        expect(result).toBeCloseTo(tc.expected.xirr, 6);
      });
    });
  });

  describe('Waterfall - Tier (15 scenarios)', () => {
    waterfallTierCases.forEach((tc) => {
      it(tc.scenario, () => {
        const result = calculateWaterfallTier(tc.input);
        expect(result.lpProceeds).toBeCloseTo(tc.expected.lpProceeds, 6);
        expect(result.gpCarry).toBeCloseTo(tc.expected.gpCarry, 6);
      });
    });
  });

  describe('Waterfall - Ledger (14 scenarios)', () => {
    waterfallLedgerCases.forEach((tc) => {
      it(tc.scenario, () => {
        const result = calculateWaterfallLedger(tc.input);
        // Handle different expected structures
        if (tc.expected.totals) {
          expect(result.totals.paidIn).toBeCloseTo(
            tc.expected.totals.paidIn,
            6
          );
          if (tc.expected.totals.distributed !== undefined) {
            expect(result.totals.distributed).toBeCloseTo(
              tc.expected.totals.distributed,
              6
            );
          }
          if (tc.expected.totals.gpCarryTotal !== undefined) {
            expect(result.totals.gpCarryTotal).toBeCloseTo(
              tc.expected.totals.gpCarryTotal,
              6
            );
          }
          // Handle clawback (null = expect undefined)
          if (tc.expected.totals.gpClawback === null) {
            expect(result.totals.gpClawback).toBeUndefined();
          } else if (tc.expected.totals.gpClawback !== undefined) {
            expect(result.totals.gpClawback).toBeCloseTo(
              tc.expected.totals.gpClawback,
              6
            );
          }
        }
        if (tc.expected.rows) {
          tc.expected.rows.forEach((expectedRow, i) => {
            const actualRow = result.rows[i];
            expect(actualRow.quarter).toBe(expectedRow.quarter);
            expect(actualRow.lpCapitalReturn).toBeCloseTo(
              expectedRow.lpCapitalReturn,
              6
            );
            expect(actualRow.gpCarry).toBeCloseTo(expectedRow.gpCarry, 6);
          });
        }
      });
    });
  });

  // ... other modules
});
```

**Key Semantics (see `tests/truth-cases/validation-helpers.ts` for canonical
implementation):**

1. **Numeric Comparisons:** Use `toBeCloseTo(expected, 6)` for all numeric
   fields
   - **Rationale:** Decimal.js + JavaScript number mixing causes precision
     variance
   - **Precision:** 6 decimal places (0.000001 tolerance)

2. **Strip Notes:** Ignore `notes` fields in expectations (they're
   documentation)

3. **Handle null vs undefined:** `gpClawback: null` in JSON means "expect
   undefined in code"

4. **Range Assertions:**
   - `recycled_min/max` → `expect(actual).toBeGreaterThanOrEqual(min)` and
     `expect(actual).toBeLessThanOrEqual(max)`

5. **Row-based Expectations:** Some scenarios (L03, L08) validate quarterly
   `rows[]` instead of aggregate `totals`

**Agent Delegation:** If implementation exceeds 2 hours, invoke `test-repair`
agent with context.

**Verification:**

```bash
npm test -- tests/truth-cases/runner.test.ts --run
# Should see 119 tests discovered (may fail, that's OK for now)
```

### Step 0.3: Map Production Code to Truth Cases (30 min)

**Objective:** Identify which source files implement each calculation.

**Method:** Grep for function names in truth case structure:

```bash
# XIRR
rg "calculateXIRR|xirr" --type ts server/

# Waterfall
rg "calculateWaterfall|waterfall" --type ts server/ client/

# Fees
rg "calculateFees|managementFee|performanceFee" --type ts server/

# Capital Allocation
rg "allocateCapital|capital.*allocation" --type ts server/

# Exit Recycling
rg "recycl" --type ts server/
```

**Capture:** File paths in `docs/phase0-validation-report.md` (Appendix: Code
Map)

**Example Output:**

```
XIRR: server/analytics/xirr.ts (line 42: export function calculateXIRR)
Waterfall (Tier): server/analytics/waterfall-tier.ts
Waterfall (Ledger): server/analytics/waterfall-ledger.ts
...
```

**Skill Activation:** `pattern-recognition` - Identify common patterns across
modules.

### Step 0.4: Spot-Check Low/Medium Confidence Cases (1.5 hours)

**Objective:** Manually verify 6 truth cases from LOW/MEDIUM confidence modules.

**Why:** Some truth cases have unknown origin (Capital Allocation: 1,381 lines).
Need human validation before trusting them.

**Selection Criteria:**

- 1 MEDIUM (Waterfall Tier): T08 (complex multi-tier scenario)
- 1 MEDIUM (Waterfall Ledger): L08 (shortfall-based partial clawback)
- 2 LOW (Capital Allocation): CA01, CA15 (unknown origin)
- 2 LOW (Exit Recycling): ER01, ER08 (needs investigation)

**Validation Method:**

| Scenario | Method                | Tools                                                                                         | Expected Time |
| -------- | --------------------- | --------------------------------------------------------------------------------------------- | ------------- |
| T08      | Excel waterfall model | Spreadsheet trace                                                                             | 20 min        |
| L08      | Ledger trace          | Paper/calculator (shortfall-based partial clawback - verify GP carry limited by LP shortfall) | 20 min        |
| CA01     | Code walkthrough      | VS Code debugger                                                                              | 15 min        |
| CA15     | Code walkthrough      | VS Code debugger                                                                              | 15 min        |
| ER01     | Logic check           | Review config semantics                                                                       | 10 min        |
| ER08     | Logic check           | Review timing windows                                                                         | 10 min        |

**Agent Delegation:** For L08 (clawback), invoke `waterfall-specialist` agent to
review shortfall calculation semantics.

**Outcome:** Mark each as VERIFIED or FLAG FOR INVESTIGATION.

**Deliverable:** Update provenance table in `docs/phase0-validation-report.md`.

### Step 0.5: Run Truth Case Suite (1 hour)

**Objective:** Execute all 119 scenarios, capture pass/fail by module.

```bash
/test-smart truth-cases
# Fallback: npm test -- tests/truth-cases/runner.test.ts --run --reporter=verbose
```

**Capture:**

- Module-level results (e.g., XIRR: 45/50, Waterfalls: 28/29, Fees: 9/10)
- Specific failing scenarios
- Error messages (type errors, missing functions, wrong values)

**Expected Outcome:**

- **Best case:** 95%+ pass (proceed to Phase 1A)
- **Moderate:** 70-94% pass (proceed to Phase 1B)
- **Worst case:** <70% pass (proceed to Phase 1C)

### Step 0.6: Triage Failures (1 hour)

**Objective:** Classify each failure as CODE BUG, TRUTH CASE ERROR, or MISSING
FEATURE.

**Process:**

1. For each failing scenario:
   - Review error message
   - Inspect production code
   - Compare to truth case JSON
   - **Agent Delegation:** Invoke `test-repair` agent for automated triage

2. Classification:
   - **CODE BUG:** Production code logic is wrong (fix in Phase 1)
   - **TRUTH CASE ERROR:** JSON has incorrect expected value (fix JSON
     immediately)
   - **MISSING FEATURE:** Function doesn't exist yet (document for Phase 1C)

**Deliverable:** `docs/failure-triage.md` with 3 sections.

**Skill Activation:** `root-cause-tracing` - Trace backward from failure to root
cause.

### Step 0.7: Update Truth Cases (30 min)

**Objective:** Fix any TRUTH CASE ERRORs found in Step 0.6.

**Method:**

1. Edit `docs/*.truth-cases.json` files
2. Re-run affected scenarios:
   ```bash
   npm test -- tests/truth-cases/runner.test.ts -t "scenario-name"
   ```
3. Verify fix

**Commit:**

```bash
git add docs/*.truth-cases.json
git commit -m "fix(truth-cases): correct expected values for [scenarios]"
```

### Step 0.7a: Truth Case Runner Semantics (Included in 0.2)

**Objective:** Document how runner handles complex JSON structures.

**Key Semantics:**

1. **Numeric Precision:**

   ```typescript
   // Use toBeCloseTo for all numeric fields
   expect(result.totals.paidIn).toBeCloseTo(tc.expected.totals.paidIn, 6);
   expect(result.totals.dpi).toBeCloseTo(tc.expected.totals.dpi, 6);
   ```

2. **Null vs Undefined:**

   ```typescript
   // gpClawback: null in JSON means "expect undefined in code"
   if (tc.expected.totals.gpClawback === null) {
     expect(result.totals.gpClawback).toBeUndefined();
   }
   ```

3. **Strip Notes:**

   ```typescript
   // Ignore "notes" fields (documentation only)
   const { notes, ...expectedData } = tc.expected.totals;
   ```

4. **Range Assertions:**

   ```typescript
   // For recycled_min/max
   if (tc.expected.totals.recycled_min !== undefined) {
     expect(result.totals.recycled).toBeGreaterThanOrEqual(
       tc.expected.totals.recycled_min
     );
     expect(result.totals.recycled).toBeLessThanOrEqual(
       tc.expected.totals.recycled_max
     );
   }
   ```

5. **Row-Based Validation:**
   ```typescript
   // Some scenarios validate quarterly rows instead of totals
   if (tc.expected.rows) {
     tc.expected.rows.forEach((expectedRow, i) => {
       expect(result.rows[i].lpCapitalReturn).toBeCloseTo(
         expectedRow.lpCapitalReturn,
         6
       );
       expect(result.rows[i].gpCarry).toBeCloseTo(expectedRow.gpCarry, 6);
     });
   }
   ```

**Reference Implementation:** See `tests/truth-cases/validation-helpers.ts` for
canonical helper functions.

### Step 0.8: Regression Check (30 min)

**Objective:** Verify existing test suite didn't regress.

**Why:** Adding truth case runner might have broken existing tests.

```bash
/test-smart
# Fallback: npm test -- --run
```

**Compare to Step 0.1 baseline:**

- Pass rate should be >= baseline (e.g., 74.7%)
- If lower, investigate regressions

**Skill Activation:** `verification-before-completion` - Confirm no regressions
before proceeding.

### Step 0.9: Cross-Validation (Optional, 1 hour)

**Objective:** Where possible, cross-validate truth cases against independent
sources.

**Examples:**

1. **XIRR:** Re-run 5 scenarios through Excel `XIRR()` function
   - Pick edge cases: negative returns, single cashflow, long duration
   - Manual entry → verify within ±0.0001%

2. **Waterfall (Tier vs Ledger):** Run simple scenarios through BOTH engines
   - Single contribution, single exit, no recycling, no clawback
   - Tier and Ledger should produce identical results
   - **WARNING:** Cross-validation ONLY applies to single-exit scenarios WITHOUT
     clawback/recycling. Clawback scenarios (L08, L09, etc.) cannot be
     cross-validated with tier-based engine.

3. **Fees:** Verify 2% management fee calculation manually
   - $10M commitment → $200K annual fee

**Deliverable:** Document validation results in
`docs/phase0-validation-report.md`.

**Agent Delegation:** Invoke `multi-model-consensus` skill for complex logic
validation (NOT for arithmetic).

### Step 0.10: Decision Gate - Route to Phase 1A/1B/1C (30 min)

**Objective:** Based on results, choose Phase 1 path.

**Module-Specific Pass Rate Requirements:**

| Module                    | 1A Threshold (Cleanup)                     | 1B Threshold (Bug Fix) | 1C Trigger (Rebuild) |
| ------------------------- | ------------------------------------------ | ---------------------- | -------------------- |
| XIRR                      | 100% (50/50 - zero failures allowed)       | >= 80% (40/50)         | < 80%                |
| Waterfall (tier + ledger) | >= 95% (28/29 combined - max 1-2 failures) | >= 70% (21/29)         | < 70%                |
| Fees                      | >= 90% (9/10)                              | >= 60% (6/10)          | < 60%                |
| Capital Allocation        | >= 80% (16/20)                             | >= 50% (10/20)         | < 50%                |
| Exit Recycling            | >= 80% (8/10)                              | >= 50% (5/10)          | < 50%                |

**Decision Logic:**

```
IF (R_tests >= 70%) AND
   (XIRR == 100%) AND
   (Waterfalls >= 95%) AND
   (Fees >= 90%) AND
   (Capital Allocation >= 80%) AND
   (Exit Recycling >= 80%):
    → PROCEED to Phase 1A (Cleanup Path)
    → Timeline: 1-2 weeks (optimized to 4-5 days)

ELIF (R_tests >= 50%) AND
     (XIRR >= 80%) AND
     (Waterfalls >= 70%) AND
     (Fees >= 60%) AND
     (Capital Allocation >= 50%) AND
     (Exit Recycling >= 50%):
    → PROCEED to Phase 1B (Bug Fix Path)
    → Timeline: 2-3 weeks (optimized to 12-15 days)

ELSE:
    → PROCEED to Phase 1C (Rebuild Path)
    → Timeline: 4-6 weeks
    → CRITICAL: If XIRR < 80%, this is SHOWSTOPPER (most user-visible)
```

**Why XIRR MUST BE 100% FOR 1A:**

- XIRR is the most user-visible calculation (appears on dashboards)
- Excel `XIRR()` function is authoritative (HIGH confidence truth cases)
- 50 existing test cases provide comprehensive coverage
- ANY XIRR failure indicates fundamental bug (not acceptable for Cleanup path)

**Why Waterfalls >= 95%:**

- Two implementations (tier + ledger) with 29 combined scenarios
- Max 1-2 failures acceptable for 1A (likely edge cases)
- Affects GP/LP distributions (high financial stakes)
- 95% = 28/29 passing (allows 1 edge case failure)

**Module-Level Reporting in Phase 0 Deliverable:**

Update `docs/phase0-validation-report.md` template to include:

```markdown
## Module-Level Pass Rates

| Module             | Pass Rate | 1A Threshold | Status      | Path       |
| ------------------ | --------- | ------------ | ----------- | ---------- |
| XIRR               | X/50 (X%) | 100%         | [PASS/FAIL] | [1A/1B/1C] |
| Waterfall (tier)   | X/15 (X%) | 95% combined | [PASS/FAIL] | [1A/1B/1C] |
| Waterfall (ledger) | X/14 (X%) | 95% combined | [PASS/FAIL] | [1A/1B/1C] |
| Fees               | X/10 (X%) | 90%          | [PASS/FAIL] | [1A/1B/1C] |
| Capital Allocation | X/20 (X%) | 80%          | [PASS/FAIL] | [1A/1B/1C] |
| Exit Recycling     | X/10 (X%) | 80%          | [PASS/FAIL] | [1A/1B/1C] |

**Aggregate Test Suite:** X% (R_tests threshold: 70% for 1A)

**Decision:** [1A/1B/1C] based on module-level gates above
```

**Skill Activation:** `verification-before-completion` - Final checkpoint before
Phase 1.

**Deliverable:** `docs/phase0-validation-report.md` with:

- Module-level pass rates
- Chosen path (1A/1B/1C)
- Rationale
- Next steps

---

## Phase 1A: Cleanup Path (Optimized: 4-5 days)

**Trigger:** Module gates met (XIRR 100%, Waterfalls ≥95%, etc.)

**Objective:** Harden calculation foundations without changing logic.

**Skills:** `systematic-debugging`, `test-driven-development`

**Commands:** `/fix-auto`, `/deploy-check`

### Step 1A.0: JSDoc Hotfix - Clawback Semantics (MANDATORY FIRST, 30 min)

**CRITICAL:** Fix JSDoc BEFORE agent work to prevent semantic confusion.

**Problem:** Current JSDoc says "hard floor" but implementation is
"shortfall-based partial clawback."

**Risk:** Agents read wrong semantics → "fix" correct code → introduce bugs.

**Solution:** Update JSDoc in waterfall config types IMMEDIATELY.

**Files to Update:**

- `shared/types/waterfall.ts` (or wherever `WaterfallConfig` is defined)
- `server/analytics/waterfall-ledger.ts` (implementation file)

**Ready-to-Paste JSDoc Snippet:**

```typescript
/**
 * LP hurdle multiple for clawback calculation (e.g., 1.1 = 110%).
 *
 * SEMANTICS: Shortfall-based partial clawback (NOT hard floor)
 * - GP carry is limited to the fund-level profit above the LP shortfall
 * - If LPs haven't achieved (capital + preferred return), GP carry is reduced proportionally
 * - NOT binary: clawback can be 0%, 50%, 100%, or any value in between
 * - NOT time-based: uses cumulative fund performance at liquidation
 *
 * EXAMPLE: 1.1x hurdle, fund at 1.1x
 * - Total contributions: $1M
 * - Exit proceeds: $1.1M (1.1x)
 * - Fund profit: $100K
 * - GP carry before clawback: $20K (20% of $100K)
 * - LP shortfall: $1.1M required - $1.096M distributed = $4K short
 * - GP clawback: $4K returned to LPs (partial, not full)
 * - GP carry net: $16K
 *
 * See truth case L08 for comprehensive example.
 *
 * @default 1.0 (100% - LPs must get capital back before GP earns carry)
 */
clawbackLpHurdleMultiple?: number;
```

**Verification:**

```bash
rg "hard floor" shared/ server/
# Expected: 0 results after fix
```

**Commit:**

```bash
git add shared/types/waterfall.ts server/analytics/waterfall-ledger.ts
git commit -m "docs(waterfall): fix clawback JSDoc semantics (shortfall-based, not hard floor)"
```

**Why This Is First:** Prevents agents from reading incorrect semantics and
"fixing" correct code.

### Step 1A.1: ESLint Configuration Tightening (1 hour)

**Objective:** Add rules to catch calculation precision bugs.

**New Rules (add to `eslint.config.js`):**

```javascript
{
  // Calculation precision rules
  rules: {
    // Ban parseFloat in calculation paths (P0 only)
    'no-restricted-syntax': [
      'error',
      {
        selector: 'CallExpression[callee.name="parseFloat"]',
        message: 'Use Decimal.js or parseInt for calculations. parseFloat loses precision.',
      }
    ],
    // Require explicit radix for parseInt
    'radix': 'error',
    // Ban implicit type coercion
    'no-implicit-coercion': ['error', { allow: ['!!'] }]
  },

  // Apply only to P0 calculation paths
  files: [
    'server/analytics/xirr.ts',
    'server/analytics/waterfall-*.ts',
    'server/analytics/fees.ts',
    'server/analytics/capital-allocation.ts',
    'server/analytics/exit-recycling.ts',
    'server/utils/financial.ts',
    'client/src/core/engines/*.ts'
  ]
}
```

**Verification:**

```bash
/fix-auto
# Fallback: npm run lint
```

**Expected:** Identify ~20 P0 parseFloat occurrences for manual review in Step
1A.6.

### Step 1A.2: TypeScript Strict Mode Ratchet (2 hours)

**Objective:** Enable stricter type checking incrementally.

**Current State:** Check `tsconfig.json`:

```bash
rg "strict|noImplicitAny|strictNullChecks" tsconfig.json
```

**Ratchet Strategy:**

1. Enable one strict flag at a time
2. Fix errors in calculation paths ONLY (P0)
3. Baseline non-P0 errors (defer to Phase 2)

**Order (by impact):**

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "noImplicitAny": true,           // Step 1: Explicit types
    "strictNullChecks": true,        // Step 2: Handle undefined
    "strictFunctionTypes": true,     // Step 3: Function signatures
    "noImplicitReturns": true        // Step 4: Exhaustive returns
  }
}
```

**For Each Flag:**

```bash
# Enable flag → build → capture errors
npm run check 2>&1 | tee errors-$FLAG.txt

# Count P0 errors (calculation paths)
rg "server/analytics|client/src/core/engines" errors-$FLAG.txt | wc -l

# If P0 errors < 20: fix immediately
# If P0 errors >= 20: baseline and defer
```

**Baseline Example:**

```typescript
// @ts-expect-error TS2322 - Baselined, fix in Phase 2
const x: number = getPotentiallyNull();
```

**Note:** Baseline is acceptable if:

1. Error is in non-P0 code (UI, tests, config)
2. P0 errors are fixed first
3. Baseline comment includes ticket number or phase reference

**Skill Activation:** `iterative-improvement` - Small cycles with verification.

### Step 1A.3: Dependency Precision Audit (1 hour)

**Objective:** Verify calculation libraries are configured correctly.

**Libraries to Audit:**

1. **Decimal.js:**

   ```bash
   rg "import.*Decimal|from 'decimal.js'" --type ts
   # Verify: import Decimal from 'decimal.js' (not 'decimal.js-light')
   # Check precision config: Decimal.set({ precision: 20 })
   ```

2. **date-fns:**
   ```bash
   rg "import.*date-fns" --type ts
   # Verify: No timezone assumptions in XIRR date handling
   ```

**Test:** Create precision validation test:

```typescript
// tests/unit/precision.test.ts
import Decimal from 'decimal.js';

it('maintains precision in chained operations', () => {
  const a = new Decimal('0.1');
  const b = new Decimal('0.2');
  const result = a.plus(b).toString();
  expect(result).toBe('0.3'); // NOT '0.30000000000000004'
});
```

### Step 1A.4: Truth Case Coverage Expansion (2 hours)

**Objective:** Add edge cases to LOW confidence modules.

**Target:** Capital Allocation (currently 20 scenarios, unknown origin)

**Agent Delegation:** Invoke `waterfall-specialist` to generate 5 new edge
cases:

1. Zero contribution scenario
2. Partial deployment (50% of committed capital)
3. Over-commitment (105% deployed)
4. Timing edge: contribution in last quarter
5. Multi-LP allocation with different commit amounts

**Method:**

1. Review existing 20 scenarios in `docs/capital-allocation.truth-cases.json`
2. Identify gaps (e.g., no zero scenarios, no over-commitment)
3. Hand-create 5 new scenarios
4. Validate manually before adding to JSON

**Deliverable:** `docs/capital-allocation.truth-cases.json` updated to 25
scenarios.

### Step 1A.5: Calculation Path Isolation (2 hours)

**Objective:** Extract pure calculation functions from business logic.

**Example - Before (mixed):**

```typescript
// server/routes/analytics.ts (BAD: calculation mixed with HTTP)
app.post('/api/xirr', (req, res) => {
  const { cashflows } = req.body;
  // Validation
  // ... 50 lines of XIRR calculation inline ...
  res.json({ xirr: result });
});
```

**After (separated):**

```typescript
// server/analytics/xirr.ts (GOOD: pure function)
export function calculateXIRR(cashflows: Cashflow[]): Decimal {
  // ... calculation only ...
}

// server/routes/analytics.ts (GOOD: orchestration only)
app.post('/api/xirr', (req, res) => {
  const { cashflows } = req.body;
  validateCashflows(cashflows);
  const result = calculateXIRR(cashflows);
  res.json({ xirr: result.toString() });
});
```

**Target Files:**

- `server/analytics/xirr.ts` (extract pure function)
- `server/analytics/waterfall-tier.ts` (extract pure function)
- `server/analytics/waterfall-ledger.ts` (extract pure function)

**Verification:** Each calculation function should:

- Be pure (no side effects)
- Accept only calculation inputs
- Return only calculation results
- Be testable in isolation

### Step 1A.6: parseFloat Eradication (P0 Only, 2 hours)

**Objective:** Replace parseFloat with Decimal.js in calculation paths (P0).

**Scope:** ~20 occurrences in P0 files (per parseFloat triage table).

**Process:**

1. Identify all P0 parseFloat usages:

   ```bash
   rg "parseFloat" server/analytics/ client/src/core/engines/
   ```

2. For each occurrence, classify:
   - **Calculation:** Replace with `new Decimal(value)`
   - **Config/ENV:** Replace with `parseInt(value, 10)` if integer, else Decimal
   - **False positive:** If in comment or string, ignore

3. Pattern replacements:

   ```typescript
   // BEFORE
   const amount = parseFloat(input);
   const rate = parseFloat(config.rate);

   // AFTER
   const amount = new Decimal(input);
   const rate = new Decimal(config.rate);
   ```

4. Re-run truth cases after each file:
   ```bash
   npm test -- tests/truth-cases/runner.test.ts --run
   ```

**Agent Delegation:** If any replacement causes test failures, invoke
`systematic-debugging` skill for root cause analysis.

**Commit:**

```bash
git add server/analytics/ client/src/core/engines/
git commit -m "refactor(calc): replace parseFloat with Decimal.js in P0 paths"
```

### Step 1A.7: Documentation Sync (1 hour)

**Objective:** Update calculation docs to match code reality.

**Files to Update:**

- `docs/calculations.md` (if exists)
- `README.md` (calculation overview section)
- JSDoc in calculation files

**Key Additions:**

1. Precision guarantees (Decimal.js, 20 digits)
2. Clawback semantics (shortfall-based partial, not hard floor)
3. Truth case references (link to JSON files)

**Example:**

```markdown
## Waterfall Calculations

### Clawback Implementation

**Type:** Shortfall-based partial clawback

**Semantics:**

- GP carry is limited by fund-level profit above LP shortfall
- NOT a binary "all or nothing" clawback
- See `docs/waterfall-ledger.truth-cases.json` scenario L08 for example

**Truth Cases:** 14 scenarios covering:

- No carry (L01)
- Profit carry (L02)
- Multiple exits (L03)
- Partial clawback (L08)
- Full clawback (L11)
```

### Step 1A.8: Final Validation (1 hour)

**Objective:** Verify all changes maintain or improve test pass rate.

**Commands:**

```bash
/deploy-check
# Includes: type check, lint, test, build, smoke test
```

**Gate Criteria:**

- [ ] Truth case pass rate >= Phase 0 baseline
- [ ] Overall test pass rate >= Phase 0 baseline (e.g., 74.7%)
- [ ] Zero new TypeScript errors in P0 files
- [ ] Zero new lint errors in P0 files
- [ ] Build succeeds
- [ ] No console errors in smoke test

**Skill Activation:** `verification-before-completion` - MANDATORY before
Phase 2.

**Deliverable:** `docs/phase1a-completion-report.md` with:

- Before/after metrics
- Changes summary
- Remaining technical debt (P1-P3 parseFloat, non-P0 TypeScript errors)

---

## Phase 1B: Bug Fix Path (Optimized: 12-15 days)

**Trigger:** Module gates partially met (XIRR ≥80%, Waterfalls ≥70%, etc.)

**Objective:** Fix calculation bugs, then proceed with cleanup.

**Skills:** `systematic-debugging`, `root-cause-tracing`,
`test-driven-development`

**Process:**

1. Complete Phase 1A Steps 1A.0-1A.3 (environment + tooling)
2. For each failing module:
   - Apply `systematic-debugging` skill
   - Trace root cause with `root-cause-tracing`
   - Fix bug
   - Re-run truth cases
3. Once module gates met, proceed with Phase 1A cleanup steps

**Agent Delegation:** Heavy use of `test-repair` and `waterfall-specialist`
agents.

---

## Phase 1C: Rebuild Path (4-6 weeks)

**Trigger:** Critical failures (XIRR <80% or multiple modules <50%)

**Objective:** Rebuild calculation modules from scratch using truth cases as
spec.

**NOT DETAILED HERE** - Would require full design doc if triggered.

---

## Success Criteria

### Module-Level Pass Rate Requirements (Linked to Decision Gates)

The following pass rates determine Phase 1 path selection (per Step 0.10):

**Phase 1A (Cleanup) Requirements:**

- XIRR: 50/50 (100% - zero failures allowed)
- Waterfall (Tier): 15/15 or 14/15 (≥95%)
- Waterfall (Ledger): 14/14 or 13/14 (≥95%)
- Fees: 9/10 (90%)
- Capital Allocation: 16/20 (80%)
- Exit Recycling: 8/10 (80%)

**Phase 1B (Bug Fix) Thresholds:**

- XIRR: 40/50 (80%)
- Waterfalls: 21/29 combined (70%)
- Fees: 6/10 (60%)
- Capital Allocation: 10/20 (50%)
- Exit Recycling: 5/10 (50%)

**Below these thresholds → Phase 1C (Rebuild)**

### Module-Level Truth Case Checkboxes

| Module             | Target      | Status | Priority                      | 1A Threshold |
| ------------------ | ----------- | ------ | ----------------------------- | ------------ |
| XIRR               | 50/50       | [ ]    | 1 (SHOWSTOPPER if <100%)      | 100%         |
| Waterfall (Tier)   | 15/15       | [ ]    | 2 (Excel parity critical)     | 95% combined |
| Waterfall (Ledger) | 14/14       | [ ]    | 2 (Clawback complexity)       | 95% combined |
| Fees               | 10/10       | [ ]    | 3 (simple arithmetic)         | 90%          |
| Capital Allocation | 20/20       | [ ]    | 4 (low provenance confidence) | 80%          |
| Exit Recycling     | 10/10       | [ ]    | 5 (low provenance confidence) | 80%          |
| **Total**          | **119/119** | [ ]    |                               | Overall: 70% |

### Code Quality Gates

- [ ] TypeScript: Zero errors in P0 files (calculation paths)
- [ ] TypeScript: Non-P0 errors baselined with `@ts-expect-error` comments
- [ ] ESLint: Zero errors in P0 files
- [ ] ESLint: P1-P3 violations documented in `.eslintrc-baseline.json`
- [ ] Build: Clean production build
- [ ] Coverage: Calculation paths ≥90% line coverage

### Documentation Completeness

- [ ] `docs/phase0-validation-report.md` exists with module-level results
- [ ] `docs/failure-triage.md` classifies all failures
- [ ] Calculation files have accurate JSDoc (especially clawback semantics)
- [ ] `CHANGELOG.md` updated with Phase 0 + Phase 1A changes

---

## Appendix A: Skills and Agent Reference

### Skills Framework (22 Skills)

**Mandatory Skills (Auto-Activate):**

- `systematic-debugging` - Root cause analysis before fixes (NO FIXES WITHOUT
  ROOT CAUSE)
- `verification-before-completion` - Checkpoint at phase gates
- `test-driven-development` - RED-GREEN-REFACTOR discipline

**Situational Skills (Invoke Explicitly):**

- `multi-model-consensus` - Complex logic validation (AI for logic, Excel for
  math)
- `root-cause-tracing` - Backward trace from failures
- `iterative-improvement` - Small cycles with verification
- `pattern-recognition` - Anti-pattern detection
- `inversion-thinking` - Failure mode analysis

**Usage:** Skills auto-activate based on context. Explicitly invoke for complex
scenarios.

### Agents (23 Agents)

**Specialized Agents:**

- `waterfall-specialist` - Memory of waterfall edge cases, clawback semantics
- `test-repair` - Automated failure triage and fix suggestions
- `code-reviewer` - CLAUDE.md compliance checks
- `perf-guard` - Bundle analysis and performance regression detection
- `db-migration` - Schema validation

**Usage:** Invoke agents when task requires specialized knowledge or memory.

### Slash Commands

**Project Commands:**

- `/test-smart` - Intelligent test selection (fallback: `npm test -- --changed`)
- `/fix-auto` - Automated repairs (fallback: `npm run lint:fix`)
- `/deploy-check` - 8-phase validation (fallback: manual checks)

**Superpowers Commands:**

- `/superpowers:brainstorm` - Socratic design refinement
- `/superpowers:write-plan` - Detailed implementation plans
- `/superpowers:execute-plan` - Batch execution with review checkpoints

---

## Appendix B: File Reference

| Category           | Files                                    | Purpose                                                                               | Truth Cases |
| ------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------- | ----------- |
| XIRR               | `server/analytics/xirr.ts`               | Internal rate of return                                                               | 50          |
| Waterfall (Tier)   | `server/analytics/waterfall-tier.ts`     | GP/LP split (tier-based)                                                              | 15          |
| Waterfall (Ledger) | `server/analytics/waterfall-ledger.ts`   | GP/LP split (ledger-based, implements shortfall-based partial clawback per LPA terms) | 14          |
| Fees               | `server/analytics/fees.ts`               | Management + performance fees                                                         | 10          |
| Capital Allocation | `server/analytics/capital-allocation.ts` | Deploy capital to deals                                                               | 20          |
| Exit Recycling     | `server/analytics/exit-recycling.ts`     | Reinvest proceeds                                                                     | 10          |
| Truth Cases        | `docs/*.truth-cases.json`                | Expected outputs                                                                      | 119 total   |
| Runner             | `tests/truth-cases/runner.test.ts`       | Unified test harness                                                                  | N/A         |

---

## Version History

| Version  | Date       | Changes                                                              |
| -------- | ---------- | -------------------------------------------------------------------- |
| v2.18    | 2025-12-08 | Initial comprehensive plan (GitHub commit 375ea58, internally v2.29) |
| v2.23    | 2025-12-09 | Skills/agents/commands integration                                   |
| v2.23-A1 | 2025-12-09 | **ADDENDUM:** Restored 4 critical sections from v2.18/v2.29          |
| v2.30    | 2025-12-09 | Merged v2.29 foundation + v2.23 enhancements                         |
| v2.31    | 2025-12-09 | **CURRENT:** Plan ↔ JSON synchronized, verification gates refined   |

### v2.31 Changes

**Plan ↔ JSON Synchronization:**

1. Updated ledger scenario count: 14 (L14 completed, L15 deleted)
2. Total truth cases: 119 (50 + 15 + 14 + 10 + 20 + 10)
3. Exit recycling reduced: 10 scenarios (from 20, per actual file)

**Verification Gate Refinements:** 4. Step 0.7a: Truth case runner semantics
(use `toBeCloseTo` for numeric comparisons, handle null vs undefined, strip
notes, range assertions) 5. Step 1A.0: JSDoc hotfix with ready-to-paste snippet
(fix clawback semantics BEFORE agent work) 6. Commands: Added fallback npm
commands for all slash commands 7. TypeScript ratchet: Clarified dynamic
baseline acceptable for non-P0 code

**Other Changes:** 8. Removed aggregate time savings claims (will report actual
vs estimated post-execution)

---

**End of Plan**

---

## Quick Reference

**Phase 0 Commands:**

```bash
# Pre-flight
npm test -- --run | head -20

# Baseline
npm test -- --coverage --run

# Truth case runner
npm test -- tests/truth-cases/runner.test.ts --run

# Decision gate
# Check module-level pass rates against table in Step 0.10
```

**Phase 1A Commands:**

```bash
# JSDoc hotfix (MANDATORY FIRST)
rg "hard floor" shared/ server/

# Lint + fix
/fix-auto

# Type check
npm run check

# Deploy validation
/deploy-check
```

**Common Pitfalls:**

1. Skipping Step 1A.0 JSDoc hotfix → agents read wrong semantics
2. Using aggregate pass rate instead of module-level gates → wrong path
3. Fixing non-P0 parseFloat before P0 → scope creep
4. Using strict equality (`toBe`) for numeric comparisons → precision failures
5. Not stripping `notes` fields before comparison → false failures
