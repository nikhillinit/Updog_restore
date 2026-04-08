---
phase: 02-backtesting-scenario-comparison-rewrite-p1
plan: 05
subsystem: backtesting
tags:
  - phoenix-truth-case
  - backtesting
  - monte-carlo
  - scenario-comparison
  - financial-crisis-2008
  - deterministic-regression
  - snapshot-locked
  - tdd

# Dependency graph
requires:
  - phase: 02-backtesting-scenario-comparison-rewrite-p1
    provides:
      Plan 02-02 wired marketParameters through SimulationConfig and both MC
      engines via the shared distribution-overrides helper. The override is what
      makes scenario-specific output observable.
  - phase: 02-backtesting-scenario-comparison-rewrite-p1
    provides:
      Plan 02-03 rewrote runScenarioComparisons to inject marketParameters per
      scenario and added options.randomSeed plumbing through
      compareScenariosDetailed/compareScenarios. This plan consumes that
      plumbing.
provides:
  - 'docs/backtesting-scenario.truth-cases.json -- single GFC truth case entry,
    snapshot-locked sample percentiles at 4-decimal tolerance, with randomSeed
    12345 and the option (a) failureRate translation locked in.'
  - 'tests/unit/truth-cases/backtesting-scenario.test.ts -- 4 tests in 1 file:
    precondition (NODE_ENV=test), snapshot match, determinism check (re-run is
    byte-identical), D-09 hard requirement (GFC mean < bull market mean).'
  - 'Phoenix truth count goes from 258/258 across 5 files to 262/262 across 6
    files.'
  - "REQ-BCK-01 acceptance gate 3 of 3 closed: 'truth case for at least one
    historical market regime passes'."
affects:
  - 02-06-plan-doc-and-verification-PLAN (the before/after table can be
    populated from the GFC entry in _baselines/before-percentiles.json (Plan
    02-01) and the snapshot in docs/backtesting-scenario.truth-cases.json (this
    plan); the failureRate translation choice is documented in 02-02-SUMMARY.md
    and re-stated below)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Phoenix truth case for end-to-end calc paths: load JSON fixture via
      static import (NOT readFileSync + process.cwd() -- the latter is undefined
      under vitest workers in this project), iterate via for-of, assert with
      expect.toBeCloseTo at 4 decimals.'
    - 'Mock db with synthetic baseline + fund so the traditional
      MonteCarloEngine can complete getBaselineData and getPortfolioInputs
      without Postgres, while keeping varianceReports.findMany empty so
      calibrateDistributions falls through to getDefaultDistributions -- the
      override target wired by Plan 02-02.'
    - 'Engine determinism via NODE_ENV=test gate: shouldEnableStreaming() in
      monte-carlo-service-unified.ts:502-507 returns false when NODE_ENV !==
      production, which forces the auto-selector to traditional, which has a
      local PRNG (no Math.random global patch -- RESEARCH Pitfall #1).'
    - 'Snapshot capture via temporary console.warn block: when authoring a new
      truth case with placeholder zeros, add a one-shot SNAPSHOT_CAPTURE block
      that dumps the actual values when expected.mean === 0, then snapshot-lock
      and remove the block. Faster than reading values one-at-a-time from
      assertion failures.'

key-files:
  created:
    - docs/backtesting-scenario.truth-cases.json
    - tests/unit/truth-cases/backtesting-scenario.test.ts
    - .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-05-SUMMARY.md
  modified: []

key-decisions:
  - "Use the public DistributionSummary contract field names (mean, p5, p25,
    median, p75, p95) for the JSON expected block -- NOT the plan's literal
    field names (which said p50). The simulationResultToDistributionSummary
    helper at server/services/backtesting-service.ts:329-352 maps
    result.irr.percentiles.p50 to DistributionSummary.median, so locking against
    perf.median is the only contract that survives a future refactor."
  - "Use a static JSON import (import truthCasesRaw from
    '../../../docs/backtesting-scenario.truth-cases.json') instead of
    readFileSync(join(process.cwd(), ...)). The latter resolves process.cwd() to
    undefined inside the vitest worker (project-specific quirk), producing
    'undefined is not valid JSON' before any test runs. xirr.test.ts uses the
    same static-import pattern."
  - "Keep the precondition assertion 'NODE_ENV is test' as the FIRST test in the
    file. RESEARCH Pitfall #1 (streaming engine Math.random patch) means
    determinism is only reliable through the traditional engine, and
    NODE_ENV=test is what gates streamingEnabled to false. If a future runner
    sets NODE_ENV=production, the precondition fails LOUDLY before the snapshot
    test runs and the failure mode is obvious."
  - "Mock funds.findFirst with a synthetic fund (size 100M) and
    fundBaselines.findFirst with a synthetic baseline (deployedCapital 50M,
    sectorDistribution, stageDistribution, averageInvestment) so the traditional
    engine completes its setup. The plan's spec said 'Mock ONLY db' which is
    what this is -- the engine itself is real."
  - "Re-prime mockDb in beforeEach so vi.clearAllMocks() does not blank the
    baseline + fund returns. The MEMORY note 'Vitest restoreAllMocks Gotcha'
    applies here: vi.fn().mockResolvedValue(X) set in vi.hoisted is wiped by
    clearAllMocks unless re-primed. The previous PR's
    backtesting-service.test.ts does the same re-prime dance."
  - "Use snapshotRuns=1000 (not the plan's 5000 default) for the snapshot test.
    1000 runs is fast enough to keep CI under 5s per RESEARCH Q12 and still
    produces stable percentiles at 4-decimal tolerance with the deterministic
    PRNG."

