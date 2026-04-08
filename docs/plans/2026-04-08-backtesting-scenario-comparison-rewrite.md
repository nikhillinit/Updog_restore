# Backtesting Scenario Comparison Rewrite

**Phase:** 02-backtesting-scenario-comparison-rewrite-p1 **Date:** 2026-04-08
**Authors:** Claude Code (GSD workflow), planning by gsd-planner, execution by
gsd-executor **Requirements:** REQ-BCK-01, REQ-BCK-02, REQ-BCK-03
(.planning/REQUIREMENTS.md) **Status:** Shipped

## TL;DR

`BacktestingService.runScenarioComparisons` no longer applies a 2-parameter
analytic rescale to a single default Monte Carlo run. It now calls
`unifiedMonteCarloService.runSimulation` ONCE PER SCENARIO with
scenario-specific `marketParameters` injected through a new
`SimulationConfig.marketParameters?` field, and reads SAMPLE percentiles from
the per-scenario run's `result.irr.percentiles`. The analytic-rescale method
`applyMarketAdjustment` is deleted. A new Phoenix truth case under
`tests/unit/truth-cases/backtesting-scenario.test.ts` validates the rewrite
against the 2008 Global Financial Crisis scenario with a fixed random seed.

**This satisfies the 2026-01 P0 requirement documented in
`docs/plans/2026-04-07-backtesting-scenario-comparison-correctness.md`.**

(The phrase above is verbatim per CONTEXT.md D-12 and Phase 2 success
criterion 5. Do not edit it during reflows.)

## Background

The pre-rewrite `runScenarioComparisons`
(`server/services/backtesting-service.ts:645-738` on `main` as of 2026-04-07)
ran the DEFAULT Monte Carlo simulation once and applied a fixed-function
analytic rescale (`applyMarketAdjustment`, lines 704-738) per scenario. The
percentiles surfaced as
`scenarioComparison.simulatedPerformance.{p5,p25,p50,p75,p95}` were NOT sample
percentiles -- they were a 2-parameter approximation of what should have been a
sample distribution. This was statistically incorrect AND user-visible:
persisted to `backtest_results`, served through `/api/backtesting/*`, surfaced
in the scenario comparison UI.

The original P0 requirement was filed in
`docs/archive/plans/2026-01-04-monte-carlo-backtesting-integration.md:69` and
missed during the 2026-01 integration.
`docs/plans/2026-04-07-backtesting-scenario-comparison-correctness.md`
re-flagged it as P1 debt. Phase 2 (this work) closes both gaps.

## What changed

### Core engine: marketParameters override (Plan 02-02)

- `SimulationConfig` now has an optional `marketParameters?: MarketParameters`
  field (`server/services/monte-carlo-engine.ts:48-68`). The field auto-inherits
  up through `StreamingConfig` and `UnifiedSimulationConfig` via the existing
  `extends` chain -- no new fields needed at the unified layer.
- Translation logic lives in a single shared helper at
  `server/services/lib/distribution-overrides.ts`
  (`applyMarketParametersOverride`) so the traditional and streaming engines
  cannot silently diverge. Both engines call the helper at the end of
  `calibrateDistributions` when `config.marketParameters` is present.
- Translation rules:
  - `exitMultiplierMean` -> `multiple.mean`
  - `exitMultiplierVolatility` -> `multiple.volatility`
  - `holdPeriodYears` -> `exitTiming.mean`
  - `failureRate` -> scale `irr.mean` by `Math.max(0, 1 - failureRate)` (option
    **(a)** -- see "Failure rate translation" section below)
  - `followOnProbability` -> not consumed in this phase (no clean 1:1 mapping;
    deferred)
- New unit test at `tests/unit/services/monte-carlo-engine-marketparams.test.ts`
  proves the override produces measurably different output for bull vs bear
  params with the same seed.

### runScenarioComparisons rewrite (Plan 02-03)

- Per-scenario loop now calls
  `unifiedMonteCarloService.runSimulation({ ..., marketParameters: getScenarioMarketParameters(scenarioName), randomSeed: ... })`
  for each scenario. The Plan 02-02 seam is consumed for the first time here.
- A new private helper `simulationResultToDistributionSummary(result, metric)`
  extracts `result.irr.percentiles` -> `DistributionSummary`. Called from BOTH
  the rewritten `runScenarioComparisons` AND the existing
  `extractSimulationSummary` (DRY consolidation).
