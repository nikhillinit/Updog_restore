# Phoenix Execution Plan v2.18

**Date:** December 9, 2025
**Status:** ACTIVE - Ready for Execution
**Author:** Solo Developer
**Approach:** Validation-First, Evidence-Driven

---

## Executive Summary

This plan validates and hardens 5 financial calculation modules (XIRR, MOIC, Waterfall, Fees, Reserves) through empirical testing before optimization. It rejects analysis paralysis in favor of actionable validation.

**Core Principle:** Code is truth. Validate first, then fix what's actually broken.

**Timeline:** 1-3 weeks (conditional on validation findings)
- Best case (calculations work): 1-2 weeks
- Moderate case (minor bugs): 2-3 weeks
- Worst case (fundamental errors): 4-6 weeks

---

## Verified Ground Truth

All metrics below have been independently verified via direct codebase inspection (December 9, 2025).

### Codebase Metrics

| Metric | Verified Value | Source |
|--------|----------------|--------|
| TypeScript errors | 454 (baselined) | `.tsc-baseline.json` |
| Test pass rate baseline | 74.7% (998/1,337) | `cheatsheets/pr-merge-verification.md` |
| Truth case scenarios | 105 total | `docs/*.truth-cases.json` |
| parseFloat occurrences | 301 in 96 files | `grep -r "parseFloat"` |
| Feature flags | 19 defined | `shared/feature-flags/flag-definitions.ts` |
| Test files | 175 | `find -name "*.test.ts"` |

### Truth Case Distribution

| Module | Scenarios | File |
|--------|-----------|------|
| XIRR | 25 | `docs/xirr.truth-cases.json` |
| Capital Allocation | 20 | `docs/capital-allocation.truth-cases.json` |
| Exit Recycling | 20 | `docs/exit-recycling.truth-cases.json` |
| Waterfall (Tier-based) | 15 | `docs/waterfall.truth-cases.json` |
| Waterfall (Ledger + Clawback) | 15 | `docs/waterfall-ledger.truth-cases.json` |
| Fees | 10 | `docs/fees.truth-cases.json` |
| **Total** | **105** | |

**Note:** Two waterfall implementations exist and both require validation:
- **Tier-based** (`calculateAmericanWaterfall`): Single-exit, Excel parity, Decimal.js precision
- **Ledger-based** (`calculateAmericanWaterfallLedger`): Multi-exit, clawback, recycling, DPI/TVPI

### parseFloat Triage (Estimated)

| Priority | Description | Est. Files | Est. Occurrences |
|----------|-------------|------------|------------------|
| P0 | Calculation paths | ~12 | ~20 |
| P1 | Config/ENV parsing | ~3 | ~15 |
| P2 | UI input boundaries | ~25 | ~65 |
| P3 | Tests/fixtures | ~56 | ~200 |
| **Total** | | **96** | **301** |

**Note:** P0+P1 (~35 occurrences) are the only ones that matter for calculation precision.

### Existing Assets

| Asset | Status | Location |
|-------|--------|----------|
| Clawback implementation | Merged (Dec 4) | `client/src/lib/waterfall/american-ledger.ts:183-243` |
| Fee profile schema | Active | `shared/schemas/fee-profile.ts` |
| Waterfall helpers | Active | `client/src/lib/waterfall.ts` |
| TypeScript baseline ratchet | Active | `.tsc-baseline.json` |
| Skills framework | 21 skills | `.claude/skills/README.md` |
| Agent library | 22 agents | `.claude/agents/*.md` |

---

## Phase 0: Reality Check (8-12 hours)

**Goal:** Determine what actually works before planning fixes.

**Duration:** 8-12 hours (1-1.5 days)
- Best case: 8 hours (test suite healthy, runners exist)
- Slip case: 12 hours (runner issues, infrastructure fixes needed)

### Morning: Environment Setup (4 hours)

#### Step 0.1: Dependency Installation (1 hour)

```bash
# Install all dependencies
npm ci --prefix tools_local && npm install

# Verify sidecar health
npm run doctor:quick
```

**Success Criteria:**
- [ ] `npm install` completes without errors
- [ ] `npm run doctor:quick` passes
- [ ] No missing peer dependencies

#### Step 0.2: Test Suite Execution (1 hour)