patterns-established:
  - 'End-to-end Phoenix truth case for backtesting calc paths: real
    BacktestingService instance, mocked db only, real engine, fixed randomSeed,
    snapshot-locked at 4 decimals, plus a determinism check and a directional
    sanity check (GFC < bull). New truth-case files for backtesting subsystems
    should follow this template.'

requirements-completed:
  - REQ-BCK-01

# Metrics
duration: ~17min
started: 2026-04-08T00:13:11Z
completed: 2026-04-08T00:30:19Z
---

# Phase 02 Plan 05: Phoenix Truth Case for GFC Scenario Summary

**Locked the rewritten runScenarioComparisons to a deterministic Phoenix truth
case against the 2008 Global Financial Crisis scenario. The truth case runs the
REAL Monte Carlo engine end-to-end with mocked db only, pins randomSeed 12345,
asserts snapshot-locked sample percentiles at 4-decimal tolerance, and proves
both byte-identical determinism and the D-09 directional requirement (GFC mean <
bull market mean). Closes the third REQ-BCK-01 acceptance gate.**

## Performance

- **Duration:** ~17 minutes
- **Started:** 2026-04-08T00:13:11Z
- **Completed:** 2026-04-08T00:30:19Z
- **Tasks:** 1 / 1
- **Files created:** 2 (1 JSON fixture + 1 test file)
- **Files modified:** 0

## Accomplishments

- **`docs/backtesting-scenario.truth-cases.json`** created with one GFC truth
  case entry. Snapshot-locked expected percentiles at 4-decimal tolerance:

  | Field    | Locked value           |
  | -------- | ---------------------- |
  | `mean`   | `0.08086158888888005`  |
  | `p5`     | `-0.0530794158687712`  |
  | `p25`    | `0.029315112985174738` |
  | `median` | `0.08226558113635811`  |
  | `p75`    | `0.1342445708700794`   |
  | `p95`    | `0.21076219337864854`  |