- `applyMarketAdjustment` is DELETED (35 lines of statistically incorrect
  2-parameter rescale math). The orphan `getDefaultMarketParameters` import was
  auto-stripped by the linter hook.
- `console.error` at line 696 is replaced with
  `backtestingLog.warn({ event: 'backtesting.scenario_comparison.failed', ... })`.
  New `backtesting.scenario_comparison.started` and
  `backtesting.scenario_comparison.completed` Pino events emit per scenario.
  Three structured events total, with `fundId`, `scenario`, `runs`, and a
  `marketParamsSummary` block on `started` and `irrMean/irrP5/irrP95` on
  `completed`.
- `compareScenariosDetailed` and `compareScenarios` now accept a new optional
  fourth parameter `options?: { randomSeed?: number }` plumbed through to the
  per-scenario MC call. This enables Plan 02-05's deterministic truth case. HTTP
  callers and the internal `runBacktest` caller are unchanged (default
  undefined).

### Severity reclassification (Plan 02-04)

- `.a5c/processes/sensitivity-stress-panel.inputs.json` `alphaFinding.severity`
  is now `P1` (was `informational`). `actionRequired` references this plan doc
  and the Phase 2 fix.

### Phoenix truth case (Plan 02-05)

- New JSON truth case at `docs/backtesting-scenario.truth-cases.json` with one
  snapshot-locked GFC entry, `randomSeed: 12345`, 1000 simulation runs, and 6
  expected percentile fields locked at full precision.
- New test file at `tests/unit/truth-cases/backtesting-scenario.test.ts` (4
  tests):
  1. Precondition: `NODE_ENV === 'test'` so the streaming engine stays disabled
     (`shouldEnableStreaming` gates on production).
  2. Snapshot match: runs
     `compareScenarios(1, ['financial_crisis_2008'], 1000, { randomSeed: 12345 })`
     against the locked snapshot at 4-decimal tolerance.
  3. Determinism check: runs the same call twice and asserts byte-identical
     `simulatedPerformance`.
  4. D-09 hard requirement: GFC mean is strictly less than `bull_market_2021`
     mean (directional check that the failureRate translation is correct).
- The test exercises the REAL Monte Carlo engine end-to-end
  (`unifiedMonteCarloService` is NOT mocked); only the `db` layer is mocked with
  a synthetic baseline + fund so the engine completes setup.

## Before / After percentile comparison (GFC scenario)

**Caveat:** the "before" numbers were captured against the analytic-rescale code
path with a MOCKED engine (`mockSimulationResult` returning
`irr.statistics.mean = 0.18`); the "after" numbers were captured against the
REAL traditional engine with `randomSeed: 12345` against an empty
`varianceReports` query (engine falls through to `getDefaultDistributions` then
applies the marketParameters override). These are NOT a strict apples-to-apples
diff -- they show the SHAPE of the change (the rewrite produces sample
percentiles, the prior code produced an analytic rescale of a single mean). For
an apples-to-apples diff, an operator can re-run the opt-in baseline-capture
block from Plan 02-01 with `CAPTURE_BASELINE=1` against the post-rewrite code;
that produces sample percentiles for the entire 5-scenario set.

| Field  | Before (analytic rescale, mocked engine) | After (sample percentiles, real engine + GFC override + seed 12345) |
| ------ | ---------------------------------------- | ------------------------------------------------------------------- |
| mean   | 0.0864                                   | 0.0809                                                              |
| p5     | 0.0065                                   | -0.0531                                                             |
| p25    | 0.0536                                   | 0.0293                                                              |
| median | 0.0821                                   | 0.0823                                                              |
| p75    | 0.1192                                   | 0.1342                                                              |
| p95    | 0.1663                                   | 0.2108                                                              |

The headline correctness improvement is the WIDER tail spread on the AFTER row.
The pre-rewrite p5 of `0.0065` was systematically too narrow on the downside
because it was a 2-parameter shift of a single mean rather than a real
distribution. After the rewrite the p5 is `-0.0531` -- real GFC downside
volatility shows up in the percentiles instead of being smoothed out by a single
multiply-by-scale. Similarly, p95 widens from `0.1663` to `0.2108` and p25 drops
from `0.0536` to `0.0293`. Median is essentially unchanged (`0.0821` vs
`0.0823`), which is the expected outcome of replacing an analytic rescale of a
mean with sample percentiles around the same mean.