```bash
# Run full test suite, capture output
npm test 2>&1 | tee test-results-phase0.txt

# Extract summary
grep -E "(Tests|PASS|FAIL|passed|failed)" test-results-phase0.txt | tail -20
```

**Capture:**
- Total tests run
- Pass count / Fail count
- Pass percentage
- List of failing test files

#### Step 0.3: Test Failure Categorization (2 hours)

Categorize each failing test:

| Category | Priority | Action |
|----------|----------|--------|
| Calculation logic error | CRITICAL | Must fix |
| Type error | MODERATE | Fix if blocking |
| Test infrastructure (jest-dom, globals) | LOW | Fix separately |
| Flaky/timeout | IGNORE | Skip for now |
| Integration/DB | DEFER | Requires setup |

**Document in:** `docs/phase0-test-analysis.md`

### Afternoon: Truth Case Validation (4 hours)

#### Step 0.4: Run Existing Truth Case Runners (1 hour)

```bash
# Waterfall tier-based (15 scenarios)
npm test tests/unit/waterfall-truth-table.test.ts

# XIRR (25 scenarios)
npm test tests/unit/xirr-golden-set.test.ts

# Check for other existing runners
find tests -name "*truth*" -o -name "*golden*"
```

**Capture results:**
- XIRR: X/25 passing
- Waterfall (tier): X/15 passing

#### Step 0.5: Build Missing Module Runners (2 hours)

Create `tests/truth-cases/truth-case-runner.test.ts`:

```typescript
import feesCases from '../../docs/fees.truth-cases.json';
import capitalCases from '../../docs/capital-allocation.truth-cases.json';
import exitCases from '../../docs/exit-recycling.truth-cases.json';
import ledgerCases from '../../docs/waterfall-ledger.truth-cases.json';

describe('Fees Truth Cases', () => {
  feesCases.forEach((tc) => {
    it(tc.scenario, () => {
      const result = calculateFees(tc.input);
      expect(result).toMatchObject(tc.expected);
    });
  });
});

describe('Capital Allocation Truth Cases', () => { /* similar */ });
describe('Exit Recycling Truth Cases', () => { /* similar */ });

describe('Waterfall Ledger Truth Cases', () => {
  ledgerCases.forEach((tc) => {
    it(tc.scenario, () => {
      const result = calculateAmericanWaterfallLedger(
        tc.input.config,
        tc.input.contributions,
        tc.input.exits
      );
      expect(result.totals).toMatchObject(tc.expected.totals);
    });
  });
});
```

#### Step 0.6: Run Full Truth Case Suite (30 min)

```bash
# Run all truth case tests
npm test -- --grep "Truth Case"

# Capture summary
npm test -- --grep "Truth Case" 2>&1 | tee truth-case-results.txt
```

**Document in:** `docs/phase0-truth-case-results.md`

| Module | Total | Pass | Fail | Rate |
|--------|-------|------|------|------|
| XIRR | 25 | X | X | X% |
| Waterfall (tier) | 15 | X | X | X% |
| Waterfall (ledger) | 15 | X | X | X% |
| Fees | 10 | X | X | X% |
| Capital Allocation | 20 | X | X | X% |
| Exit Recycling | 20 | X | X | X% |
| **Total** | **105** | X | X | **X%** |

#### Step 0.7: Waterfall Implementation Wiring Check (30 min)

Verify both waterfall implementations are correctly wired:

```bash
# Which implementation is used in production?
grep -r "calculateAmericanWaterfall" client/src --include="*.ts" --include="*.tsx" | grep -v test

# Verify tier-based tests use tier-based function
grep "calculateAmericanWaterfall" tests/unit/waterfall-truth-table.test.ts

# Verify ledger tests use ledger function
grep "calculateAmericanWaterfallLedger" tests/truth-cases/truth-case-runner.test.ts
```

**Document:** Which API is used where (production vs legacy)

#### Step 0.8: Phase 0 Decision Gate (30 min)

Based on findings, determine path:

```
IF test_pass_rate >= 70% AND truth_case_pass_rate >= 80%:
    → PROCEED to Phase 1A (Cleanup Path)
    → Timeline: 1-2 weeks

ELIF test_pass_rate >= 50% AND truth_case_pass_rate >= 60%:
    → PROCEED to Phase 1B (Bug Fix Path)
    → Timeline: 2-3 weeks

ELSE:
    → PROCEED to Phase 1C (Rebuild Path)
    → Timeline: 4-6 weeks
```