- **`tests/unit/truth-cases/backtesting-scenario.test.ts`** created with 4
  tests:
  1. **Precondition:** asserts `NODE_ENV === 'test'` so the streaming engine
     stays disabled (RESEARCH Pitfall #1: streaming patches `Math.random`
     globally and breaks determinism).
  2. **Snapshot match:** runs
     `service.compareScenarios(1, ['financial_crisis_2008'], 1000, { randomSeed: 12345 })`
     against the locked snapshot at 4-decimal tolerance.
  3. **Determinism check:** runs the same call twice and asserts
     `result1[0].simulatedPerformance` equals `result2[0].simulatedPerformance`
     byte-identically. Catches any future Math.random leakage in the engine.
  4. **D-09 hard requirement:** runs GFC and `bull_market_2021` separately with
     the same seed and asserts
     `gfc[0].simulatedPerformance.mean < bull[0].simulatedPerformance.mean`.
     Validates that the failureRate translation choice (Plan 02-02 option (a))
     produces directionally correct math.

- **Phoenix truth count:** went from `258/258` across 5 test files to `262/262`
  across 6 test files. The new file added 4 tests, exceeding the plan's `>=259`
  requirement.

- **REQ-BCK-01 closed.** This is the third and final acceptance gate of
  REQ-BCK-01 (after Plan 02-02's engine seam and Plan 02-03's
  runScenarioComparisons rewrite). The traceability table in REQUIREMENTS.md
  will be updated as part of the metadata commit.

## failureRate translation: option (a) confirmed

Plan 02-02 chose **option (a): scale `irr.mean` by `(1 - failureRate)`** as the
minimum-viable, fully-encapsulated translation inside `calibrateDistributions`.
This truth case locks that choice in. Re-stating for Plan 02-06's plan doc:

> The Phase 2 rewrite scaled `irr.mean` by `(1 - failureRate)` per scenario
> (option (a)). For GFC: failureRate=0.45, so scale=0.55. For bull_market_2021:
> failureRate=0.15, so scale=0.85. The locked snapshot mean for GFC (~0.0809)
> and the observed bull mean (~0.1259) confirm the directional ordering and the
> magnitude is consistent with `0.55 * 0.147 ≈ 0.081` (where 0.147 is the
> default `irrMean` from `getDefaultDistributions` \* the exitMultiplier
> translation). Future phases may upgrade to option (b) (binomial gate inside
> `generateSingleScenario`) if statistical defensibility becomes a P1 concern.

## Before/after percentile comparison (for Plan 02-06)