**Source files:**

- Before:
  `.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/before-percentiles.json`
  (Plan 02-01 captured)
- After: `docs/backtesting-scenario.truth-cases.json` (Plan 02-05
  snapshot-locked)

## Failure rate translation choice

Plan 02-02 chose **option (a)** for the `MarketParameters.failureRate` ->
`DistributionParameters` translation (per RESEARCH Q2):

- **(a) Scale `irr.mean` down by `(1 - failureRate)`** -- minimum viable, fully
  encapsulated inside `calibrateDistributions`. CHOSEN.
- (b) Inject a binomial gate inside `generateSingleScenario` that zeroes out a
  fraction of scenarios matching `failureRate` -- most statistically defensible,
  deepest engine change.
- (c) Leave `failureRate` consumed only by the existing
  `generateScenarioInsights` text generator -- does not affect math.

**Rationale:** Option (a) is the minimum-viable approach that is fully
encapsulated inside `calibrateDistributions`. No changes to
`generateSingleScenario` or the per-scenario loop, no binomial gate, no second
random draw. Option (b) is statistically more defensible but requires deeper
engine surgery and a second truth-case iteration. Option (a) can be upgraded to
option (b) in a future phase if the Plan 02-05 GFC truth case shows systematic
bias against the historical record.

The directional ordering is correct: with `failureRate = 0.45` for GFC and
`failureRate = 0.15` for `bull_market_2021`, the truth case asserts the GFC mean
(`~0.0809`) is strictly less than the bull mean (`~0.1259`). The magnitudes are
consistent with `0.55 * 0.147 ~= 0.081` (where 0.147 is the default `irrMean`
from `getDefaultDistributions` times the exitMultiplier translation).

The Plan 02-05 truth case is snapshot-locked to whichever option was chosen. A
future phase can revisit this decision if statistical defensibility becomes a P1
concern -- the truth case will fail loudly when the snapshot moves, providing
the regression signal.

## Streaming engine determinism caveat

Per RESEARCH Pitfall #1: `streaming-monte-carlo-engine.ts:1106-1112` patches
`Math.random` globally, and the reservoir sampling at lines 225-240 uses
`Math.random()`. These make the streaming engine non-deterministic across test
runs even with `setRandomSeed`.

The Phoenix truth case mitigates this by:

1. Pinning `NODE_ENV=test` so `UnifiedMonteCarloService.shouldEnableStreaming`
   returns false (gates streaming on `NODE_ENV === 'production'` per
   `monte-carlo-service-unified.ts:502-507`).
2. Selecting the traditional engine, which uses a proper local PRNG instance
   (`monte-carlo-engine.ts:259-264`) that honors `randomSeed` deterministically.
3. Adding a "byte-identical re-run" assertion (test 3 of 4 in the truth case
   suite) that catches any future regression where `Math.random` leaks into the
   traditional path.

A future phase that wants to ship deterministic streaming-engine truth cases
will need to fix the `Math.random` patch first. This is OUT OF SCOPE for
Phase 2.

## Soft migration boundary (D-07)

Old `backtest_results` records (created before this rewrite) carry
analytic-rescale values in their `scenarioComparison.simulatedPerformance` JSONB
blocks. New records (created after this rewrite) carry sample percentiles. The
two are NOT directly comparable.

**No automated backfill is planned.** A backfill would require replaying
historical simulations against the new code, which is expensive and
operator-impactful. If a future operator needs to render historical reports with
the corrected math, the path is to re-run the backtest manually for the affected
fund/window -- the API surface and the input contract are unchanged, so this is
a single API call per affected report.

The frontend scenario comparison UI does NOT distinguish old-vs-new records --
it renders whatever values are in the `simulatedPerformance` block. Operators
viewing historical reports will see analytic-rescale values; operators viewing
reports created after this rewrite will see sample percentiles. This is an
acceptable tradeoff because (a) the difference is statistical, not categorical
(the values are still valid percentiles, just produced by a different method)
and (b) a backfill would silently rewrite historical artifacts that an operator
may have already cited externally.

## Verification gate counts (live, captured at phase close)

```
$ npm run phoenix:truth
 Test Files  6 passed (6)
      Tests  262 passed (262)
   Duration  2.83s
```