### Phase 0 Deliverable

Create: `docs/phase0-validation-report.md`

```markdown
# Phase 0 Validation Report
**Date:** [DATE]
**Duration:** [X hours]

## Test Results
- Total tests: X
- Passing: X (X%)
- Failing: X (X%)
- Skipped: X

## Failure Categories
- Calculation errors: X tests
- Type errors: X tests
- Infrastructure: X tests
- Flaky: X tests

## Truth Case Validation
| Module | Pass | Fail | Error | Rate |
|--------|------|------|-------|------|
| XIRR | X | X | X | X% |
| Waterfall | X | X | X | X% |
| Fees | X | X | X | X% |
| Capital | X | X | X | X% |
| Exit | X | X | X | X% |

## Decision
PATH: [1A/1B/1C]
REASON: [Based on findings above]
```

---

## Phase 1A: Cleanup Path (Days 2-7)

**Condition:** test_pass_rate >= 70% AND truth_case_pass_rate >= 80%

**Goal:** Clean up, consolidate, and harden already-working code.

### Day 2-3: Fee Schema Consolidation

#### Step 1A.1: Audit Fee Schemas (2 hours)

```bash
# Find all fee-related schemas
grep -r "FeeSchema\|fee.*schema\|fees.*schema" --include="*.ts" -l
```

**Expected files:**
- `shared/schemas/fee-profile.ts` (canonical)
- `client/src/lib/fees-wizard.ts` (orphaned - delete)

#### Step 1A.2: Consolidate to Single Schema (4 hours)

1. Verify `shared/schemas/fee-profile.ts` is complete
2. Delete orphaned `fees-wizard.ts`
3. Update any imports
4. Run tests to confirm no breaks

#### Step 1A.3: Add Schema Tests (2 hours)

Add edge case tests for:
- Zero fee scenarios
- Maximum fee bounds
- Invalid fee combinations

### Day 4: parseFloat P0 Audit

#### Step 1A.4: Identify P0 Files (1 hour)

```bash
# Find parseFloat in calculation paths
grep -r "parseFloat" --include="*.ts" \
  server/services/ \
  client/src/core/ \
  client/src/lib/waterfall/ \
  shared/
```

**Expected P0 files (~12):**
- `server/services/monte-carlo-engine.ts`
- `server/services/fund-metrics-calculator.ts`
- `client/src/lib/waterfall/american-ledger.ts`
- (etc.)

#### Step 1A.5: Assess P0 Impact (2 hours)

For each P0 file:
1. Is parseFloat used in actual calculations?
2. Does it affect precision-sensitive outputs?
3. Is there a truth case that would catch errors?

**Decision:** Only fix parseFloat if:
- It's in a calculation path AND
- No Zod validation exists AND
- Truth case shows precision error

#### Step 1A.6: Fix Critical parseFloat (3 hours)

If fixes needed:
```typescript
// BEFORE (problematic)
const amount = parseFloat(input);

// AFTER (safe)
import Decimal from 'decimal.js';
const amount = new Decimal(input);
```

Add ESLint rule to prevent regression:
```javascript
// eslint.config.js
rules: {
  'no-restricted-globals': ['error', {
    name: 'parseFloat',
    message: 'Use Decimal.js for financial calculations'
  }]
}
```

### Day 5: Truth Case CI Integration

#### Step 1A.7: Integrate Truth Cases into CI (2 hours)

Truth case runner was built in Phase 0. Now integrate into CI pipeline:

```yaml
# .github/workflows/truth-cases.yml
name: Truth Case Validation
on: [push, pull_request]

jobs:
  truth-cases:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm test -- --grep "Truth Case"
      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: truth-case-results
          path: truth-case-results.txt
```

**Verification:**
```bash
# Run locally to confirm CI will pass
npm test -- --grep "Truth Case"
# Expected: 105 passing scenarios
```

### Day 6-7: Documentation and Deployment Prep

#### Step 1A.9: Archive Stale Documentation (2 hours)

Move to `archive/2025-12/`:
- Obsolete PHASE* documents
- Superseded STRATEGY* documents
- Old planning documents

