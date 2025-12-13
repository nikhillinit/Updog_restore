> **DEPRECATED:** Superseded by `docs/PHOENIX-SOT/execution-plan-v2.34.md` This
> file is retained for historical reference only. Do not use for active
> development.

# Phoenix Execution Plan v2.33 - Phoenix Agent Integration

**Date:** December 10, 2025 **Status:** DEPRECATED **Author:** Solo Developer
**Approach:** Validation-First, Evidence-Driven, Agent-Enhanced

**Version Note:** v2.33 = v2.32 + 9 Phoenix agents (specialized for truth case
validation, precision, waterfall, XIRR, docs, forecasting, reserves, branding)

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

**Timeline (Baseline):**

- **Best case:** 5-8 days (calculations work + automation saves time)
- **Moderate case:** 12-15 days (bug fixes + agent assistance)
- **Worst case:** 4-6 weeks (rebuild path)

**Timeline (Optimized with v2.32 Commands):**

- **Best case:** 4-6 days (was 5-8 days) - automated validation + parallel
  execution
- **Moderate case:** 8-10 days (was 12-15 days) - smart debugging + parallel bug
  fixes
- **Worst case:** 3-4 weeks (was 4-6 weeks) - structured rebuild with coverage
  enforcement

**Time Savings:** 6.5 hours cumulative across all phases (10.5 hours manual → 4
hours automated)

**Optimization Strategy:**

