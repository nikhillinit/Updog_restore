# Phase 4B Continuation: Unlock Remaining 9 Suite Failures

**COPY-PASTE KICKOFF PROMPT FOR NEW CONVERSATION**

---

## Context: Previous Session Accomplishments

The database mock infrastructure fix (Phase 4B, Commits A+B) was successfully
completed and merged to main. This eliminated the "Unexpected strict mode
reserved word" loader crash and unlocked 8 test suites.

**Previous session deliverables**:

- **Commit A (66c04e15)**: Golden CJS database-mock.cjs + poolMock (329 lines
  pure CJS, no TS/ESM dependencies)
- **Commit B (6f18d24b)**: Deterministic delegate wiring (auto-link CJS shell to
  TS rich mock)
- **Completion report**: `artifacts/phase4b-completion-report.md`

**Metrics after Commits A+B**:

- Failed: 268 (was 209)
- Skipped: 91 (unchanged)
- Suite Failures: 9 (was 17, unlocked 8 suites ✓)
- Score: 584 (was 725, improved 19% ✓)
- Governance: Rule B compliant (59 < 80 allowance ✓)

**Branch**: Commits A+B have been merged to main. Current branch is `main` with
stable infrastructure.

**IMPORTANT - Baseline Tracking Strategy**:

- **Tracking against Phase 4A baseline** (209/91/17), NOT Phase 4B checkpoint
  (268/91/9)
- **Cumulative Phase 4 progress**: 17 → 9 suites (-8, 47% complete)
- **Total allowance**: 170 NonPassing (17 suites × 10)
- **Used so far**: 59 NonPassing (8 suites unlocked by A+B)
- **Available**: 111 NonPassing (9 remaining suites × 10 + 21 cushion)
- **Why cumulative**: Unified Phase 4 narrative, clear end-to-end improvement
  tracking

---

## Mission: Unlock Remaining 9 Suite Failures

**Objective**: Reduce suite failures from 9 → 0 (or as close as feasible within
governance constraints)

**Target**: Continue Phase 4B foundation hardening by fixing the remaining gated
test suites

**Governance constraint**: Rule B (Suite-unlock) - Cumulative tracking from
Phase 4A baseline

- Original baseline: 17 suite failures, 300 NonPassing (209 failed + 91 skipped)
- Commits A+B unlocked: 8 suites, used 59 of 170 total allowance
- Remaining budget: 111 NonPassing tolerance (for 9 remaining suites)
- Formula: `allowance_total = (17 - currentSuiteFailures) × 10`
- Compliance: `(currentNonPassing - 300) ≤ allowance_total`

---

## Available Intelligence

### 1. Completion Report

**Location**: `artifacts/phase4b-completion-report.md`

**Key findings**:

- Loader crash eliminated (no "Unexpected strict mode reserved word" errors)
- 15 constraint failures identified (all `data_integrity_score`, mock semantics
  gap)
- Constraint fix deferred to Phase 4C (out of scope for infrastructure
  hardening)
- No category shift detected (all failures are test content, not infrastructure)

### 2. Constraint Failures Analysis

**Location**: `artifacts/phase4b-constraint-failures.json`

**Summary**: 15 failures in `time-travel-schema.test.ts`, all caused by mock not
handling NULL/omitted columns properly. This is a **known issue**, deferred to
Phase 4C (mock semantic reform). Do NOT attempt to fix constraint checks in this
session unless explicitly requested.

### 3. Failing Test Signatures

**Location**: `artifacts/phase4b-fails-after-AB.txt` (553 lines)

**Categories**: Database schema tests, integration tests (flags,
approval-guard), service tests (lot-service, snapshot-service)

### 4. Suite Failure Catalog

**Location**: `artifacts/phase4b-remaining-suites.txt`

**9 Gated Suites**:

#### Import/Alias Issues (5 suites):

1. `tests/integration/dev-memory-mode.test.ts`
   - Error: `Cannot find package '@schema'`
   - Root: `server/routes/fund-config.ts`

2. `tests/integration/golden-dataset.test.ts`
   - Error: `Cannot find package 'csv-parse/sync'`
   - Root: `tests/utils/golden-dataset.ts`