#### Step 1A.10: Update CHANGELOG (1 hour)

```markdown
## [Unreleased] - 2025-12-XX

### Validated
- XIRR calculations (25 truth cases)
- Waterfall calculations (15 truth cases)
- Fee calculations (10 truth cases)
- Capital allocation (20 truth cases)
- Exit recycling (20 truth cases)

### Fixed
- [List any parseFloat fixes]
- [List any schema consolidations]

### Removed
- Orphaned fees-wizard.ts schema
```

#### Step 1A.11: Staging Deployment (3 hours)

```bash
# Build production bundle
npm run build

# Run smoke tests
npm run test:smoke

# Deploy to staging
npm run deploy:staging
```

### Phase 1A Exit Criteria

- [ ] All 105 truth cases pass
- [ ] Test pass rate >= 74% (baseline)
- [ ] No new TypeScript errors (ratchet holds)
- [ ] Fee schema consolidated
- [ ] P0 parseFloat issues addressed
- [ ] Deployed to staging

---

## Phase 1B: Bug Fix Path (Days 2-14)

**Condition:** test_pass_rate >= 50% AND truth_case_pass_rate >= 60%

**Goal:** Fix identified calculation bugs before cleanup.

### Week 1: Bug Identification and Triage

#### Days 2-3: Deep Dive on Failing Truth Cases

For each failing truth case:

1. **Identify the bug:**
   ```bash
   # Run single truth case with debugging
   DEBUG=true npm test -- --grep "scenario X"
   ```

2. **Root cause analysis:**
   - Is it a calculation logic error?
   - Is it a precision error (parseFloat)?
   - Is it an edge case not handled?

3. **Document in issue tracker:**
   ```markdown
   ## Bug: [Module] [Scenario X] fails

   **Input:** [truth case input]
   **Expected:** [truth case expected]
   **Actual:** [what code produces]
   **Root Cause:** [analysis]
   **Fix Approach:** [proposed solution]
   ```

#### Days 4-5: Fix Critical Calculation Bugs

Priority order:
1. XIRR bugs (most user-visible)
2. Waterfall bugs (affects distributions)
3. Fee bugs (affects fund economics)
4. Capital allocation bugs
5. Exit recycling bugs

For each fix:
- Write failing test first (TDD)
- Implement fix
- Verify truth case passes
- Run full test suite

### Week 2: Validation and Cleanup

#### Days 8-10: Regression Testing

```bash
# Full test suite
npm test

# Truth case validation
npm test -- --grep "Truth Case"

# TypeScript check (must not exceed baseline)
npm run check
```

#### Days 11-12: Phase 1A Cleanup Tasks

Execute Phase 1A steps:
- Fee schema consolidation
- parseFloat P0 audit (now informed by actual bugs found)
- Documentation updates

#### Days 13-14: Staging Deployment

Same as Phase 1A deployment steps.

### Phase 1B Exit Criteria

- [ ] All identified calculation bugs fixed
- [ ] All 105 truth cases pass
- [ ] Test pass rate >= 74% (baseline)
- [ ] No new TypeScript errors
- [ ] Root cause documented for each bug
- [ ] Deployed to staging

---

## Phase 1C: Rebuild Path (Days 2-30+)

**Condition:** test_pass_rate < 50% OR truth_case_pass_rate < 60%

**Goal:** Systematic rebuild of broken calculation engines.

### This path requires separate detailed planning based on Phase 0 findings.

**Key activities:**
1. Identify which engines are fundamentally broken
2. Design corrected calculation logic
3. Implement with TDD against truth cases
4. Extensive testing before any deployment

**Timeline:** 4-6 weeks minimum

**Recommendation:** If Phase 0 indicates this path, pause and create dedicated rebuild plan.

---

## Phase 2: Hardening (Days 8-14 or Week 3-4)

**Condition:** Phase 1A or 1B completed successfully

**Goal:** Prevent regression and improve maintainability.

### ESLint Rules for Prevention

```javascript
// Add to eslint.config.js

// Prevent parseFloat in calculation paths
{
  files: ['server/services/**/*.ts', 'client/src/core/**/*.ts'],
  rules: {
    'no-restricted-globals': ['error', 'parseFloat', 'parseInt'],
    'no-restricted-properties': ['error', {
      object: 'Number',
      property: 'parseFloat'
    }]
  }
}
```