- Leverage 50 existing XIRR test cases (don't rebuild)
- Delegate to memory-enabled agents (waterfall-specialist, test-repair)
- **NEW in v2.32:** Use 40+ specialized commands (`/defense-in-depth`,
  `/error-diagnostics:smart-debug`, `/dispatching-parallel-agents`)
- **NEW in v2.32:** MANDATORY phase gates with evidence-based validation
  (`/verification-before-completion`)
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

**IMPORTANT**: This section lists core commands only. See
`cheatsheets/slash-commands-phoenix.md` for complete inventory of 30+ commands
from user-level and 18+ plugins.

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

**Additional User-Level Commands (30+ total):**

- `/bugfix <error>` - **CRITICAL for Phase 1B**: Automated bug fix workflow with
  90% quality gate
  - Workflow: bugfix → verify (score 0-100%) → iterate until ≥90%
  - Use: All Phase 1B bug fixes (primary workflow)
- `/debug <task>` - Systematic debugging with user confirmation
  - Workflow: Hypothesis generation (5-7) → Multi-agent analysis → UltraThink
    reflection → User confirmation → Solution
  - Use: Complex bugs requiring hypothesis testing
- `/dev <feature>` - End-to-end workflow with mandatory 90% test coverage
  - Workflow: Requirements → Codex analysis → Parallel execution → Coverage
    validation
  - Use: Phase 1B features requiring high test coverage
- `/ask <question>` - Senior architect consultation with 4-expert panel
  - Use: Phase 0 Step 0.4 (architecture validation), Phase 1B (strategic
    decisions)
- `/test <component>` - Comprehensive test strategy with 4 testing specialists
  - Use: Phase 0 Step 0.2 (truth case runner), Phase 1A Step 1A.3 (precision
    tests)
- `/code <feature>` - Direct implementation with 4 coding specialists
  - Use: Phase 1A Step 1A.5 (calculation path isolation)
- `/think <task>` - Multi-agent coordinator with ultrathink reflection
  - Use: Phase 1A Step 1A.4 (truth case expansion)
- `/refactor <task>` - Refactoring coordination
  - Use: Phase 1A Step 1A.5 (extract pure functions)
- `/docs <topic>` - Documentation generation
  - Use: Phase 1A Step 1A.7 (documentation sync)
- `/review` - Code review workflow
  - Use: Phase 1A Step 1A.8 (final validation)
- `/commit-push-pr` - One-command commit + push + PR creation
  - Use: After Phase 0, Phase 1A, Phase 1B completion

**Plugin Commands (18+ plugins):**

- `/code-review:code-review` - Automated code analysis
- `/test-coverage-analyzer:analyze-coverage` - Coverage metrics analysis
- `/regression-test-tracker:track-regression` - Track regressions

**Superpowers Commands (Plugin):**

- `/superpowers:brainstorm` - Socratic design refinement
- `/superpowers:write-plan` - Detailed implementation plans
- `/superpowers:execute-plan` - Batch execution with review checkpoints

**Usage Notes:**

- Skills auto-activate (e.g., `systematic-debugging` when debugging)
- Invoke agents explicitly when specialized knowledge needed
- Use slash commands for common workflows; fallback to npm if unavailable
- **See `cheatsheets/slash-commands-phoenix.md` for complete command reference,
  comparison matrices, and phase-specific recommendations**

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

### Step 0.2: Truth Case Runner Setup (30-40 min, OPTIMIZED with Phoenix Agent)

**Objective:** Create unified runner for all 6 truth case JSON files.

**Why Needed:** No existing test harness loads these JSON files. We need to
create one.

**Location:** `tests/truth-cases/runner.test.ts`

**RECOMMENDED AGENT:** `phoenix-truth-case-runner`

- Specialized for building and executing truth case validation suites
- Integrates with `validation-helpers.ts` for semantic comparison logic
- Memory of truth case patterns from cross-session learning

**METHOD (RECOMMENDED): Use Phoenix agent or `/dev` workflow for automated
implementation**

```bash
/dev "Create truth case runner at tests/truth-cases/runner.test.ts that:
- Loads 6 JSON files: xirr.truth-cases.json, waterfall-tier.truth-cases.json, waterfall-ledger.truth-cases.json, fees.truth-cases.json, capital-allocation.truth-cases.json, exit-recycling.truth-cases.json
- Uses toBeCloseTo(expected, 6) for ALL numeric comparisons (NOT strict equality)
- Handles null vs undefined: gpClawback: null in JSON → expect undefined in code
- Strips 'notes' fields from expectations before comparison
- Supports range assertions: recycled_min/max → toBeGreaterThanOrEqual/toBeLessThanOrEqual
- Creates test suites for each module (6 describe blocks)
- 90% test coverage for runner helper functions
- Reference implementation: tests/unit/waterfall-truth-table.test.ts (proven JSON loading pattern)

Requirements:
1. Each truth case JSON has array of scenarios with { scenario, input, expected }
2. Waterfall ledger has complex structure: expected.totals vs expected.rows
3. Helper functions should be extracted for reusability
4. Test descriptions should use tc.scenario for clarity

Test Command: npm test -- tests/truth-cases/runner.test.ts --run"
```

**What `/dev` Does**:

1. **Requirements clarification** - Confirms numeric precision, null handling,
   etc.
2. **Codex deep analysis** - Analyzes `tests/unit/waterfall-truth-table.test.ts`
   pattern
3. **Dev plan generation** - Breaks into 2-3 parallelizable tasks:
   - Task 1: JSON loading and schema validation
   - Task 2: Assertion helper functions (toBeCloseTo, stripNotes, handleNull)
   - Task 3: Test suites for 6 modules
4. **Parallel execution** - Codex executes tasks concurrently
5. **Coverage validation** - Ensures ≥90% coverage for helpers
6. **Completion summary** - Provides structured deliverable report

**Time Estimate**: 30-40 min (was 1 hour manual)

**Benefits**:

- ✓ Automated task breakdown via Codex
- ✓ Parallel execution of independent tasks
- ✓ Built-in 90% coverage validation
- ✓ Structured `dev-plan.md` documentation
- ✓ Reference pattern analysis (waterfall-truth-table.test.ts)

**POST-IMPLEMENTATION VALIDATION:**

```bash
# After /dev completes, validate test reliability
/testing-anti-patterns --scan="tests/truth-cases/runner.test.ts"
/condition-based-waiting --scan="tests/truth-cases/runner.test.ts"
```

**FALLBACK (Manual Implementation):**

If `/dev` unavailable or fails, implement manually:

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

**Agent Invocation:**

```bash
# Use phoenix-truth-case-runner agent for building runner
Task("phoenix-truth-case-runner", "Build unified runner.test.ts with validation-helpers.ts integration")
```

**Fallback:** If Phoenix agent unavailable, invoke `test-repair` agent with
context.

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

**RECOMMENDED AGENTS:**

- `waterfall-specialist` - L08 clawback validation (shortfall-based semantics)
- `phoenix-capital-allocation-analyst` - CA01, CA15 investigation (LOW
  confidence modules)
- `xirr-fees-validator` - Cross-check XIRR scenarios against Excel (Phase 0 Step
  0.9)

**RECOMMENDED COMMANDS:**

- `/comprehensive-review:full-review` - Exhaustive validation of L08 clawback
  semantics
- `/multi-model-consensus` - Cross-validate edge cases with multiple AI models

**Validation Method:**

| Scenario | Method                | Tools                                                                                         | Expected Time |
| -------- | --------------------- | --------------------------------------------------------------------------------------------- | ------------- |
| T08      | Excel waterfall model | Spreadsheet trace                                                                             | 20 min        |
| L08      | Ledger trace          | Paper/calculator (shortfall-based partial clawback - verify GP carry limited by LP shortfall) | 20 min        |
| CA01     | Code walkthrough      | VS Code debugger                                                                              | 15 min        |
| CA15     | Code walkthrough      | VS Code debugger                                                                              | 15 min        |
| ER01     | Logic check           | Review config semantics                                                                       | 10 min        |
| ER08     | Logic check           | Review timing windows                                                                         | 10 min        |

**Agent Invocation Examples:**

```bash
# L08 clawback validation
Task("waterfall-specialist", "Validate L08 clawback scenario - verify shortfall-based partial implementation")

# CA01/CA15 spot-check
Task("phoenix-capital-allocation-analyst", "Investigate CA01 and CA15 LOW confidence scenarios - validate allocation logic")

# Excel parity cross-check (Step 0.9)
Task("xirr-fees-validator", "Cross-check XIRR edge cases X05, X07, X09 against Excel XIRR() function")
```

**Command Example (L08 Validation)**:

```bash
/comprehensive-review:full-review --focus="Clawback semantics in waterfall-ledger.ts - verify shortfall-based partial implementation matches L08 truth case"
```

**Outcome:** Mark each as VERIFIED or FLAG FOR INVESTIGATION.

**Deliverable:** Update provenance table in `docs/phase0-validation-report.md`.

### Step 0.5: Run Truth Case Suite (1 hour)

**Objective:** Execute all 119 scenarios, capture pass/fail by module.

**RECOMMENDED AGENT:** `phoenix-truth-case-runner`

- Executes unified suite, computes module-level pass rates
- Classifies failures by type (CODE BUG / TRUTH CASE ERROR / MISSING FEATURE)
- Generates `docs/phase0-validation-report.md` automatically

**Agent Invocation:**

```bash
# Run full truth case suite with pass rate computation
Task("phoenix-truth-case-runner", "Run full truth case suite and compute module-level pass rates")
```

**Fallback Command:**

```bash
/test-smart truth-cases
# Fallback: npm test -- tests/truth-cases/runner.test.ts --run --reporter=verbose
```

**RECOMMENDED COMMANDS:**

- `/analyzing-test-coverage` - Analyze code paths covered by 119 truth cases
- `/test-coverage-analyzer:analyze-coverage` - Export coverage metrics

**Example (Coverage Analysis)**:

```bash
/analyzing-test-coverage --suite="tests/truth-cases/runner.test.ts" --report-uncovered-paths
```

**Capture:**

- Module-level results (e.g., XIRR: 45/50, Waterfalls: 28/29, Fees: 9/10)
- Specific failing scenarios
- Error messages (type errors, missing functions, wrong values)
- **Coverage gaps** (which code paths aren't tested by truth cases)

**Expected Outcome:**

- **Best case:** 95%+ pass (proceed to Phase 1A)
- **Moderate:** 70-94% pass (proceed to Phase 1B)
- **Worst case:** <70% pass (proceed to Phase 1C)

### Step 0.6: Triage Failures (1 hour)

**Objective:** Classify each failure as CODE BUG, TRUTH CASE ERROR, or MISSING
FEATURE.

**RECOMMENDED AGENT:** `phoenix-truth-case-runner`

- Automated failure classification with severity scoring
- Generates structured `docs/failure-triage.md` output
- Recommends Phase 1 path based on failure patterns

**Agent Invocation:**

```bash
# Classify failures from Step 0.5 run
Task("phoenix-truth-case-runner", "Classify XIRR/Waterfall/Fees failures in docs/failure-triage.md with severity scoring")
```

**RECOMMENDED COMMANDS:**

- `/error-diagnostics:error-analysis` - **MANDATORY** - Automated classification
  with severity scoring
- `/error-diagnostics:smart-debug` - Auto-classify bugs as simple vs complex

**Process:**

1. **Automated Triage with Phoenix Agent** (RECOMMENDED):

   ```bash
   Task("phoenix-truth-case-runner", "Triage all 119 scenarios - classify CODE BUG / TRUTH CASE ERROR / MISSING FEATURE")
   ```

2. **Automated Triage with Command** (alternative):

   ```bash
   /error-diagnostics:error-analysis --failures="<paste npm test output>" --classify --export-to="docs/failure-triage.md"
   ```

   - Provides structured error classification
   - Severity scoring (P0-P3)
   - Root cause hints
   - Automated categorization: CODE BUG vs TRUTH CASE ERROR vs MISSING FEATURE

3. **Manual Triage** (fallback):
   - For each failing scenario:
     - Review error message
     - Inspect production code
     - Compare to truth case JSON
     - **Agent Delegation:** Invoke `test-repair` agent for automated triage

4. Classification:
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

**RECOMMENDED COMMANDS:**

- `/tracking-regression-tests` - **MANDATORY** - Compare against Step 0.1
  baseline
- `/regression-test-tracker:track-regression` - Track pass rate trends

**Example (Regression Tracking)**:

```bash
/tracking-regression-tests --baseline="phase0-step-0.1-baseline.json" --current="phase0-step-0.8-run.json" --report-new-failures --alert-if-pass-rate-drops
```

**Compare to Step 0.1 baseline:**

- Pass rate should be >= baseline (e.g., 74.7%)
- If lower, investigate regressions
- **Track NEW failures** (not present in baseline)

**Skill Activation:** `verification-before-completion` - Confirm no regressions
before proceeding.

### Step 0.9: Cross-Validation (Optional, 1 hour)

**Objective:** Where possible, cross-validate truth cases against independent
sources.

**RECOMMENDED AGENT:** `xirr-fees-validator`

- Cross-checks XIRR truth cases against Excel `XIRR()` function
- Validates fee calculations (2% management fee, performance fee timing)
- Memory of Excel parity patterns from prior validations

**Agent Invocation:**

```bash
# Excel parity cross-check for XIRR edge cases
Task("xirr-fees-validator", "Cross-check XIRR truth cases X05, X07, X09 against Excel XIRR() function - verify within ±0.0001%")

# Fee calculation validation
Task("xirr-fees-validator", "Validate fee timing for 2% management fee on $10M commitment")
```

**RECOMMENDED COMMANDS:**

- `/multi-model-consensus` - Cross-validate XIRR edge cases with multiple AI
  models

**Examples:**

1. **XIRR:** Re-run 5 scenarios through Excel `XIRR()` function
   - Pick edge cases: negative returns, single cashflow, long duration
   - Manual entry → verify within ±0.0001%
   - **Phoenix Agent** (RECOMMENDED):
     ```bash
     Task("xirr-fees-validator", "Cross-check XIRR edge cases against Excel XIRR() function")
     ```
   - **AI Cross-Validation** (alternative):
     ```bash
     /multi-model-consensus --prompt="Validate XIRR edge case X05 (negative returns, single cashflow). Compare our implementation against Excel XIRR() semantics. Provide mathematical proof of correctness or identify discrepancies."
     ```

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

**RECOMMENDED AGENT:** `phoenix-truth-case-runner`

- Recommends Phase 1 path (1A/1B/1C) based on module-level pass rates
- Generates decision rationale in `docs/phase0-validation-report.md`

**Agent Invocation:**

```bash
# Compute gate decision and recommend path
Task("phoenix-truth-case-runner", "Compute module-level pass rates and recommend Phase 1 path (1A/1B/1C) with rationale")
```

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

**RECOMMENDED COMMANDS:**

- `/verification-before-completion` - **MANDATORY** - Evidence-based phase gate
  completion

**Example (Phase Gate Verification)**:

```bash
/verification-before-completion --phase="0" --checklist="truth-case-pass-rate,module-gates-met,baseline-stable,regression-clean" --baseline="phase0-step-0.1-baseline.json" --export-report="docs/phase0-validation-report.md"
```

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

**RECOMMENDED AGENTS:**

- `phoenix-docs-scribe` - Updates JSDoc with ready-to-paste clawback snippet
- `waterfall-specialist` - Validates clawback semantics match L08 truth case

**Agent Invocation:**

```bash
# Update JSDoc with shortfall-based semantics
Task("phoenix-docs-scribe", "Update waterfall JSDoc with shortfall-based partial clawback semantics - use ready-to-paste snippet from Step 1A.0")

# Validate JSDoc matches L08 implementation
Task("waterfall-specialist", "Validate updated JSDoc matches L08 clawback behavior")
```

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

**RECOMMENDED COMMANDS:**

- `/ts-quality` - Analyze current code quality to inform which rules matter
- `/defense-in-depth` - Multi-layer validation of Decimal.js precision
  guarantees

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

**RECOMMENDED COMMANDS:**

- `/code-refactoring:context-restore` - Document WHY each baseline exists for
  future cleanup
- `/code-refactoring:tech-debt` - Track technical debt created by baselines

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

**RECOMMENDED AGENT:** `phoenix-precision-guardian`

- Scans for parseFloat in calculation paths (P0 priority)
- Validates Decimal.js configuration (precision: 20)
- Ensures type conversions preserve precision

**Agent Invocation:**

```bash
# Scan for precision violations
Task("phoenix-precision-guardian", "Scan server/analytics/ and client/src/core/engines/ for parseFloat usage - report P0 violations")

# Validate Decimal.js configuration
Task("phoenix-precision-guardian", "Validate Decimal.js precision settings across calculation modules")
```

**RECOMMENDED COMMANDS:**

- `/defense-in-depth` - Multi-layer validation across import → type conversion →
  calculation paths
- **Why**: Catches precision loss during type conversions that single-layer
  checks miss
- **Impact**: Prevents floating-point errors from entering calculation pipeline

**Example (Multi-Layer Validation)**:

```bash
/defense-in-depth --scope="Decimal.js precision across calculation paths" \
  --layers="import-validation,type-conversion,calculation-operations" \
  --files="server/analytics/xirr.ts,server/analytics/waterfall-tier.ts"
# Validates each layer independently, then end-to-end
```

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

**RECOMMENDED AGENT:** `phoenix-capital-allocation-analyst`

- Generates 5 new edge cases (zero deployment, over-commitment, late exits)
- Validates truth case provenance (upgrading LOW → MEDIUM confidence)
- Aligns with fund strategy (stage allocations, graduation matrix)

**Agent Invocation:**

```bash
# Generate 5 capital allocation edge cases
Task("phoenix-capital-allocation-analyst", "Generate 5 new capital allocation edge cases: zero contribution, partial deployment (50%), over-commitment (105%), late-quarter contribution, multi-LP allocation")
```

**RECOMMENDED COMMANDS:**

- `/test` - Test strategy coordinator with 4 testing specialists (Edge-Case
  Expert, Boundary Validator, Statistical Analyst, Regression Detector)
- **Why**: More structured than generic brainstorming; each specialist brings
  domain expertise
- **Impact**: Generates comprehensive edge cases covering statistical
  distributions, boundary conditions, and regression scenarios

**Example (Capital Allocation Edge Case Generation)**:

```bash
/test --module="capital-allocation" --count=5 \
  --specialists="edge-case-expert,boundary-validator,statistical-analyst,regression-detector" \
  --focus="Zero contribution, partial deployment, over-commitment, timing edges, multi-LP allocation"
# Each specialist proposes scenarios from their domain (statistical outliers, boundary conditions, etc.)
# Output: 5 scenarios with expected values + rationale
```

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

**RECOMMENDED COMMANDS:**

- `/code-refactoring:refactor-clean` - Structured pure function extraction with
  auto-generated tests
- **Why**: Specifically designed for extracting pure functions;
  `--generate-tests` flag creates unit tests automatically
- **Impact**: Safer refactoring with test coverage; avoids manual test writing

**Example (Extract XIRR Pure Function)**:

```bash
/code-refactoring:refactor-clean \
  --pattern="extract-pure-functions" \
  --target="server/routes/analytics.ts" \
  --extract-to="server/analytics/xirr.ts" \
  --generate-tests
# Extracts calculation logic → creates pure calculateXIRR() → generates unit tests
# Fallback: Manual extraction following pattern below
```

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

**RECOMMENDED AGENT:** `phoenix-precision-guardian`

- Replaces parseFloat with Decimal.js in P0 calculation paths
- Tracks precision vulnerabilities eliminated
- Re-runs truth cases after each replacement to ensure no regressions

**Agent Invocation:**

```bash
# Eradicate parseFloat in P0 paths
Task("phoenix-precision-guardian", "Replace parseFloat with Decimal.js in server/analytics/ - run truth cases after each file")

# Track risk reduction metrics
Task("phoenix-precision-guardian", "Generate parseFloat eradication report: files modified, occurrences replaced, vulnerabilities eliminated")
```

**RECOMMENDED COMMANDS:**

- `/code-refactoring:tech-debt` - Track precision risks eliminated + quantify
  risk reduction
- **Why**: Converts pattern replacement into measurable technical debt
  reduction; tracks before/after risk levels
- **Impact**: Quantifies how many precision-loss vulnerabilities eliminated
  (e.g., "20 P0 files hardened")

**Example (Tracked Eradication with Risk Metrics)**:

```bash
/code-refactoring:tech-debt \
  --action="eradicate-pattern" \
  --pattern="parseFloat" \
  --scope="server/analytics/,client/src/core/engines/" \
  --track-risk-reduction \
  --output="docs/parsefloat-eradication-report.md"
# Generates: Files modified, occurrences replaced, precision vulnerabilities eliminated
# Risk reduction: "20 P0 calculation paths hardened against floating-point precision loss"
```

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

**RECOMMENDED AGENT:** `phoenix-docs-scribe`

- Syncs `docs/calculations.md` with code behavior
- Updates JSDoc with precision guarantees and clawback semantics
- Cross-references truth case IDs (e.g., "See L08 for clawback example")

**Agent Invocation:**

```bash
# Sync calculations.md with code
Task("phoenix-docs-scribe", "Sync docs/calculations.md with waterfall-ledger.ts behavior - include L08 clawback example")

# Update JSDoc for all calculation modules
Task("phoenix-docs-scribe", "Update JSDoc in server/analytics/*.ts with precision guarantees (Decimal.js, 20 digits) and truth case references")
```

**RECOMMENDED COMMANDS:**

- `/code-documentation:doc-generate` - Auto-generate documentation from code +
  JSDoc + truth cases
- **Why**: Auto-synchronization prevents docs from drifting out of sync with
  code; `--include-truth-cases` flag links truth case JSON files
- **Impact**: Documentation updates automatically when code changes; reduces
  manual maintenance

**Example (Auto-Generate with Truth Cases)**:

```bash
/code-documentation:doc-generate \
  --scope="server/analytics/,client/src/core/engines/" \
  --include-truth-cases \
  --format="markdown" \
  --output="docs/calculations.md"
# Generates: API docs from JSDoc + truth case scenario counts + precision guarantees
# Example output: "Truth Cases: 14 scenarios covering no-carry, profit-carry, partial-clawback..."
# Fallback: Manual documentation following template below
```

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

**RECOMMENDED AGENT:** `phoenix-truth-case-runner`

- Re-validates all 119 truth cases after Phase 1A cleanup
- Compares pass rates to Phase 0 baseline
- Generates completion report with before/after metrics

**Agent Invocation:**

```bash
# Re-run truth case suite
Task("phoenix-truth-case-runner", "Re-run full truth case suite and compare to Phase 0 baseline - verify no regressions")

# Generate Phase 1A completion report
Task("phoenix-truth-case-runner", "Generate docs/phase1a-completion-report.md with before/after metrics and remaining technical debt")
```

**RECOMMENDED COMMANDS (MANDATORY Phase Gate):**

- `/verification-before-completion` - **MANDATORY** - Evidence-based validation
  before proceeding to Phase 2
- `/comprehensive-review:pr-enhance` - High-stakes code review for calculation
  path changes
- `/deploy-check` - Comprehensive validation (type check, lint, test, build,
  smoke test)
- **Why**: Evidence-based phase gates prevent proceeding with unmet success
  criteria; `verification-before-completion` enforces proof vs claims
- **Impact**: Zero "oops, we missed X" scenarios at phase boundaries

**Example (MANDATORY Phase Gate Validation)**:

```bash
# Step 1: MANDATORY evidence-based gate
/verification-before-completion \
  --phase="Phase 1A Cleanup" \
  --criteria="Truth case pass rate >= baseline, Zero new P0 TypeScript errors, Build succeeds" \
  --evidence-required
# BLOCKS proceeding without evidence (test outputs, build logs, coverage reports)

# Step 2: High-stakes review for calculation changes
/comprehensive-review:pr-enhance \
  --focus="Calculation path isolation, parseFloat eradication, precision guarantees" \
  --spot-check="XIRR,waterfall-ledger,fees"

# Step 3: Comprehensive technical validation
/deploy-check
# Fallback: npm run check && npm test && npm run build
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

**Commands:** `/bugfix` (primary), `/debug` (alternative), `/dev` (if coverage
required)

**RECOMMENDED AGENTS BY MODULE:**

- **XIRR bugs** → `xirr-fees-validator` (Excel parity, sign conventions)
- **Waterfall bugs** → `waterfall-specialist` (clawback semantics, L08/L11 edge
  cases)
- **Capital Allocation bugs** → `phoenix-capital-allocation-analyst` (deployment
  logic, edge cases)
- **General bugs** → Use `/bugfix` workflow with systematic-debugging skill

**Process:**

1. Complete Phase 1A Steps 1A.0-1A.3 (environment + tooling)
2. For each failing module, choose bug fix approach:
   - **Primary (90% of cases)**: `/bugfix "<error-description>"`
     - Automated workflow with 90% quality gate
     - Independent validation prevents confirmation bias
     - Typical: 2-3 iterations to reach production-ready fix
   - **Alternative (complex/ambiguous bugs)**: `/debug "<error-description>"`
     - Systematic hypothesis-driven debugging (5-7 hypotheses narrowed to 1-2)
     - User confirmation before implementing solutions
     - Use when root cause is unclear or multiple possible causes
   - **Coverage-required**: `/dev "<feature-description>"`
     - End-to-end workflow with mandatory 90% test coverage
     - Use when fix requires substantial new functionality
3. Re-run truth cases after each fix:
   ```bash
   npm test -- tests/truth-cases/runner.test.ts --run
   ```
4. Once module gates met, proceed with Phase 1A cleanup steps

**Bug Fix Workflow Examples:**

```bash
# Example 1: XIRR bug - use xirr-fees-validator agent
Task("xirr-fees-validator", "Fix XIRR NaN on negative cashflows - validate against Excel XIRR() function")
# OR: /bugfix "XIRR calculation returns NaN for negative cashflows"

# Example 2: Waterfall clawback bug - use waterfall-specialist agent
Task("waterfall-specialist", "Fix L08 clawback calculation - verify shortfall-based partial semantics")
# OR: /debug "Waterfall ledger produces incorrect clawback when LP shortfall changes across quarters"

# Example 3: Capital allocation bug - use phoenix-capital-allocation-analyst
Task("phoenix-capital-allocation-analyst", "Fix CA01 allocation logic - validate against fund strategy")

# Example 4: Feature-level fix requiring tests (use /dev)
/dev "Implement recycling cap enforcement with quarterly tracking"
# → Requirements → Codex analysis → Parallel tasks → Coverage ≥90%
```

**Agent Delegation:** Heavy use of `test-repair` and `waterfall-specialist`
agents.

**Quality Assurance:**

- `/bugfix` provides 90% quality threshold (production-ready)
- `/debug` requires user confirmation (prevents premature fixes)
- `/dev` enforces 90% test coverage (no exceptions)
- All approaches integrate with `systematic-debugging` skill

### Bug Workflow Selection

**Objective:** Auto-classify each failing scenario for optimal fix approach.

**RECOMMENDED COMMANDS:**

- `/error-diagnostics:smart-debug` - Auto-classify bugs as simple vs complex vs
  feature-level
- **Why**: Automates workflow decision tree from
  `docs/bugfix-workflow-comparison.md`
- **Impact**: Prevents "which workflow do I use?" paralysis; provides structured
  classification with severity scoring (P0-P3)

**Auto-Classification Criteria:**

- **Simple bugs** (→ `/bugfix`): Well-defined error, single root cause, <30 min
  fix
- **Complex bugs** (→ `/debug`): Ambiguous error, multiple possible causes,
  architectural impact
- **Feature-level fixes** (→ `/dev`): Requires substantial new functionality,
  90% coverage required

**Example (Automated Bug Classification)**:

```bash
/error-diagnostics:smart-debug \
  --scenarios="failing-truth-cases.json" \
  --output="bug-workflow-matrix.md"
# Provides structured classification:
# - L08 clawback mismatch → COMPLEX (architectural) → use /debug
# - XIRR NaN on negative cashflows → SIMPLE (input validation) → use /bugfix
# - Recycling cap missing → FEATURE (new logic) → use /dev
```

### Multi-Module Bug Coordination

**Objective:** Parallelize fixes when XIRR + Waterfall + Fees all have failing
scenarios.

**RECOMMENDED COMMANDS:**

- `/dispatching-parallel-agents` - Parallel bug fixing across independent
  modules
- **Why**: When 3+ modules fail independently, fix in parallel (not sequential)
- **Impact**: 3x faster resolution (6 hours sequential → 2 hours parallel)

**When to Use:**

- XIRR failures AND Waterfall failures AND Fees failures (independent)
- NOT when failures are interdependent (e.g., Fees depends on Waterfall result)

**Example (Parallel 3-Module Fix)**:

```bash
/dispatching-parallel-agents \
  --task1="/bugfix 'XIRR calculation returns NaN for negative cashflows'" \
  --task2="/bugfix 'Waterfall ledger clawback value incorrect (L08 scenario)'" \
  --task3="/bugfix 'Fees percentage calculation off by 0.1%'" \
  --convergence="truth-case-validation"
# Agents work in parallel, reconverge at truth case re-run
# Each agent has isolated workspace, no merge conflicts
# Final step: Unified truth case validation across all modules
```

### Post-Fix Regression Tracking (MANDATORY)

**Objective:** Ensure each bug fix doesn't break previously passing tests.

**RECOMMENDED COMMANDS:**

- `/tracking-regression-tests` - **MANDATORY after each fix** - Compare against
  Step 0.5 baseline
- **Why**: Prevents "whack-a-mole" where fixing one bug breaks another
- **Impact**: Catches new regressions immediately (before cascading)

**Required After Each Fix:**

```bash
# Step 1: Re-run truth cases
npm test -- tests/truth-cases/runner.test.ts --run

# Step 2: MANDATORY regression tracking
/tracking-regression-tests \
  --baseline="docs/phase0-truth-case-baseline.json" \
  --current="$(npm test -- tests/truth-cases/runner.test.ts --run)" \
  --output="regression-report.md"
# Compares pass/fail counts per module
# Example output: "XIRR: 50/50 → 50/50 (stable), Waterfall-Ledger: 10/14 → 12/14 (improved, no regressions)"
```

**Gate Criteria:**

- No previously passing scenarios now failing
- Overall truth case pass rate >= Phase 0 baseline
- If regression detected: escalate to `/debug` for root cause analysis

### High-Stakes Fix Review

**Objective:** Additional review for critical bug fixes (waterfall clawback,
edge cases).

**RECOMMENDED COMMANDS:**

- `/comprehensive-review:pr-enhance` - Additional review after 90% automated
  quality gate
- **Why**: For waterfall clawback fixes, 90% automated score may miss edge cases
- **When**: After `/bugfix` or `/debug` reaches 90% gate but before merge

**Apply to These High-Stakes Fixes:**

1. Waterfall ledger clawback (L08, L11 scenarios)
2. Capital Allocation edge cases (CA01, CA15)
3. XIRR negative cashflow handling
4. Exit recycling cap enforcement

**Example (Review After 90% Gate)**:

```bash
# Context: /bugfix completed with 92% quality score for L08 clawback fix

/comprehensive-review:pr-enhance \
  --focus="Clawback logic correctness, edge case handling, shortfall calculation" \
  --spot-check-scenarios="L08,L11,L13" \
  --compare-to="Excel reference calculations" \
  --require-manual-sign-off
# Performs exhaustive cross-validation:
# - Multi-AI model consensus on clawback semantics
# - Excel vs code output comparison for edge cases
# - Manual sign-off required before merge
```

---

## Phase 1C: Rebuild Path (4-6 weeks)

**Trigger:** Critical failures (XIRR <80% or multiple modules <50%)

**Objective:** Rebuild calculation modules from scratch using truth cases as
spec.

**NOT DETAILED HERE** - Would require full design doc if triggered.

---

## Phase 2: Advanced Forecasting (Living Model)

**Trigger:** Phase 1A or 1B complete with ≥95% truth case pass rate

**Objective:** Implement graduation, MOIC analytics, reserves optimization, and
Monte Carlo forecasting.

**CRITICAL CONSTRAINT:** Phase 2 MUST NEVER degrade Phase 1 truth-case pass
rates.

**Skills:** `phoenix-advanced-forecasting`, `phoenix-reserves-optimizer`,
`multi-model-consensus`

**RECOMMENDED AGENTS:**

### phoenix-probabilistic-engineer

**Responsibilities:**

- Design graduation rate engine (deterministic expectations + stochastic
  sampling)
- Implement MOIC calculation suite (7 variants: Current, Exit,
  Initial/Follow-on, Reserves, Opportunity Cost)
- Build reserves ranking ("Exit MOIC on planned reserves")
- Implement scenario management (Construction vs Current)
- Build Monte Carlo orchestrator wrapping Phase 1 deterministic engines

**Agent Invocation:**

```bash
# Graduation engine design
Task("phoenix-probabilistic-engineer", "Design graduation rate engine with deterministic expectation mode for A/B/C/D stages")

# MOIC suite implementation
Task("phoenix-probabilistic-engineer", "Implement 7 MOIC variants - Current MOIC, Exit MOIC, Initial/Follow-on MOIC, Reserves MOIC, Opportunity Cost MOIC")

# Monte Carlo orchestration
Task("phoenix-probabilistic-engineer", "Build Monte Carlo orchestrator wrapping Phase 1 deterministic engines - preserve truth case pass rates")
```

### phoenix-reserves-optimizer

**Responsibilities:**

- Implement `DeterministicReserveEngine.calculateReserves(...)`
- Validate reserve allocations (sum ≤ availableReserves, no negatives)
- Support reserves ranking visualization
- Handle edge cases (zero reserves, insufficient pool)

**Agent Invocation:**

```bash
# Reserve allocation implementation
Task("phoenix-reserves-optimizer", "Implement DeterministicReserveEngine.calculateReserves() with validation - sum ≤ availableReserves")

# Edge case handling
Task("phoenix-reserves-optimizer", "Handle edge cases: zero reserves, insufficient pool, over-allocated reserves")
```

**Gate Criteria:**

- [ ] Phase 1 truth case pass rate ≥ 95% (baseline maintained)
- [ ] Graduation engine has deterministic expectation mode
- [ ] All 7 MOIC variants implemented with tests
- [ ] Reserves ranking respects budget constraints
- [ ] Monte Carlo orchestrator preserves Phase 1 accuracy

---

## Phase 3+: Brand & UI (Cosmetic)

**Trigger:** Phase 2 complete

**Objective:** Ensure Press On Ventures brand consistency across dashboards and
LP reports.

**RECOMMENDED AGENT:** `phoenix-brand-reporting-stylist`

**Responsibilities:**

- Validate typography (Inter for headlines, Poppins for body)
- Enforce color palette (#F2F2F2, #E0D8D1, #292929)
- Review logo safe zones in PDF exports
- Recommend chart layouts for LP-facing reports

**Agent Invocation:**

```bash
# Dashboard branding review
Task("phoenix-brand-reporting-stylist", "Review MainDashboardV2 for Press On Ventures brand consistency - validate typography and colors")

# LP report layout
Task("phoenix-brand-reporting-stylist", "Suggest layout for LP quarterly report PDF - ensure logo safe zones and accessibility")
```

**Gate Criteria:**

- [ ] Press On Ventures brand guidelines enforced
- [ ] Typography consistent (Inter/Poppins)
- [ ] Color palette validated (#F2F2F2/#E0D8D1/#292929)
- [ ] Logo safe zones respected in exports

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

## Command Enhancements in v2.32

**Additions:** 40+ command recommendations across Phase 0/1A/1B **Time
Savings:** 6.5 hours cumulative (10.5 hours manual → 4 hours automated)
**MANDATORY Commands:** 3 phase gates now required **Quality Improvements:**
Automated validation, parallel execution, regression tracking

### Key Enhancements

**Phase 0 (Validation & Routing):**

- Added `/verification-before-completion` at Step 0.10 (MANDATORY phase gate)
- Added `/error-diagnostics:error-analysis` at Step 0.6 (automates 1+ hour
  triage)
- Added `/tracking-regression-tests` at Step 0.8 (detects new failures)

**Phase 1A (Cleanup Path):**

- Replaced generic commands with specialized tools:
  - `/think` → `/test` with 4 specialists (Step 1A.4)
  - `/refactor` → `/code-refactoring:refactor-clean --generate-tests` (Step
    1A.5)
  - `/docs` → `/code-documentation:doc-generate --include-truth-cases` (Step
    1A.7)
- Added `/defense-in-depth` for multi-layer precision validation (Step 1A.3)
- Added `/verification-before-completion` as MANDATORY phase gate (Step 1A.8)

**Phase 1B (Bug Fix Path):**

- Added 4 new subsections with command-driven workflows:
  - Bug Workflow Selection: `/error-diagnostics:smart-debug` (prevents workflow
    paralysis)
  - Multi-Module Coordination: `/dispatching-parallel-agents` (3x faster
    parallel fixes)
  - Regression Tracking: `/tracking-regression-tests` (MANDATORY after each fix)
  - High-Stakes Review: `/comprehensive-review:pr-enhance` (clawback/edge case
    validation)

**Quick Reference:**

- Added 12+ new command invocations with full flag syntax
- All commands verified against `cheatsheets/slash-commands-complete-list.md`
- Skills vs commands properly distinguished

### Impact Analysis

| Area                   | Without Commands               | With Commands                                        | Impact                   |
| ---------------------- | ------------------------------ | ---------------------------------------------------- | ------------------------ |
| Truth Case Runner      | Manual implementation (1 hour) | `/dev` automated (30-40 min)                         | 20-30 min saved          |
| Phase Gate Validation  | Manual checklist               | Evidence-based `/verification-before-completion`     | Prevents missed criteria |
| Bug Classification     | Manual judgment (1 hour)       | AI-powered `/error-diagnostics:smart-debug` (15 min) | 45 min saved             |
| Multi-Module Fixes     | Sequential (6 hours)           | Parallel `/dispatching-parallel-agents` (2 hours)    | 4 hours saved            |
| Regression Detection   | Visual diff (30 min)           | Automated `/tracking-regression-tests` (5 min)       | 25 min saved             |
| parseFloat Eradication | Search + replace (2 hours)     | Tracked `/code-refactoring:tech-debt` (1 hour)       | 1 hour saved             |

**Total Time Savings:** 6.5+ hours across all phases

**See:** `docs/phoenix-v2.32-command-enhancements.md` for complete analysis

---

## Appendix A: Phoenix Agents & Skills Reference

### Phoenix Agent Registry (9 Specialized Agents)

**See:** [.claude/agents/PHOENIX-AGENTS.md](.claude/agents/PHOENIX-AGENTS.md)
for complete documentation

**Quick Reference:**

| Agent                              | Phase | Primary Use                                   | Memory Tenant                            |
| ---------------------------------- | ----- | --------------------------------------------- | ---------------------------------------- |
| phoenix-truth-case-runner          | 0     | Truth case validation, pass rate computation  | agent:phoenix-truth-case-runner          |
| phoenix-precision-guardian         | 1A    | parseFloat eradication, Decimal.js validation | agent:phoenix-precision-guardian         |
| waterfall-specialist               | 0, 1B | Clawback validation, L08 scenarios            | agent:waterfall-specialist               |
| xirr-fees-validator                | 0, 1B | XIRR/fees truth cases, Excel parity           | agent:xirr-fees-validator                |
| phoenix-capital-allocation-analyst | 0, 1A | LOW confidence modules, edge cases            | agent:phoenix-capital-allocation-analyst |
| phoenix-docs-scribe                | 1A    | JSDoc, calculations.md sync                   | agent:phoenix-docs-scribe                |
| phoenix-probabilistic-engineer     | 2     | Graduation, MOIC, Monte Carlo                 | agent:phoenix-probabilistic-engineer     |
| phoenix-reserves-optimizer         | 2     | Reserve allocation, "next dollar"             | agent:phoenix-reserves-optimizer         |
| phoenix-brand-reporting-stylist    | 3     | Press On Ventures branding                    | agent:phoenix-brand-reporting-stylist    |

### Skills Framework (22+ Skills)

**Phoenix-Specific Skills (9 skills):**

- `phoenix-truth-case-orchestrator` - Truth case validation patterns
- `phoenix-precision-guard` - Decimal.js precision enforcement
- `phoenix-waterfall-ledger-semantics` - Clawback semantics
- `phoenix-xirr-fees-validator` - Excel parity validation
- `phoenix-capital-exit-investigator` - Capital allocation edge cases
- `phoenix-docs-sync` - Documentation synchronization
- `phoenix-advanced-forecasting` - Graduation/MOIC/Monte Carlo
- `phoenix-reserves-optimizer` - Reserve allocation logic
- `phoenix-brand-reporting` - Press On Ventures brand guidelines

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

### Agent Invocation Patterns

**Direct Invocation (Task Tool):**

```bash
# Truth case validation
Task("phoenix-truth-case-runner", "Run full suite and compute pass rates")

# Precision enforcement
Task("phoenix-precision-guardian", "Eradicate parseFloat in server/analytics/")

# Waterfall validation
Task("waterfall-specialist", "Validate L08 clawback scenario")
```

### Skill Auto-Activation (File-Based)

Skills automatically load when editing specific files:

| Skill                              | Auto-Activates On                                       |
| ---------------------------------- | ------------------------------------------------------- |
| phoenix-truth-case-orchestrator    | `*.truth-cases.json`, `runner.test.ts`                  |
| phoenix-waterfall-ledger-semantics | `waterfall-*.ts`                                        |
| phoenix-precision-guard            | `server/analytics/*.ts`, `client/src/core/engines/*.ts` |
| phoenix-xirr-fees-validator        | `xirr.ts`, `fees.ts`                                    |
| phoenix-capital-exit-investigator  | `capital-allocation.ts`, `exit-recycling.ts`            |
| phoenix-docs-sync                  | `calculations.md`, JSDoc in `*.ts`                      |

### Command Integration

Phoenix agents complement (not replace) existing commands:

| Command                            | Agent Equivalent           | Relationship                  |
| ---------------------------------- | -------------------------- | ----------------------------- |
| `/test-smart truth-cases`          | phoenix-truth-case-runner  | Agent uses command            |
| `/fix-auto`                        | phoenix-precision-guardian | Agent uses command for ESLint |
| `/code-documentation:doc-generate` | phoenix-docs-scribe        | Agent augments command        |
| `/defense-in-depth`                | phoenix-precision-guardian | Agent automates Step 1A.3     |

### Memory Coordination

All Phoenix agents use unique tenant IDs for cross-session learning:

```yaml
# No Memory Conflicts: Each agent has distinct domain scope
agent:phoenix-truth-case-runner           # Truth case patterns
agent:phoenix-precision-guardian          # Precision violations
agent:waterfall-specialist                # Waterfall edge cases (existing)
agent:xirr-fees-validator                 # XIRR/fees Excel parity
agent:phoenix-capital-allocation-analyst  # Capital allocation patterns
agent:phoenix-docs-scribe                 # Documentation drift
agent:phoenix-probabilistic-engineer      # Probabilistic patterns
agent:phoenix-reserves-optimizer          # Reserve optimization
agent:phoenix-brand-reporting-stylist     # Brand violations
```

### General Agents (23 Total)

**Other Specialized Agents:**

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

| Version  | Date       | Changes                                                                                                         |
| -------- | ---------- | --------------------------------------------------------------------------------------------------------------- |
| v2.18    | 2025-12-08 | Initial comprehensive plan (GitHub commit 375ea58, internally v2.29)                                            |
| v2.23    | 2025-12-09 | Skills/agents/commands integration                                                                              |
| v2.23-A1 | 2025-12-09 | **ADDENDUM:** Restored 4 critical sections from v2.18/v2.29                                                     |
| v2.30    | 2025-12-09 | Merged v2.29 foundation + v2.23 enhancements                                                                    |
| v2.31    | 2025-12-09 | Plan ↔ JSON synchronized, verification gates refined                                                           |
| v2.32    | 2025-12-09 | Command-enhanced execution (+40 commands, 6.5hr savings, MANDATORY gates)                                       |
| v2.33    | 2025-12-10 | **CURRENT:** Phoenix agent integration (9 specialized agents with unique tenant IDs for cross-session learning) |

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

### v2.33 Changes (Phoenix Agent Integration)

**Phoenix Agent Integration (9 specialized agents):**

1. **Phase 0 Agents:**
   - `phoenix-truth-case-runner` - Truth case validation, pass rate computation,
     failure triage
   - `waterfall-specialist` - L08 clawback validation (shortfall-based
     semantics)
   - `xirr-fees-validator` - Excel parity cross-checks
   - `phoenix-capital-allocation-analyst` - LOW confidence module investigation

2. **Phase 1A Agents:**
   - `phoenix-precision-guardian` - parseFloat eradication, Decimal.js
     validation
   - `phoenix-docs-scribe` - JSDoc hotfix, calculations.md sync

3. **Phase 2 Agents:**
   - `phoenix-probabilistic-engineer` - Graduation, MOIC, Monte Carlo
   - `phoenix-reserves-optimizer` - Reserve allocation, "next dollar" decisions

4. **Phase 3+ Agents:**
   - `phoenix-brand-reporting-stylist` - Press On Ventures brand consistency

**Agent Features:**

- Unique memory tenant IDs for cross-session learning (no conflicts)
- File-based skill auto-activation (`*.truth-cases.json` →
  phoenix-truth-case-orchestrator)
- Command integration table (agents complement existing commands)
- Phase 2 constraint: MUST NEVER degrade Phase 1 truth-case pass rates

**Cross-References:**

- [PHOENIX-AGENTS.md](.claude/agents/PHOENIX-AGENTS.md) - Complete agent
  registry
- Agent invocation examples added to all phases (0, 1A, 1B, 2, 3)
- Memory coordination section in Appendix A

### v2.32 Changes (Command Enhancements)

**Command Additions (40+ enhancements):**

1. **Phase 1A Steps Enhanced:**
   - Step 1A.3: `/defense-in-depth` for multi-layer Decimal.js precision
     validation
   - Step 1A.4: `/test` with 4 specialists (edge-case, boundary, statistical,
     regression)
   - Step 1A.5: `/code-refactoring:refactor-clean --generate-tests` for pure
     function extraction
   - Step 1A.6: `/code-refactoring:tech-debt --track-risk-reduction` for
     parseFloat eradication
   - Step 1A.7: `/code-documentation:doc-generate --include-truth-cases` for
     auto-sync docs
   - Step 1A.8: `/verification-before-completion` (MANDATORY phase gate) +
     `/comprehensive-review:pr-enhance`

2. **Phase 1B Subsections Added:**
   - Bug Workflow Selection: `/error-diagnostics:smart-debug` for
     auto-classification
   - Multi-Module Bug Coordination: `/dispatching-parallel-agents` for parallel
     fixes (3x faster)
   - Post-Fix Regression Tracking: `/tracking-regression-tests` (MANDATORY after
     each fix)
   - High-Stakes Fix Review: `/comprehensive-review:pr-enhance` for
     clawback/edge case fixes

3. **Quick Reference Updated:**
   - Added 8 new Phase 1A commands with full flag syntax
   - Added 4 new Phase 1B commands with examples
   - Replaced generic commands (`/think`, `/refactor`, `/docs`) with specialized
     versions

4. **Timeline Optimization:**
   - Best case: 5-8 days → 4-6 days (automated validation + parallel execution)
   - Moderate case: 12-15 days → 8-10 days (smart debugging + parallel bug
     fixes)
   - Worst case: 4-6 weeks → 3-4 weeks (structured rebuild)
   - **Total time savings:** 6.5 hours cumulative (10.5 hours manual → 4 hours
     automated)

5. **MANDATORY Phase Gates:**
   - Added `/verification-before-completion` as required gate at Steps 0.10 and
     1A.8
   - Evidence-based validation (test outputs, build logs, coverage reports
     required)
   - Prevents proceeding with unmet success criteria

**Cross-References:**

- See `docs/phoenix-v2.32-command-enhancements.md` for complete impact analysis
- See `cheatsheets/slash-commands-phoenix.md` for full command reference
  (updated to v2.32)
- See `docs/bugfix-workflow-comparison.md` for workflow decision tree

---

**End of Plan**

---

## Quick Reference

**See `cheatsheets/slash-commands-phoenix.md` for complete command reference
with 30+ commands.**

**Phase 0 Commands:**

```bash
# Pre-flight
npm test -- --run | head -20

# Baseline
npm test -- --coverage --run
# OR: /test-smart --coverage

# Truth case runner
npm test -- tests/truth-cases/runner.test.ts --run

# Spot-check validation (Step 0.4)
/ask "Validate L08 clawback semantics: shortfall-based partial vs hard floor"
# OR: invoke waterfall-specialist agent

# Failure triage (Step 0.6)
/debug "Truth case L08 failing with gpClawback mismatch"
# OR: /bugfix "L08 partial clawback calculation incorrect"

# Regression check (Step 0.8)
/regression-test-tracker:track-regression

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

# Dependency audit (Step 1A.3)
/defense-in-depth --scope="Decimal.js precision" --layers="import,type-conversion,calculation"

# Truth case expansion (Step 1A.4)
/test --module="capital-allocation" --count=5 \
  --specialists="edge-case-expert,boundary-validator,statistical-analyst,regression-detector"

# Calculation isolation (Step 1A.5)
/code-refactoring:refactor-clean --pattern="extract-pure-functions" --generate-tests

# parseFloat eradication (Step 1A.6)
/code-refactoring:tech-debt --action="eradicate-pattern" --pattern="parseFloat" --track-risk-reduction

# Documentation sync (Step 1A.7)
/code-documentation:doc-generate --include-truth-cases --format="markdown"

# Final validation (Step 1A.8 - MANDATORY PHASE GATE)
/verification-before-completion --phase="Phase 1A" --evidence-required
/comprehensive-review:pr-enhance --spot-check="XIRR,waterfall-ledger,fees"
/deploy-check

# Finalize
/commit-push-pr
```

**Phase 1B Commands:**

```bash
# Bug classification (auto-select workflow)
/error-diagnostics:smart-debug --scenarios="failing-truth-cases.json"

# Bug fixes (PRIMARY - 90% of cases)
/bugfix "XIRR calculation fails for negative cashflows"
# → Automated: bugfix → verify (score) → iterate until 90%+

# Complex bugs (ALTERNATIVE - architectural issues)
/debug "Waterfall ledger produces wrong clawback value"
# → Systematic hypothesis testing with user confirmation

# Feature-level fixes (COVERAGE REQUIRED)
/dev "Implement recycling cap enforcement logic"
# → Ensures 90% test coverage

# Parallel fixes (when XIRR + Waterfall + Fees all fail independently)
/dispatching-parallel-agents \
  --task1="/bugfix 'XIRR NaN...'" \
  --task2="/bugfix 'Waterfall L08...'" \
  --task3="/bugfix 'Fees percentage...'"

# Re-run truth cases + MANDATORY regression tracking
npm test -- tests/truth-cases/runner.test.ts --run
/tracking-regression-tests --baseline="docs/phase0-truth-case-baseline.json"

# High-stakes fix review (for clawback, edge cases)
/comprehensive-review:pr-enhance --spot-check="L08,L11,CA01"

# Finalize
/commit-push-pr
```

**Common Pitfalls:**

1. Skipping Step 1A.0 JSDoc hotfix → agents read wrong semantics
2. Using aggregate pass rate instead of module-level gates → wrong path
3. Fixing non-P0 parseFloat before P0 → scope creep
4. Using strict equality (`toBe`) for numeric comparisons → precision failures
5. Not stripping `notes` fields before comparison → false failures