The "before" values come from
`.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/before-percentiles.json`
which Plan 02-01 captured against the analytic-rescale path. NOTE: those
"before" values were captured against a MOCKED engine (the unit-test
`mockSimulationResult` returns hardcoded `irr.statistics.mean=0.18` and
`percentiles={p5:0.05,...,p95:0.35}`), not against a real fund. The "after"
values in the truth case JSON were captured against a REAL traditional engine
run with the synthetic baseline + fund mock and `randomSeed: 12345`. The two are
therefore NOT directly numerically comparable -- the comparison is structural
("analytic 2-parameter rescale of a single mocked default run" versus "real
per-scenario engine run with marketParameters injected").

For the Plan 02-06 plan doc, the more useful contrast is:

| Path                   | mean   | p5      | p25    | median | p75    | p95    |
| ---------------------- | ------ | ------- | ------ | ------ | ------ | ------ |
| BEFORE (analytic)      | 0.0864 | 0.0065  | 0.0536 | 0.0821 | 0.1192 | 0.1663 |
| AFTER (sample, locked) | 0.0809 | -0.0531 | 0.0293 | 0.0823 | 0.1342 | 0.2108 |

The post-rewrite p5 dropped from `0.0065` to `-0.0531`: the analytic rescale was
systematically too narrow on the downside tail because it was a 2-parameter
shift of a default run, not a real distribution. The wider spread on the AFTER
row is the headline correctness improvement: real GFC volatility now shows up in
the percentiles instead of being smoothed out by a single multiply-by-scale.

## Task Commits

1. **Task 1: Add Phoenix truth case JSON + test for GFC scenario** -- `30feec85`
   (test)

**Plan metadata commit:** pending (this SUMMARY.md + STATE.md + ROADMAP.md +
REQUIREMENTS.md bundled by the GSD executor final commit step).

## Files Created/Modified

- **`docs/backtesting-scenario.truth-cases.json`** -- NEW (28 lines after
  prettier). One GFC truth case entry with snapshot-locked sample percentiles,
  randomSeed 12345, and a `notes` field documenting the re-snapshot procedure.
- **`tests/unit/truth-cases/backtesting-scenario.test.ts`** -- NEW (~210 lines
  after prettier). 4 tests: precondition, snapshot match, determinism check,
  D-09 hard requirement.
- **`.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-05-SUMMARY.md`**
  -- NEW (this file). Closes Plan 02-05.

## Decisions Made

See `key-decisions` in frontmatter. Most consequential: using the
DistributionSummary contract field names (`median` not `p50`), using a static
JSON import (avoiding the `process.cwd() === undefined` bug under vitest
workers), and providing a synthetic baseline + fund in the db mock so the
traditional engine completes its setup.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Static JSON import instead of readFileSync**

- **Found during:** First test run after authoring with the plan's literal spec.
- **Issue:** The plan's example test code used
  `JSON.parse(readFileSync(join(process.cwd(), 'docs/backtesting-scenario.truth-cases.json'), 'utf-8'))`
  -- but `process.cwd()` resolves to `undefined` inside the vitest worker for
  this project, producing `SyntaxError: "undefined" is not valid JSON` before
  any test runs. The other truth-case files in `tests/unit/truth-cases/` use
  static JSON imports (e.g.,
  `import xirrCases from '../../../docs/xirr.truth-cases.json'`).
- **Fix:** Switched to a static JSON import:
  `import truthCasesRaw from '../../../docs/backtesting-scenario.truth-cases.json'`,
  cast to `BacktestingTruthCase[]`. Also dropped the unused
  `readFileSync`/`join` imports.
- **Files modified:** `tests/unit/truth-cases/backtesting-scenario.test.ts`
- **Verification:** Test now loads the JSON correctly and the snapshot
  assertions run.
- **Committed in:** `30feec85`

**2. [Rule 3 - Blocking] Mock db needed synthetic baseline + fund**

- **Found during:** First test run after fixing issue #1.
- **Issue:** The plan's spec said "Mocks ONLY `db` (varianceReports.findMany
  returns empty so calibrateDistributions falls through to
  getDefaultDistributions; fundBaselines.findFirst returns null)". With
  `fundBaselines.findFirst === null`, the traditional engine throws "No suitable
  baseline found for simulation" at `monte-carlo-engine.ts:593`, then
  `enableFallback` triggers a streaming fallback which fails on missing
  `DATABASE_URL`. The scenario gets caught and pushed to `failedScenarios`,
  leaving an empty `comparisons` array and the snapshot test fails with
  "expected [] to have a length of 1 but got +0".
- **Fix:** Provided a synthetic baseline (id, fundId, deployedCapital,
  irr/multiple/dpi/tvpi/totalValue, sectorDistribution, stageDistribution,
  averageInvestment, isActive, isDefault, createdAt) and a synthetic fund (id,
  name, size) in the `vi.hoisted` mock. The traditional engine now completes
  `getBaselineData` and `getPortfolioInputs`, falls through to
  `getDefaultDistributions` (because `varianceReports.findMany` is still empty),
  and applies the marketParameters override per Plan 02-02.
- **Files modified:** `tests/unit/truth-cases/backtesting-scenario.test.ts`
- **Verification:** Pino logs show `backtesting.scenario_comparison.completed`
  events with real `irrMean` / `irrP5` / `irrP95` values, no more "DATABASE_URL
  is not set" failure-event spam. All 4 tests green.
- **Committed in:** `30feec85`

**3. [Rule 3 - Process] beforeEach was wiping the baseline mock**

- **Found during:** Same test run as issue #2.
- **Issue:** The `beforeEach` block re-primed
  `mockDb.query.fundBaselines.findFirst.mockResolvedValue(null)` after
  `vi.clearAllMocks()`, which immediately undid the baseline mock from
  `vi.hoisted` and reverted to the broken state.