3. `tests/integration/operations-endpoint.test.ts`
   - Error: `Cannot find package '@schema'`
   - Root: `server/routes/fund-config.ts`

4. `tests/perf/validator.microbench.test.ts`
   - Error: `Cannot find module '@shared/schemas/parse-stage-distribution'`

5. `tests/integration/__tests__/golden-dataset-regression.test.ts`
   - Error: `Cannot find package 'csv-parse/sync'`
   - Root: `tests/utils/golden-dataset.ts`

#### DOM/Environment Issues (3 suites):

6. `tests/unit/inflight-capacity.quarantine.test.ts`
   - Error: `localStorage is not defined`

7. `tests/unit/wizard-reserve-bridge.test.ts`
   - Error: `window is not defined`

8. `tests/unit/engines/deterministic-reserve-engine.test.ts`
   - Error: `window is not defined`

#### Vitest Mock Issue (1 suite):

9. `tests/unit/api/variance-tracking-api.test.ts`
   - Error: `vi.mock factory has top-level variables`

---

## Technical Context

### Infrastructure Status

- **Database mock**: Stable (golden CJS implementation + poolMock)
- **Delegate wiring**: In place (`tests/setup/db-delegate-link.ts`)
- **Test projects**: Server (Node) + Client (jsdom) properly separated
- **Alias resolution**: Defined in `vitest.config.ts` (lines 11-30)

### Known Issues (Deferred)

- **15 constraint failures**: `data_integrity_score` checks fail on NULL/omitted
  columns (mock semantics gap, Phase 4C)
- **Test fixture standardization**: No `makeValidSnapshotRow()` helpers (Phase
  4C)

### Vitest Config Context

**Alias definitions** (`vitest.config.ts` lines 11-30):

```typescript
const alias = {
  '@/core': resolve(projectRoot, './client/src/core'),
  '@/lib': resolve(projectRoot, './client/src/lib'),
  '@/server': resolve(projectRoot, './server'),
  '@/': resolve(projectRoot, './client/src/'),
  '@': resolve(projectRoot, './client/src'),
  '@shared/': resolve(projectRoot, './shared/'),
  '@shared': resolve(projectRoot, './shared'),
  '@assets': resolve(projectRoot, './assets'),
};
```

**Server project** (lines 86-103): Node environment, includes integration/perf
tests **Client project** (lines 104-126): jsdom environment, includes
unit/client tests

---

## Execution Strategy

### Phase 1: Import/Alias Fixes (5 suites)

**Priority**: High (most common failure type)

**Approach**:

1. **@schema issues** (3 suites):
   - Check if `@schema` alias exists in vitest.config.ts, vite.config.ts,
     tsconfig.json
   - If missing, add consistently across all resolvers:
     - `vitest.config.ts`: `'@schema': resolve(projectRoot, './shared/schemas')`
     - `vite.config.ts`: Same (if app code uses it)
     - `tsconfig.json`: `"@schema/*": ["./shared/schemas/*"]` (if TypeScript
       paths used)
   - Verify `server/routes/fund-config.ts` imports resolve in BOTH test AND
     runtime
   - **Sanity check**: Run one failing suite + one unrelated suite (detect
     global breakage)

2. **csv-parse/sync issues** (2 suites):
   - Check installation: `npm list csv-parse`
   - If missing: `npm install csv-parse`
   - If installed but still failing:
     - Check version supports `/sync` export (v5.0+ required)
     - Verify `package.json` exports field includes `./sync`
     - Check workspace/monorepo scoping (may be in wrong package)
   - If version incompatible: Upgrade `npm install csv-parse@latest`
   - Verify `tests/utils/golden-dataset.ts` can import in test environment

3. **@shared/schemas path** (1 suite):
   - **Case-sensitivity audit**: Exact filename (parseStageDistribution vs
     parse-stage-distribution)
   - Check if file exists: `ls shared/schemas/ | grep -i stage`
   - Verify exact import matches filename: `parse-stage-distribution` vs
     `parseStageDistribution`
   - If path mismatch, fix import in `tests/perf/validator.microbench.test.ts`
   - **Note**: macOS/Windows case-insensitive, Linux CI case-sensitive (common
     failure source)

**Validation**: Run `npx vitest run <file>` after each fix

