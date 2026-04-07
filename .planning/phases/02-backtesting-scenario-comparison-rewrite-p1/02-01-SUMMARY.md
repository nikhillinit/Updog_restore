---
phase: 02-backtesting-scenario-comparison-rewrite-p1
plan: 01
subsystem: testing
tags: [vitest, backtesting, monte-carlo, fixture, baseline-capture]

# Dependency graph
requires: []
provides:
  - "Committed JSON fixture of analytic-rescale percentiles for all five
    historical scenarios (the 'before' half of D-12's before/after comparison
    table)"
  - 'Opt-in baseline-capture seam in
    tests/unit/services/backtesting-service.test.ts that can be re-run on demand
    via CAPTURE_BASELINE=1'
affects:
  - 02-03-runscenariocomparisons-rewrite (deletes the analytic code path
    captured here)
  - 02-06-plan-doc-and-verification (reads the JSON to populate the before/after
    comparison table)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Opt-in fixture capture via env-var gate (process.env['CAPTURE_BASELINE']
      === '1') -- the describe block is a no-op in normal CI runs and only
      writes to disk when the operator opts in"
    - "Use vi.importActual<typeof import('node:fs')>('node:fs') inside an opt-in
      test when tests/setup/node-setup.ts globally stubs
      fs.writeFileSync/readFileSync; the global mock is the right default but
      the gated capture has to bypass it"

key-files:
  created:
    - .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/before-percentiles.json
  modified:
    - tests/unit/services/backtesting-service.test.ts

key-decisions:
  - "Use vi.importActual('node:fs') instead of dynamic import('node:fs') because
    tests/setup/node-setup.ts globally mocks fs for all server-side tests;
    without vi.importActual the writeFileSync/readFileSync calls return
    undefined and the JSON parse on read-back throws SyntaxError"
  - "Append the new describe block as a SIBLING of the outer
    describe('BacktestingService', ...) so existing test bodies are completely
    untouched and the gate cannot affect normal CI runs"
  - 'Persist the baseline fixture under .planning/phases/.../_baselines/ rather
    than tests/fixtures/ because the JSON is plan-doc context, not a test
    fixture, and its lifecycle is owned by Phase 2 (born here, consumed by
    02-06, untouched after 02-03 lands)'
  - "Stamp the captured JSON with codePath: 'analytic-rescale (pre Plan 02-03
    rewrite)' so Plan 02-06 can refuse to compare against it if the file was
    accidentally re-captured AFTER Plan 02-03 deleted applyMarketAdjustment"

patterns-established:
  - 'Phase 2 baseline-capture pattern: gated describe block + vi.importActual
    for real fs + serialized=JSON.stringify(...) defensive null check + readback
    assertion to confirm the file is on disk before declaring success'

requirements-completed: [REQ-BCK-03]

# Metrics
duration: ~25min
completed: 2026-04-07
---

# Phase 02 Plan 01: Baseline Capture Summary

**Locked the analytic-rescale percentiles for all five historical scenarios into
a committed JSON fixture so Plan 02-06's plan doc can show a real before/after
comparison after Plan 02-03 deletes applyMarketAdjustment.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-07T23:11:00Z
- **Completed:** 2026-04-07T23:18:00Z
- **Tasks:** 1
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- Added an opt-in `Phase 2 baseline capture (opt-in)` describe block at lines
  608-714 of `tests/unit/services/backtesting-service.test.ts` (additive only --
  no existing test bodies modified)
- The block is gated behind `process.env['CAPTURE_BASELINE'] === '1'` so it is a
  no-op in normal CI runs (verified: `npm test -- backtesting-service` reports
  21 tests; with `CAPTURE_BASELINE=1` it reports 22)
- Captured `simulatedPerformance` and `marketParameters` for all five historical
  scenarios (`financial_crisis_2008`, `dotcom_bust_2000`, `covid_2020`,
  `bull_market_2021`, `rate_hikes_2022`) into
  `.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/before-percentiles.json`