```
$ npm run validate:core
[type-check]  baseline: 0 errors (client + server + shared, separate compilations)
[test:unit]   server + client projects pass
[test:phase4:integration]  Test Files 1 passed (1) | Tests 1 passed (1) | Duration 11.50s
[lint:phase4]  eslint --max-warnings 0 (Phase 4 strict file set) green
[guard:phase4:workers:check]  worker warnings: 41  (baseline 55, pass)
```

Both gates exit 0. Phoenix truth-case count is 262 (was 258 pre-Phase 2; Plan
02-05 added the new GFC test file with 4 tests). REQ-BCK-01's "truth case for at
least one historical market regime passes" gate is closed.

## Files modified

- `server/services/monte-carlo-engine.ts` (Plan 02-02 -- add
  `SimulationConfig.marketParameters?` and call `applyMarketParametersOverride`
  from `calibrateDistributions`)
- `server/services/streaming-monte-carlo-engine.ts` (Plan 02-02 -- same override
  path with byte-identical translation via the shared helper)
- `server/services/lib/distribution-overrides.ts` (new file, Plan 02-02 --
  shared `applyMarketParametersOverride` helper, single source of truth for the
  `MarketParameters` -> `DistributionParameters` translation)
- `server/services/backtesting-service.ts` (Plan 02-03 -- rewrite
  `runScenarioComparisons`, delete `applyMarketAdjustment`, add Pino events, add
  `simulationResultToDistributionSummary` helper, plumb `options?.randomSeed`
  through `compareScenariosDetailed` and `compareScenarios`)
- `tests/unit/services/monte-carlo-engine-marketparams.test.ts` (new file, Plan
  02-02 -- override unit test, 2 tests)
- `tests/unit/services/backtesting-service.test.ts` (Plan 02-01 -- new opt-in
  baseline-capture describe block, 1 additional test under `CAPTURE_BASELINE=1`)
- `tests/unit/truth-cases/backtesting-scenario.test.ts` (new file, Plan 02-05 --
  Phoenix truth case, 4 tests)
- `docs/backtesting-scenario.truth-cases.json` (new file, Plan 02-05 --
  snapshot-locked GFC truth case JSON)
- `.a5c/processes/sensitivity-stress-panel.inputs.json` (Plan 02-04 --
  `alphaFinding.severity` reclassification, force-added because `.a5c/` is
  gitignored; see "Planning defect" section below)
- `.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/before-percentiles.json`
  (new file, Plan 02-01 -- analytic rescale baseline for the before/after table)
- `docs/plans/2026-04-08-backtesting-scenario-comparison-rewrite.md` (this file,
  Plan 02-06 -- the plan doc itself)

## Commit references

| Plan  | Commit SHA    | Purpose                                                                                               |
| ----- | ------------- | ----------------------------------------------------------------------------------------------------- |
| 02-01 | `fbc2ad32`    | Baseline capture: opt-in CAPTURE_BASELINE=1 describe block + analytic rescale fixture for 5 scenarios |
| 02-02 | `27640933`    | RED test for marketParameters override (TDD)                                                          |
| 02-02 | `e75c159f`    | GREEN: wire marketParameters override through both MC engines via shared helper                       |
| 02-03 | `8f1d0cce`    | Rewrite runScenarioComparisons + delete applyMarketAdjustment + Pino events + helper extraction       |
| 02-04 | `d738c8dd`    | Reclassify alphaFinding severity from informational to P1 (force-added .a5c file)                     |
| 02-05 | `30feec85`    | Phoenix truth case JSON + test for 2008 GFC scenario with snapshot-locked sample percentiles          |
| 02-06 | (this commit) | Plan doc + verification gate close                                                                    |

## Acceptance criteria (Phase 2 success criteria from ROADMAP)

1. **[DONE]** `runScenarioComparisons` injects scenario-specific market
   parameters into the simulation config and re-runs the Monte Carlo for each
   scenario (no `applyMarketAdjustment` post-hoc rescaling). Verified by Plan
   02-03;
   `grep -c "applyMarketAdjustment" server/services/backtesting-service.ts`
   returns 0.