### Phase 2: DOM/Environment Fixes (3 suites)

**Priority**: Medium

**Approach**:

1. **Identify project assignment**:
   - Check if tests are in wrong project (server vs client)
   - DOM tests should be in client project (jsdom)

2. **Fix project assignment** (prefer file-level overrides first):
   - **Option 1 (lowest risk)**: Add `// @vitest-environment jsdom` at top of
     failing test file
   - **Option 2 (if pattern mismatch)**: Adjust `include` in vitest.config.ts
     client project
   - **Option 3 (if server test needs browser)**: Mock browser dependencies
     instead of moving
   - **Avoid config churn**: Don't change includes unless systematic mismatch
     detected

3. **Verify environment**:
   - `localStorage` and `window` should only be accessed in jsdom tests
   - If server test needs DOM, consider mocking or refactoring

**Validation**: Ensure test runs in correct environment

### Phase 3: Vitest Mock Fix (1 suite)

**Priority**: Low (single suite)

**Approach**:

1. **Read `variance-tracking-api.test.ts`**:
   - Find `vi.mock()` calls
   - Identify top-level variables in factory functions

2. **Fix factory hoisting**:
   - Move variable declarations inside factory
   - OR use `vi.hoisted()` for shared setup

3. **Verify mock setup**:
   - Ensure no async operations in factory
   - Confirm mock is hoisted correctly

**Validation**: Run test, check for mock initialization errors

---

## Commit Strategy (One Root Cause Per Commit)

**Rationale**: Multiple suites often share root causes. Commit by hypothesis,
not by suite.

**Recommended sequence**:

1. **Alias fix commit** (likely unlocks 3 @schema suites at once)
   - Add @schema to all resolvers (vitest + vite + tsconfig)
   - Validate: Run dev-memory-mode + operations-endpoint + one unrelated suite

2. **Dependency fix commit** (unlocks 2 csv-parse suites)
   - Install/upgrade csv-parse with /sync export
   - Validate: Run golden-dataset + golden-dataset-regression

3. **Path/case fix commit** (unlocks 1 @shared/schemas suite)
   - Fix parse-stage-distribution path/casing
   - Validate: Run validator.microbench

4. **DOM environment fixes** (unlocks 3 DOM suites)
   - Add file-level jsdom overrides or adjust includes
   - Validate: Run each (inflight-capacity, wizard-reserve-bridge,
     deterministic-reserve-engine)

5. **vi.mock hoisting fix** (unlocks 1 vitest mock suite)
   - Fix top-level variables in variance-tracking-api
   - Validate: Run variance-tracking-api

**After each commit**:

- Extract full suite failure list (not just counts)
- Compare identities: Which suites disappeared from gate list?
- Run one unrelated suite (sanity check for global breakage)

---

## Execution Checklist

### Before Starting

- [ ] Confirm branch is `main` with Commits A+B merged
- [ ] Run baseline: `npm run baseline:test:check`
- [ ] Verify current metrics: 268 failed, 91 skipped, 9 suites, score 584

### Per Suite Unlock

- [ ] Identify root cause (import/env/mock)
- [ ] Apply minimal fix (single concern)
- [ ] Run suite: `npx vitest run <file>`
- [ ] Run baseline: `npm run baseline:test:check`
- [ ] Extract metrics:
      `node -e "const s=require('./artifacts/test-summary.json'); console.log({failed:s.counts.failed,suiteFailures:s.counts.failed,skipped:s.counts.skipped,suiteFailures:s.gate.suiteFailures,score:s.counts.failed+s.counts.skipped+(s.gate.suiteFailures*25)});"`
- [ ] Validate governance (cumulative):
      `(currentNonPassing - 300) ≤ (17 - currentSuites) × 10`
- [ ] Example: If 8 suites unlocked → allowance 80, if actual delta 59 →
      compliant ✓
- [ ] Extract suite failure identities:
      `node -e "const s=require('./artifacts/test-summary.json'); s.gate.suiteFailureFiles.forEach(f=>console.log(f.file));"`
- [ ] Commit with metrics in message

### After All Unlocks