- The JSON's `codePath` field is stamped
  `analytic-rescale (pre Plan 02-03 rewrite)` so 02-06 can detect (and refuse)
  any accidental re-capture against the post-rewrite code path
- `npm run check` (TypeScript baseline) is green: 0 errors

### Captured percentiles for `financial_crisis_2008` (sanity check for 02-06)

```json
{
  "scenario": "financial_crisis_2008",
  "simulatedPerformance": {
    "mean": 0.08639999999999999,
    "median": 0.08207999999999999,
    "p5": 0.006453,
    "p25": 0.053595,
    "p75": 0.11920499999999998,
    "p95": 0.16634699999999997,
    "min": -0.03509999999999998,
    "max": 0.20789999999999997,
    "standardDeviation": 0.04859999999999999
  },
  "marketParameters": {
    "exitMultiplierMean": 1.2,
    "exitMultiplierVolatility": 1.5,
    "failureRate": 0.45,
    "followOnProbability": 0.3,
    "holdPeriodYears": 8
  }
}
```

These numbers are produced by `applyMarketAdjustment` in
`server/services/backtesting-service.ts:704-738` -- the analytic 2-parameter
rescale that Plan 02-03 will delete. After 02-03 lands, re-running the same
gated capture would produce sample percentiles from per-scenario MC runs
instead. Plan 02-06 will diff this `simulatedPerformance` block against the
post-rewrite numbers in its before/after comparison table.

## Task Commits

1. **Task 1: Add opt-in baseline-capture describe block + commit captured JSON
   fixture** -- `fbc2ad32` (test)

## Files Created/Modified

- `.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/before-percentiles.json`
  -- new fixture, 129 lines, captured analytic-rescale percentiles + market
  parameters for all 5 historical scenarios + the engine-mock IRR statistics
  that drove the capture
- `tests/unit/services/backtesting-service.test.ts` -- added 107-line opt-in
  `Phase 2 baseline capture (opt-in)` describe block at the bottom of the file
  (lines 608-714), as a sibling of the outermost
  `describe('BacktestingService', ...)`. No existing test bodies modified.

## Decisions Made

See `key-decisions` in frontmatter. Most consequential: using
`vi.importActual('node:fs')` instead of `import('node:fs')` because
`tests/setup/node-setup.ts` (lines 15-28) globally stubs
`fs.writeFileSync`/`readFileSync` for ALL server-side tests. Without
`vi.importActual` the test would silently fail to write the fixture and the
read-back assertion would throw `SyntaxError: "undefined" is not valid JSON`.
This is documented inline in the test file so future readers see why the
indirection is necessary.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Switched node:fs import from `import('node:fs')` to
`vi.importActual('node:fs')`**

- **Found during:** Task 1 (first run of
  `CAPTURE_BASELINE=1 npm test -- backtesting-service`)
- **Issue:** The test failed with `SyntaxError: "undefined" is not valid JSON`
  because `tests/setup/node-setup.ts` globally mocks the `fs` module for
  server-side tests, replacing `writeFileSync`/`readFileSync` with `vi.fn()`
  stubs that return `undefined`. The plan's spec used a plain
  `await import('node:fs')` which resolves to the mocked module. The fixture
  file was never written to disk and the read-back returned `undefined`.
- **Fix:** Changed to
  `await vi.importActual<typeof import('node:fs')>('node:fs')` so the gated test
  bypasses the global fs mock and hits the real filesystem. Added an inline
  comment explaining the gotcha so future readers don't re-trip on it.
- **Files modified:** `tests/unit/services/backtesting-service.test.ts`
- **Verification:** `CAPTURE_BASELINE=1 npm test -- backtesting-service` reports
  22/22 passing and the JSON file is on disk with all 5 scenarios. Without the
  env var, 21/21 still pass.
- **Committed in:** `fbc2ad32` (Task 1 commit)

**2. [Rule 2 - Defensive guard] Added `typeof serialized !== 'string'` throw
before writeFileSync**