### TypeScript Strictness

Maintain baseline ratchet:
```bash
# Before any PR merge
npm run check 2>&1 | grep "Found.*error"
# Must be <= 454 errors
```

### Monitoring Setup

Add calculation validation to runtime:
```typescript
// server/middleware/calculation-validator.ts
export function validateCalculationOutput(
  module: string,
  input: unknown,
  output: unknown
): void {
  // Log suspicious values
  if (typeof output === 'number' && (isNaN(output) || !isFinite(output))) {
    logger.error(`Invalid calculation output in ${module}`, { input, output });
  }
}
```

---

## Phase 3: Production Rollout (Week 3+ or Week 5+)

### Shadow Mode (Optional)

If risk tolerance is low:
```typescript
// Run old and new calculations in parallel
const oldResult = legacyCalculation(input);
const newResult = newCalculation(input);

// Log discrepancies
if (!deepEqual(oldResult, newResult)) {
  logger.warn('Calculation discrepancy', { input, oldResult, newResult });
}

// Return old result until validated
return oldResult;
```

### Feature Flag Rollout

Use existing feature flag infrastructure:
```typescript
// shared/feature-flags/flag-definitions.ts
export const PHOENIX_VALIDATED_CALCULATIONS = {
  name: 'phoenix-validated-calculations',
  description: 'Use Phoenix-validated calculation engines',
  defaultValue: false,
  rolloutPercentage: 0, // Start at 0%, increase gradually
};
```

Rollout schedule:
- Day 1: 5% of users
- Day 3: 25% of users
- Day 7: 50% of users
- Day 14: 100% of users

### Production Deployment

```bash
# Final validation
npm test
npm run build
npm run test:smoke

# Deploy with feature flag at 0%
npm run deploy:production

# Gradually increase rollout
# Monitor error rates, user feedback
```

---

## Success Criteria

### Minimum Viable (Must Have)

- [ ] All 105 truth cases pass
- [ ] Test pass rate >= 74% (matches baseline)
- [ ] TypeScript errors <= 454 (ratchet maintained)
- [ ] No calculation precision bugs in P0 paths
- [ ] Deployed to production with feature flags

### Target (Should Have)

- [ ] Test pass rate >= 80%
- [ ] TypeScript errors reduced to < 400
- [ ] parseFloat eliminated from P0+P1 paths
- [ ] Fee schema fully consolidated
- [ ] 100% feature flag rollout complete

### Stretch (Nice to Have)

- [ ] Test pass rate >= 90%
- [ ] TypeScript errors reduced to < 300
- [ ] All parseFloat replaced with Decimal.js
- [ ] Shadow mode validation complete
- [ ] Performance benchmarks established

---

## Risk Mitigation

### Risk 1: Phase 0 Reveals Fundamental Bugs

**Probability:** Medium (30%)
**Impact:** High (timeline extends to 4-6 weeks)
**Mitigation:** Phase 0 designed to surface this early. If triggered, pause and create detailed rebuild plan.

### Risk 2: Test Infrastructure Blocks Validation

**Probability:** Medium (40%)
**Impact:** Medium (delays by 1-2 days)
**Mitigation:** Fix jest-dom/globals issues before calculation validation. Document workarounds.

### Risk 3: parseFloat Causes Production Precision Errors

**Probability:** Low (15%)
**Impact:** High (incorrect financial calculations)
**Mitigation:** P0 audit focused on calculation paths. ESLint rules prevent future issues.

### Risk 4: Feature Flag Rollout Reveals Edge Cases

**Probability:** Medium (25%)
**Impact:** Medium (requires hotfix)
**Mitigation:** Shadow mode comparison. Gradual rollout with monitoring.

---

## Daily Standup Template

```markdown
## Phoenix Standup - [DATE]

### Yesterday
- [Completed tasks]

### Today
- [Planned tasks]

### Blockers
- [Any blockers]

### Metrics
- Test pass rate: X%
- Truth cases passing: X/90
- TypeScript errors: X (baseline: 454)
```

---

## Appendix A: Command Reference

### Environment