- **Fix:** Updated `beforeEach` to re-prime `fundBaselines.findFirst` to
  `MOCK_BASELINE` and `funds.findFirst` to `MOCK_FUND`. Hoisted those two
  constants out of the closure so beforeEach can reference them.
- **Files modified:** `tests/unit/truth-cases/backtesting-scenario.test.ts`
- **Verification:** Tests stay green across multiple runs.
- **Committed in:** `30feec85`

**4. [Rule 1 - Bug] DistributionSummary uses `median` not `p50`**

- **Found during:** Snapshot capture step.
- **Issue:** The plan's spec said the JSON should contain
  `expected.simulatedPerformance.{mean, p5, p25, p50, p75, p95}` -- but the
  actual `DistributionSummary` type (the runtime contract returned by
  `simulationResultToDistributionSummary` at
  `server/services/backtesting-service.ts:341-351`) has `median: number` not
  `p50: number`. The helper maps `result.irr.percentiles.p50` to
  `DistributionSummary.median`. If the test asserted on `perf.p50`, it would
  assert on `undefined` and silently pass at `toBeCloseTo(0, 4)` for any zero
  baseline.
- **Fix:** Updated both the JSON schema (`expected.simulatedPerformance.median`)
  and the test interface + assertion to use `median`. Updated the
  `BacktestingTruthCase` TypeScript interface at the top of the test file to
  mirror the runtime contract.
- **Files modified:** `tests/unit/truth-cases/backtesting-scenario.test.ts`,
  `docs/backtesting-scenario.truth-cases.json`
- **Verification:** Snapshot now locks all six values correctly. The test would
  have caught this on its own at the toBeCloseTo step (because
  `undefined.toBeCloseTo(0, 4)` throws), but explicitly using `median` matches
  the contract and is self-documenting.
- **Committed in:** `30feec85`

**Total deviations:** 4 auto-fixed (3 blocking infrastructure issues + 1
contract-correctness fix). **Impact on plan:** All four were inside the single
test file scope. None required changes to source code outside
`tests/unit/truth-cases/` and `docs/`. The plan's literal example code had
several drift points from the actual project conventions (process.cwd() behavior
in vitest workers, the `median`-vs-`p50` field name on DistributionSummary, the
need for a synthetic baseline so the engine completes setup), but the spec
INTENT was preserved exactly: a real end-to-end Phoenix truth case with mocked
db only, fixed seed, snapshot-locked percentiles, and a determinism check.

## Issues Encountered

- **Linter Edit Hook stripped imports twice during the readFileSync ->
  static-import migration.** This is documented in MEMORY.md under "Linter Edit
  Hook -- Import Ordering". The mitigation (do the body change FIRST, THEN add
  the import, OR combine both in a single Edit call) worked on the second try
  via a single Edit that replaced both the import block and the consuming code
  together.
- **No bugs in the engine path.** Plans 02-02 and 02-03 produced byte-identical
  determinism on the first try via the traditional engine's local PRNG. The
  determinism check test passes -- which is real validation of Plan 02-02's
  choice to not touch the streaming engine's Math.random patch.

## Verification Gate Results

- **`npm run check`** -- 0 new TypeScript errors (baseline clean, 0/0)
- **`npm test -- backtesting-scenario`** -- 4/4 passing (precondition +
  snapshot + determinism + GFC < bull)
- **`npm run phoenix:truth`** -- 262/262 across 6 test files (was 258/258 across
  5 files; gained 4 tests in the new
  `tests/unit/truth-cases/backtesting-scenario.test.ts`)
- **`npx eslint tests/unit/truth-cases/backtesting-scenario.test.ts`** -- 0
  errors, 0 warnings
- **No `__tests__/` subdirectory introduced** (orphan-test pre-push hook passes)
- **Pre-commit hook** -- prettier reformat + eslint --fix + conventional commit
  format check all passed in commit `30feec85`

## Note for Plan 02-06

The before/after table is now ready to populate. Sources:

- **BEFORE (analytic rescale, Plan 02-01 baseline):**
  `.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/before-percentiles.json`
  -- the GFC entry at `.scenarios[0]` has `mean=0.0864`, `p5=0.0065`,
  `p25=0.0536`, `median=0.0821`, `p75=0.1192`, `p95=0.1663`.
- **AFTER (sample percentiles, this plan):**
  `docs/backtesting-scenario.truth-cases.json` -- the GFC entry has
  `mean=0.0809`, `p5=-0.0531`, `p25=0.0293`, `median=0.0823`, `p75=0.1342`,
  `p95=0.2108`.
- **Important caveat:** The two are not directly numerically comparable because
  the BEFORE numbers were captured against a mocked engine (Plan 02-01's
  `_baselines/before-percentiles.json` records the analytic rescale applied to a
  hardcoded `mockSimulationResult`), while the AFTER numbers are captured
  against a real engine with synthetic baseline + fund. The STRUCTURAL contrast
  (analytic 2-parameter rescale vs. real per-scenario MC injection) is what
  matters for the plan doc, not the literal delta.

The failureRate translation choice is documented above (option (a)) and in
`02-02-SUMMARY.md`. Plan 02-06 should call this out as "minimum-viable; can be
revisited in a future phase if statistical defensibility becomes a P1 concern."

## Self-Check: PASSED

**Files verified:**

- FOUND: `docs/backtesting-scenario.truth-cases.json` (verified via
  `git ls-files`)
- FOUND: `tests/unit/truth-cases/backtesting-scenario.test.ts` (verified via
  `git ls-files`)
- FOUND:
  `.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-05-SUMMARY.md`
  (this file)

**Commits verified:**

- FOUND: `30feec85` (Task 1: Phoenix truth case JSON + test)

**Acceptance criteria (grep counts):**

- `forceEngine|NODE_ENV` in test file: 5 (>= 1) PASS
- `vi.mock.*unifiedMonteCarloService` in test file: 0 (engine MUST NOT be
  mocked) PASS
- `BacktestingService` in test file: 4 (>= 1) PASS
- `compareScenarios` in test file: 10 (>= 2) PASS
- `randomSeed` in test file: 4 (>= 1) PASS
- `12345` in JSON: 2 (>= 1, plan said 1; appears in input.options.randomSeed and
  the notes field) PASS
- JSON expected.simulatedPerformance has 6 numeric fields with NON-ZERO values
  PASS

**Automated checks:**

- `npm run check` (baseline:check, client + server + shared): 0 new TypeScript
  errors PASS
- `npm test -- backtesting-scenario`: 4/4 passing PASS
- `npm run phoenix:truth`: 262/262 across 6 test files (was 258/258 across 5
  files) PASS
- `npx eslint tests/unit/truth-cases/backtesting-scenario.test.ts`: 0 errors, 0
  warnings PASS
- No `__tests__/` subdirectory introduced (orphan-test hook passes) PASS

## Next Phase Readiness

- **Plan 02-06 is unblocked.** The before/after table can be populated using the
  GFC entry in `_baselines/before-percentiles.json` (BEFORE) and
  `docs/backtesting-scenario.truth-cases.json` (AFTER), with the caveat noted
  above. The failureRate translation choice (option (a)) is locked by the
  snapshot.
- **REQ-BCK-01 is fully complete after this plan.** Plans 02-02 (engine seam),
  02-03 (rewrite), and 02-05 (truth case) together close all three acceptance
  gates. Plan 02-05's executor is responsible for the final
  `requirements mark-complete REQ-BCK-01` call (per Plan 02-02's SUMMARY, which
  deliberately rolled back its own premature mark-complete to defer to this
  plan).
- **Plan 02-04 (severity reclassification) already landed** -- only Plan 02-06
  (plan doc + verification) remains for Phase 2 completion.

---

_Phase: 02-backtesting-scenario-comparison-rewrite-p1_ _Plan: 05_ _Completed:
2026-04-08_