- **Found during:** Task 1 (debugging the deviation #1 failure)
- **Issue:** The original failure mode wrote the literal string `"undefined"` to
  disk because the fs mock made writeFileSync a no-op AND made readFileSync
  return undefined. While diagnosing, I added a defensive guard so a future
  regression of the same shape (e.g., a non-serializable value sneaking into
  `baselineRecord`) fails loudly with a clear error message instead of writing
  garbage and confusing the next reader.
- **Fix:** Extract `const serialized = JSON.stringify(baselineRecord, null, 2)`
  then `if (typeof serialized !== 'string') throw new Error(...)` before calling
  `fs.writeFileSync(outPath, serialized + '\n')`.
- **Files modified:** `tests/unit/services/backtesting-service.test.ts`
- **Verification:** Test still passes with `CAPTURE_BASELINE=1`. The guard does
  not fire under normal capture (serialized is a string), but it would fire if a
  future change introduced a Symbol/function/undefined into `baselineRecord`.
- **Committed in:** `fbc2ad32` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking infrastructure issue, 1 defensive
guard added during diagnosis) **Impact on plan:** Both deviations were essential
for the task to actually succeed. No scope creep -- both stayed inside
`tests/unit/services/backtesting-service.test.ts`. No source files outside the
plan's `files_modified` were touched.

## Issues Encountered

- **Linter Edit Hook auto-fix on template literals:** The post-edit ESLint hook
  rewrote `serialized + '\n'` to
  `\`${serialized}\n\``automatically. The auto-fix is semantically equivalent and harmless -- the test passes either way -- but I noted it for future reference. The auto-fix is NOT what caused the original`"undefined"`
  failure (that was the global fs mock from deviation #1).
- **Pre-existing drift in `docs/PHASE-STATUS.json`:** The working tree had a
  pre-existing modification to `docs/PHASE-STATUS.json` from a prior
  `npm run baseline:check` run. I left it untouched and only staged the two
  task-owned files for the commit. It is unrelated to this plan.

## User Setup Required

None -- no external service configuration required. The fixture is committed to
git and Plan 02-06 will read it directly.

## Self-Check: PASSED

- [x] Commit `fbc2ad32` exists in git log
- [x] `.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/before-percentiles.json`
      exists on disk
- [x] `tests/unit/services/backtesting-service.test.ts` contains
      `Phase 2 baseline capture` (3 occurrences) and `CAPTURE_BASELINE` (4
      occurrences)
- [x] JSON fixture's `codePath` field reads
      `analytic-rescale (pre Plan 02-03 rewrite)`
- [x] JSON fixture's `scenarios` array has length 5 with all five historical
      scenario names
- [x] `npm run check` exits 0 (TypeScript baseline clean)
- [x] `npm test -- --project=server tests/unit/services/backtesting-service.test.ts`
      (no env var) reports 21/21 passing -- gate is a no-op
- [x] `CAPTURE_BASELINE=1 npm test -- --project=server tests/unit/services/backtesting-service.test.ts`
      reports 22/22 passing -- gated capture runs and persists
- [x] `git diff` for `tests/unit/services/backtesting-service.test.ts` shows
      additions only (107 insertions, 0 deletions)
- [x] No source files outside the plan's `files_modified` were touched

## Next Phase Readiness

- The "before" half of D-12's before/after comparison table is now locked in
  git. Plan 02-06 can read `_baselines/before-percentiles.json` directly to
  populate the comparison.
- Plan 02-03 (the rewrite that deletes `applyMarketAdjustment`) is now safe to
  run -- the analytic-rescale numbers are preserved in the fixture and cannot be
  lost when the source code path is removed.
- Plans 02-02 and 02-04 are unblocked (they do not depend on this fixture, only
  02-06 does).

---

_Phase: 02-backtesting-scenario-comparison-rewrite-p1_ _Plan:
02-01-baseline-capture_ _Completed: 2026-04-07_