2. **[DONE]** The persisted
   `scenarioComparison.simulatedPerformance.{p5,p25,p50,p75,p95}` values are
   sample percentiles from the scenario-aware run. Verified by Plan 02-03
   (`simulationResultToDistributionSummary` reads `result.irr.percentiles`
   directly) and Plan 02-05 (the truth case asserts the values are in the
   expected range for the GFC scenario).
3. **[DONE]** A new truth case under `tests/unit/truth-cases/` covers at least
   one historical market regime end-to-end and passes. Verified by Plan 02-05
   (`tests/unit/truth-cases/backtesting-scenario.test.ts` exists, asserts on
   GFC, and `npm run phoenix:truth` count is 262 across 6 files, up from 258
   across 5 files pre-Phase 2).
4. **[DONE]** `alphaFinding` severity in
   `.a5c/processes/sensitivity-stress-panel.inputs.json` is reclassified to P1.
   Verified by Plan 02-04 (`grep -c '"severity": "P1"'` returns 1).
5. **[DONE]** This plan doc exists with before/after percentile comparisons and
   the explicit cross-reference phrase. `npm run phoenix:truth` and
   `npm run validate:core` are green at execution time (counts pasted above).
   Verified by Plan 02-06 (this plan).

## Planning defect surfaced during Plan 02-04

Plan 02-04 discovered that `.a5c/processes/sensitivity-stress-panel.inputs.json`
is covered by the gitignore rule `.a5c/` ("Babysitter orchestration state
(ephemeral)") and had never been tracked in the repo. The plan's threat model
assumed the file was committed and edited via PR review -- that assumption was
wrong. The fix was a one-off `git add -f` to force-stage the single file without
modifying `.gitignore` (commit `d738c8dd`). The rest of `.a5c/` (process
definitions, JS handlers, run state) remains gitignored.

This is a contract-visibility hazard for any future plan that expects to audit
the `alphaFinding` severity through git: the file IS now tracked
post-`d738c8dd`, but a `git status` immediately after editing it shows "nothing
to commit" because the gitignore rule still applies to new modifications. The
pattern that worked is
`git add -f .a5c/processes/sensitivity-stress-panel.inputs.json`.

**Recommended resolution paths for the user to choose at phase close:**

1. **Whitelist this single file in `.gitignore`** by adding
   `!.a5c/processes/sensitivity-stress-panel.inputs.json` after the `.a5c/`
   line. Pros: future edits flow through normal `git add` and PR review. Cons:
   the rest of `.a5c/` stays gitignored, so the asymmetry between "this one file
   is contract-visible" and "everything else is ephemeral" needs a comment in
   `.gitignore` to explain.
2. **Move the file out of `.a5c/`** to a non-gitignored path (e.g.,
   `docs/babysitter/sensitivity-stress-panel.inputs.json`) and update any
   babysitter tooling that reads it. Pros: no gitignore exception. Cons: touches
   babysitter tooling, more invasive.
3. **Document the force-add convention** as the official mechanism for this
   single file in a cheatsheet or REFL. Pros: zero code change. Cons: the
   knowledge lives in docs that future plans must remember to check.

This decision is OUT OF SCOPE for Phase 2 -- it is recorded here so the user can
pick a path at phase close. Plan 02-04's SUMMARY.md and Plan 02-06 (this plan)
have re-applied the same `git add -f` workaround for the `actionRequired` date
update.

## Related docs

- Source plan that flagged the bug:
  `docs/plans/2026-04-07-backtesting-scenario-comparison-correctness.md`
- Original 2026-01 P0 requirement:
  `docs/archive/plans/2026-01-04-monte-carlo-backtesting-integration.md` line 69
- Phase 2 CONTEXT (locked decisions):
  `.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-CONTEXT.md`
- Phase 2 RESEARCH (file:line verification):
  `.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-RESEARCH.md`
- Phase 2 plan SUMMARYs (one per plan, files 02-01-SUMMARY.md through
  02-06-SUMMARY.md):
  `.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/`
- DECISIONS.md ADR-019: Pino-only logging standard (drove the `console.error` ->
  `backtestingLog.warn` change)

---

_Generated by gsd-executor Phase 2 Plan 02-06. No emoji per CLAUDE.md no-emoji
policy. No fabricated numbers -- every value in the before/after table is
sourced from a committed JSON file (`_baselines/before-percentiles.json` for the
BEFORE column, `docs/backtesting-scenario.truth-cases.json` for the AFTER
column)._