- [ ] Final baseline check
- [ ] Compare to Phase 4A baseline: 725 → current (complete Phase 4 improvement)
- [ ] Cumulative unlocked: 17 → 0 (or final count)
- [ ] Cumulative allowance used: (17 - final) × 10 vs actual NonPassing increase
- [ ] Update phase4b-completion-report.md
- [ ] Document any deferred issues

---

## Guardrails

### 1. No Infrastructure Regressions

**Check**: After each fix, verify no loader crashes return

```bash
npx vitest run --reporter=verbose 2>&1 | grep -i "unexpected strict mode\|module.exports.*\.ts"
```

**Expected**: No matches (loader crashes eliminated)

### 2. Governance Compliance

**Rule B**: Cumulative suite unlock allowance from Phase 4A baseline

```
baseline_nonPassing = 300 (Phase 4A: 209 failed + 91 skipped)
unlocked_total = 17 - currentSuiteFailures
allowance_total = unlocked_total × 10
actual = currentNonPassing - baseline_nonPassing
compliant = actual ≤ allowance_total

# Current state validation:
# unlocked_total = 17 - 9 = 8
# allowance_total = 8 × 10 = 80
# actual = 359 - 300 = 59
# compliant = 59 ≤ 80 ✓ (21 cushion remaining)
```

### 3. Score Tracking

**Formula**: `failed + skipped + (suiteFailures × 25)` **Requirement**: Score
must decrease OR stay within Rule B allowance

### 4. Mock Semantics Boundary

**Do NOT fix**:

- `data_integrity_score` constraint checks
- DEFAULT/NOT NULL/CHECK-NULL behavior
- Test fixtures using omitted columns

**Rationale**: These are Phase 4C scope (mock semantic reform)

---

## Success Criteria

**Minimum**:

- [ ] Suite failures: 9 → 6 or lower (unlock at least 3 suites)
- [ ] No loader crashes (infrastructure stable)
- [ ] Governance compliant (Rule B)

**Target**:

- [ ] Suite failures: 9 → 0 (unlock all remaining suites)
- [ ] All import/alias issues resolved
- [ ] Governance compliant (cumulative: actual ≤ 170 allowance)
- [ ] No infrastructure regressions (loader crashes, global breakage)

**Secondary (Nice-to-have)**:

- [ ] Score improvement: 584 → 400 or lower
- [ ] Failed count stable or decreasing (unlock may increase short-term)

**Note**: Unlocking suites reveals RED phase tests, which may temporarily
increase failed counts. This is expected and acceptable under Rule B. Primary
goal is **infrastructure hardening** (unlock suites), not **test content fixes**
(make tests pass).

---

## Quick Start Commands

```bash
# Verify current state
git branch
git log --oneline -3
npm run baseline:test:check

# Extract current metrics
node -e "const s=require('./artifacts/test-summary.json'); console.log({failed:s.counts.failed,skipped:s.counts.skipped,suiteFailures:s.gate.suiteFailures,score:s.counts.failed+s.counts.skipped+(s.gate.suiteFailures*25)});"

# Check suite failure list
cat artifacts/phase4b-remaining-suites.txt

# Test single suite
npx vitest run tests/integration/dev-memory-mode.test.ts

# Quick alias check
grep -A 10 "const alias" vitest.config.ts
```

---

## References

- **Completion Report**: `artifacts/phase4b-completion-report.md`
- **Constraint Failures**: `artifacts/phase4b-constraint-failures.json`
- **Failing Tests**: `artifacts/phase4b-fails-after-AB.txt`
- **Suite Catalog**: `artifacts/phase4b-remaining-suites.txt`
- **Vitest Config**: `vitest.config.ts` (alias lines 11-30, projects lines
  85-126)
- **Governance**: Phase 4B uses Rule B (suite-unlock allowance)

---

## Notes for AI Agent

1. **Start with import/alias fixes** (5 suites, highest ROI)
2. **One suite at a time** (validate metrics after each)
3. **Skip constraint fixes** (deferred to Phase 4C)
4. **Track governance closely** (Rule B: 111 remaining of 170 total allowance)
5. **Document deferred issues** (for Phase 4C or future sprints)

**Remember**: The goal is **infrastructure hardening** (unlock suites), not
**test content fixes** (make tests pass). Unlocking suites reveals RED phase
tests, which is expected and acceptable under Rule B.