```bash
# Setup
npm ci --prefix tools_local && npm install
npm run doctor:quick

# Development
npm run dev           # Full dev environment
npm run dev:client    # Frontend only
npm run dev:api       # Backend only
```

### Testing

```bash
# Full suite
npm test

# Server only
npm test -- --project=server

# Client only
npm test -- --project=client

# Single file
npm test -- path/to/file.test.ts

# With coverage
npm test -- --coverage
```

### Validation

```bash
# TypeScript check
npm run check

# Lint
npm run lint
npm run lint:fix

# Truth cases
npm test -- --grep "Truth Case"
```

### Deployment

```bash
# Build
npm run build

# Smoke tests
npm run test:smoke

# Deploy
npm run deploy:staging
npm run deploy:production
```

---

## Appendix B: File Reference

### Core Calculation Files

| Module | Primary File | Test File |
|--------|--------------|-----------|
| XIRR | `server/services/xirr-calculator.ts` | `tests/unit/xirr-golden-set.test.ts` |
| MOIC | `server/services/fund-metrics-calculator.ts` | `tests/unit/services/fund-metrics-calculator.test.ts` |
| Waterfall (tier) | `shared/schemas/waterfall-policy.ts` | `tests/unit/waterfall-truth-table.test.ts` |
| Waterfall (ledger) | `client/src/lib/waterfall/american-ledger.ts` | `tests/unit/analytics-waterfall.test.ts` |
| Fees | `shared/schemas/fee-profile.ts` | `tests/unit/fees.test.ts` |
| Reserves | `client/src/core/reserves/` | `tests/unit/reserves-engine.test.ts` |

### Configuration Files

| Purpose | File |
|---------|------|
| TypeScript baseline | `.tsc-baseline.json` |
| Test config | `vitest.config.ts` |
| ESLint config | `eslint.config.js` |
| Feature flags | `shared/feature-flags/flag-definitions.ts` |

### Documentation

| Purpose | File |
|---------|------|
| Project instructions | `CLAUDE.md` |
| Change log | `CHANGELOG.md` |
| Decisions | `DECISIONS.md` |
| PR verification | `cheatsheets/pr-merge-verification.md` |

---

## Appendix C: Decision Log

### Decision 1: Validation-First Approach

**Date:** December 9, 2025
**Decision:** Validate calculations before optimization
**Rationale:** Cannot optimize what isn't working. Empirical evidence beats hypothetical analysis.

### Decision 2: Conditional Timeline

**Date:** December 9, 2025
**Decision:** Timeline depends on Phase 0 findings
**Rationale:** Honest assessment requires acknowledging uncertainty. Planning for multiple paths is more realistic than committing to a single timeline.

### Decision 3: parseFloat Audit Scope

**Date:** December 9, 2025
**Decision:** Only fix parseFloat in P0 (calculation path) files
**Rationale:** 301 total occurrences, but only ~20 in calculation paths. UI/test parseFloat is low risk.

### Decision 4: Truth Cases as Gate

**Date:** December 9, 2025
**Decision:** 105 truth cases must pass before deployment
**Rationale:** Truth cases represent known-correct calculations. If they fail, code is wrong.

### Decision 5: Dual Waterfall Validation

**Date:** December 9, 2025
**Decision:** Validate BOTH waterfall implementations (tier-based and ledger-based)
**Rationale:** They serve different purposes - tier-based for single-exit Excel parity, ledger-based for fund lifecycle with clawback/recycling.

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v2.18 | 2025-12-09 | Solo Developer | Initial validation-first plan |
| v2.19 | 2025-12-09 | Solo Developer | Integrated feedback: moved runner to Phase 0, added wiring check, updated truth cases to 105 |

### v2.19 Changes

**Accepted from feedback:**
1. Move truth-case runner build from Phase 1A to Phase 0 (eliminates duplication)
2. Add waterfall implementation wiring check (Step 0.7)
3. Adjust Phase 0 timing to "8-12 hours" (honest expectations)
4. Add truth case CI workflow template

**Already completed:**
- Created `docs/waterfall-ledger.truth-cases.json` (15 clawback scenarios)
- Updated truth case count from 90 to 105

**Rejected from feedback:**
- Path overlap refactoring (current DRY-via-reference optimal for solo dev)
- 2-3 hour manual spot-check (excessive overhead, runner catches errors)

---

**End of Document**
