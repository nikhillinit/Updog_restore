---
phase: 02-backtesting-scenario-comparison-rewrite-p1
plan: 06
type: execute
wave: 4
depends_on:
  - 01
  - 02
  - 03
  - 04
  - 05
files_modified:
  - docs/plans/2026-04-XX-backtesting-scenario-comparison-rewrite.md
autonomous: true
requirements:
  - REQ-BCK-03
must_haves:
  truths:
    - 'A new plan doc exists at
      docs/plans/{actual-date}-backtesting-scenario-comparison-rewrite.md (XX
      replaced with the actual ISO date the plan lands)'
    - 'The plan doc contains a before/after percentile comparison table
      populated from
      .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/before-percentiles.json
      (Plan 02-01) and docs/backtesting-scenario.truth-cases.json (Plan 02-05)'
    - 'The plan doc contains the explicit phrase "satisfies the 2026-01 P0
      requirement documented in
      docs/plans/2026-04-07-backtesting-scenario-comparison-correctness.md"
      verbatim'
    - 'The plan doc documents the failureRate translation choice from Plan 02-02
      (a/b/c with rationale)'
    - 'The plan doc documents the soft migration boundary (D-07): old
      backtest_results records remain analytic-rescale, no auto-backfill'
    - 'The plan doc documents the streaming engine determinism caveat (RESEARCH
      Pitfall #1): the truth case pins forceEngine: traditional'
    - 'The plan doc records the live counts of npm run phoenix:truth and npm run
      validate:core post-rewrite'
    - 'npm run validate:core exits 0 at execution time'
    - 'npm run phoenix:truth exits 0 at execution time with at least 259 truth
      cases'
    - 'No emoji anywhere in the plan doc (CLAUDE.md no-emoji policy)'
  artifacts:
    - path: 'docs/plans/2026-04-XX-backtesting-scenario-comparison-rewrite.md'
      provides:
        'Final plan doc for Phase 2 with before/after table, soft migration
        boundary note, satisfies-2026-01-P0 phrase, and live verification counts'
      contains: 'satisfies the 2026-01 P0 requirement'
  key_links:
    - from: 'docs/plans/2026-04-XX-backtesting-scenario-comparison-rewrite.md'
      to: 'docs/plans/2026-04-07-backtesting-scenario-comparison-correctness.md'
      via: 'explicit "satisfies the 2026-01 P0 requirement" cross-reference'
      pattern: 'satisfies the 2026-01 P0 requirement'
    - from: 'docs/plans/2026-04-XX-backtesting-scenario-comparison-rewrite.md'
      to:
        '_baselines/before-percentiles.json +
        docs/backtesting-scenario.truth-cases.json'
      via: 'before/after percentile comparison table populated from both files'
      pattern: 'Before / After'
---

<objective>
Create the final Phase 2 plan doc that satisfies REQ-BCK-03, ROADMAP success criterion 5, and CONTEXT.md D-12. The doc has three jobs:

1. Record the before/after percentile comparison for the GFC scenario (sourced
   from `_baselines/before-percentiles.json` (Plan 02-01) and
   `docs/backtesting-scenario.truth-cases.json` (Plan 02-05))
2. Cross-reference the 2026-01 P0 requirement with the exact phrase D-12 demands
3. Capture the live verification gate counts (`npm run phoenix:truth`,
   `npm run validate:core`) at the moment Phase 2 closes

Implements REQ-BCK-03 and provides the operator-readable summary of what
changed, why it changed, and how to verify it. This is the final plan in Phase 2
— its execution closes the phase.

Purpose: provide the durable docs/plans/ entry that future operators (or
auditors) can read to understand the rewrite WITHOUT needing to read the
.planning/ phase artifacts. The plan doc is the institutional memory for the
rewrite outcome; the .planning/phases/02-\* directory is the workflow
scaffolding that produced it.

Output: one new Markdown file at
`docs/plans/{YYYY-MM-DD}-backtesting-scenario-comparison-rewrite.md` where
`{YYYY-MM-DD}` is the actual ISO date of the day this plan executes (the planner
picks per CONTEXT.md "Claude's Discretion" Plan doc filename date).

## Pre-action checks

Before writing the doc, verify ALL prior plans have landed:

```bash
ls .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-0*-SUMMARY.md
```

Expected: 5 SUMMARY files (02-01 through 02-05). If any are missing, this plan
cannot proceed — re-coordinate.

```bash
ls .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/before-percentiles.json
ls docs/backtesting-scenario.truth-cases.json
```

Expected: both files exist. If either is missing, the corresponding upstream
plan failed and this plan cannot populate its tables.

```bash
grep -c '"severity": "P1"' .a5c/processes/sensitivity-stress-panel.inputs.json
```

Expected: at least 1 (Plan 02-04 landed).

```bash
grep -c "applyMarketAdjustment" server/services/backtesting-service.ts
```

Expected: 0 (Plan 02-03 deleted it). </objective>

<execution_context>
@C:/Users/nikhi/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/nikhi/.claude/get-shit-done/templates/summary.md </execution_context>

<context>
@.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-CONTEXT.md
@.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-RESEARCH.md
@.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-01-baseline-capture-PLAN.md
@.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-02-engine-market-params-override-PLAN.md
@.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-03-runscenariocomparisons-rewrite-PLAN.md
@.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-04-severity-reclassification-PLAN.md
@.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-05-phoenix-truth-case-PLAN.md
@CLAUDE.md

<interfaces>
<!-- The two data sources the plan doc reads to populate the before/after table. -->

From
.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/\_baselines/before-percentiles.json
(Plan 02-01 output, abridged):

```json
{
  "capturedAt": "2026-04-07T...",
  "codePath": "analytic-rescale (pre Plan 02-03 rewrite)",
  "scenarios": [
    {
      "scenario": "financial_crisis_2008",
      "simulatedPerformance": {
        "mean": <some-number>,
        "p5": <some-number>,
        "p25": <some-number>,
        "p50": <some-number>,
        "p75": <some-number>,
        "p95": <some-number>
      }
    },
    ...
  ]
}
```

From docs/backtesting-scenario.truth-cases.json (Plan 02-05 output, abridged):

```json
[
  {
    "id": "backtesting-scenario-01-financial-crisis-2008",
    "scenario": "financial_crisis_2008",
    "input": { "fundId": 1, "scenarios": ["financial_crisis_2008"], "simulationRuns": 1000, "options": { "randomSeed": 12345 } },
    "expected": {
      "scenario": "financial_crisis_2008",
      "simulatedPerformance": {
        "mean": <snapshot-locked-number>,
        "p5": <snapshot-locked-number>,
        "p25": <snapshot-locked-number>,
        "p50": <snapshot-locked-number>,
        "p75": <snapshot-locked-number>,
        "p95": <snapshot-locked-number>
      }
    }
  }
]
```

Important: the "before" baseline was captured against the analytic-rescale code
path with a MOCKED engine (`mockSimulationResult` from the test file's lines
105-158, with `irr.statistics.mean = 0.18`). The "after" snapshot was captured
against the REAL traditional engine with `randomSeed: 12345` against an empty
`varianceReports` query (so the engine falls through to
`getDefaultDistributions` then applies the marketParameters override).

These are NOT the same input fund. The before-numbers came from a mocked engine;
the after-numbers came from the real engine. The plan doc must NOTE this caveat
explicitly so a future reader does not interpret the table as a strict
apples-to-apples diff. The point of the table is to show the SHAPE of the change
(analytic-rescale produces certain values; sample percentiles produce other
values), not to claim exact arithmetic equivalence.

If the operator wants a strict apples-to-apples comparison, they can re-run the
opt-in baseline-capture block from Plan 02-01 with `CAPTURE_BASELINE=1` against
the post-rewrite code (which captures sample percentiles instead of analytic
rescales — Plan 02-03's note flagged this). That produces an
`_baselines/after-percentiles.json` file, but it requires the operator to opt-in
and is OUT OF SCOPE for this plan unless they want to add it. The simple
before/after table from the existing two data sources is sufficient for D-12.
</interfaces> </context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Author the Phase 2 plan doc with before/after table, satisfies-2026-01-P0 phrase, soft migration boundary, and live verification gate counts</name>
  <files>docs/plans/2026-04-XX-backtesting-scenario-comparison-rewrite.md</files>
  <read_first>
    - .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/before-percentiles.json (Plan 02-01 output — extract the GFC entry's simulatedPerformance block)
    - docs/backtesting-scenario.truth-cases.json (Plan 02-05 output — extract the GFC expected.simulatedPerformance block)
    - .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-01-SUMMARY.md (the baseline capture summary)
    - .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-02-SUMMARY.md (the failureRate translation choice — a/b/c with rationale)
    - .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-03-SUMMARY.md (the rewrite summary)
    - .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-04-SUMMARY.md (the severity reclassification summary)
    - .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-05-SUMMARY.md (the truth case summary with snapshot values pasted)
    - docs/plans/2026-04-07-backtesting-scenario-comparison-correctness.md (the source plan that flagged this as P1 — read so the cross-reference phrase is exact)
    - .planning/REQUIREMENTS.md (REQ-BCK-01, REQ-BCK-02, REQ-BCK-03)
    - .planning/ROADMAP.md (Phase 2 success criteria)
    - .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-CONTEXT.md (D-12 — the exact requirements for the plan doc content)
    - cheatsheets/emoji-free-documentation.md (no emoji policy)
  </read_first>
  <action>
This task is one Markdown file write + one verification command at the end. Steps:

### Step 1 — Resolve the filename date

Use today's actual ISO date (YYYY-MM-DD) for the filename. Run:

```bash
date -I
```

(Or on Windows PowerShell: `Get-Date -Format "yyyy-MM-dd"`.)

The filename is
`docs/plans/{YYYY-MM-DD}-backtesting-scenario-comparison-rewrite.md` — replace
`{YYYY-MM-DD}` with the actual date. This is "Claude's Discretion" per
CONTEXT.md (the planner picks the date when the plan lands).

If Plan 02-04's `actionRequired` field referenced a placeholder date
(`2026-04-XX`), update it to the actual date IN THE SAME COMMIT as this plan doc
creation. Use the Edit tool on
`.a5c/processes/sensitivity-stress-panel.inputs.json` to update the date
reference in the actionRequired string. Two files in one commit is fine for this
kind of cross-reference fix-up.

### Step 2 — Read both data sources

Read the actual numbers from:

```bash
cat .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/before-percentiles.json
cat docs/backtesting-scenario.truth-cases.json
```

Extract the GFC `simulatedPerformance` blocks from both. These populate the
before/after table.

Also read all five SUMMARY files (02-01 through 02-05) and gather:

- The failureRate translation option choice from 02-02 (a/b/c)
- The exact phoenix:truth count post-rewrite from 02-05
- The chosen filename date from this plan
- Any deviations or notes from any plan SUMMARY

### Step 3 — Run the live verification gates and capture the counts

Before writing the doc, run:

```bash
npm run phoenix:truth 2>&1 | tail -10
npm run validate:core 2>&1 | tail -20
```

Capture the output of both. The plan doc will paste these counts so a future
reader knows the verification gate state at the moment Phase 2 closed.

If either command exits non-zero, STOP — the phase cannot close with a red gate.
Investigate and re-coordinate before proceeding.

### Step 4 — Write the plan doc

Create the file at
`docs/plans/{YYYY-MM-DD}-backtesting-scenario-comparison-rewrite.md` (use the
actual date). Use this template — fill in the bracketed placeholders with the
extracted data. Do NOT use any emoji (CLAUDE.md no-emoji policy).

```markdown
# Backtesting Scenario Comparison Rewrite

**Phase:** 02-backtesting-scenario-comparison-rewrite-p1 **Date:**
{actual-iso-date} **Authors:** Claude Code (GSD workflow), planning by
gsd-planner, execution by gsd-executor **Requirements:** REQ-BCK-01, REQ-BCK-02,
REQ-BCK-03 (.planning/REQUIREMENTS.md) **Status:** Shipped

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
(server/services/backtesting-service.ts:645-738 on `main` as of 2026-04-07) ran
the DEFAULT Monte Carlo simulation once and applied a fixed-function analytic
rescale (`applyMarketAdjustment`, lines 704-738) per scenario. The percentiles
surfaced as `scenarioComparison.simulatedPerformance.{p5,p25,p50,p75,p95}` were
NOT sample percentiles — they were a 2-parameter approximation of what should
have been a sample distribution. This was statistically incorrect AND
user-visible: persisted to `backtest_results`, served through
`/api/backtesting/*`, surfaced in the scenario comparison UI.

The original P0 requirement was filed in
`docs/archive/plans/2026-01-04-monte-carlo-backtesting-integration.md:69` and
missed during the 2026-01 integration.
`docs/plans/2026-04-07-backtesting-scenario-comparison-correctness.md`
re-flagged it as P1 debt. Phase 2 (this work) closes both gaps.

## What changed

### Core engine: marketParameters override (Plan 02-02)

- `SimulationConfig` now has an optional `marketParameters?: MarketParameters`
  field (server/services/monte-carlo-engine.ts:47-55 area). The field
  auto-inherits up through `StreamingConfig` and `UnifiedSimulationConfig` via
  the existing `extends` chain — no new fields needed at the unified layer.
- `MonteCarloEngine.calibrateDistributions` honors `config.marketParameters`
  when present via a new private helper `applyMarketParametersOverride` that
  maps `MarketParameters` -> `DistributionParameters`. The translation rules:
  - `exitMultiplierMean` -> `multiple.mean`
  - `exitMultiplierVolatility` -> `multiple.volatility`
  - `holdPeriodYears` -> `exitTiming.mean`
  - `failureRate` -> scale `irr.mean` by `(1 - failureRate)` (option **{a/b/c}**
    per RESEARCH Q2 — see "Failure rate translation" section below for the
    rationale)
  - `followOnProbability` -> not consumed in this phase (no clean 1:1 mapping;
    deferred)
- `StreamingMonteCarloEngine.calibrateDistributions` honors the same override
  with byte-identical translation rules so engine selection cannot silently
  change scenario semantics.
- New unit test at `tests/unit/services/monte-carlo-engine-marketparams.test.ts`
  proves the override produces measurably different output for bull vs bear
  params with the same seed.

### runScenarioComparisons rewrite (Plan 02-03)

- Per-scenario loop now calls
  `unifiedMonteCarloService.runSimulation({ ..., marketParameters: getScenarioMarketParameters(scenarioName), randomSeed: ... })`
  for each scenario.
- A new private helper `simulationResultToDistributionSummary(result, metric)`
  extracts `result.irr.percentiles` -> `DistributionSummary`. Called from BOTH
  the rewritten `runScenarioComparisons` AND the existing
  `extractSimulationSummary` (DRY consolidation).
- `applyMarketAdjustment` is DELETED. The orphan `getDefaultMarketParameters`
  import in backtesting-service.ts was auto-stripped by the linter hook.
- `console.error` at line 696 is replaced with
  `backtestingLog.warn({ event: 'backtesting.scenario_comparison.failed', ... })`.
  New `backtesting.scenario_comparison.started` and
  `backtesting.scenario_comparison.completed` Pino events emit per scenario.
- `compareScenariosDetailed` and `compareScenarios` accept a new optional third
  parameter `options?: { randomSeed?: number }` plumbed through to the
  per-scenario MC call. This enables Plan 02-05's deterministic truth case.

### Severity reclassification (Plan 02-04)

- `.a5c/processes/sensitivity-stress-panel.inputs.json` `alphaFinding.severity`
  is now `P1` (was `informational`). `actionRequired` references this plan doc.

### Phoenix truth case (Plan 02-05)

- New JSON truth case at `docs/backtesting-scenario.truth-cases.json` with one
  snapshot-locked GFC entry.
- New test file at `tests/unit/truth-cases/backtesting-scenario.test.ts` that
  loads the JSON and asserts via `toBeCloseTo` with 4-decimal tolerance.
- The test exercises the REAL Monte Carlo engine end-to-end
  (`unifiedMonteCarloService` is NOT mocked).
- Determinism is locked via `randomSeed: 12345`. The streaming engine
  determinism caveat is mitigated by relying on `NODE_ENV=test` to select the
  traditional engine — see "Streaming engine determinism" section below.

## Before / After percentile comparison (GFC scenario)

**Caveat:** the "before" numbers were captured against the analytic-rescale code
path with a MOCKED engine (`mockSimulationResult` returning
`irr.statistics.mean = 0.18`); the "after" numbers were captured against the
REAL traditional engine with `randomSeed: 12345` against an empty
`varianceReports` query (engine falls through to `getDefaultDistributions` then
applies the marketParameters override). These are NOT a strict apples-to-apples
diff — they show the SHAPE of the change (the rewrite produces sample
percentiles, the prior code produced an analytic rescale of a single mean). For
an apples-to-apples diff, an operator can re-run the opt-in baseline-capture
block from Plan 02-01 with `CAPTURE_BASELINE=1` against the post-rewrite code;
that produces sample percentiles for the entire 5-scenario set.

| Field | Before (analytic rescale, mocked engine)                   | After (sample percentiles, real engine + GFC override + seed 12345)  |
| ----- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| mean  | {paste from \_baselines/before-percentiles.json GFC entry} | {paste from docs/backtesting-scenario.truth-cases.json GFC expected} |
| p5    | {paste}                                                    | {paste}                                                              |
| p25   | {paste}                                                    | {paste}                                                              |
| p50   | {paste}                                                    | {paste}                                                              |
| p75   | {paste}                                                    | {paste}                                                              |
| p95   | {paste}                                                    | {paste}                                                              |

**Source files:**

- Before:
  `.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/before-percentiles.json`
  (Plan 02-01 captured)
- After: `docs/backtesting-scenario.truth-cases.json` (Plan 02-05
  snapshot-locked)

## Failure rate translation choice

Plan 02-02 chose option **{a/b/c}** for the `MarketParameters.failureRate` ->
`DistributionParameters` translation (per RESEARCH Q2):

- (a) Scale `irr.mean` down by `(1 - failureRate)` — minimum viable, fully
  encapsulated inside `calibrateDistributions`
- (b) Inject a binomial gate inside `generateSingleScenario` that zeroes out a
  fraction of scenarios matching `failureRate` — most statistically defensible,
  deepest engine change
- (c) Leave `failureRate` consumed only by the existing
  `generateScenarioInsights` text generator — does not affect math

**Rationale (paste from 02-02-SUMMARY.md):** {one-line rationale}

The truth case in 02-05 is snapshot-locked to whichever option was chosen. A
future phase can revisit this decision if statistical defensibility becomes a P1
concern — the truth case will fail loudly when the snapshot moves, providing the
regression signal.

## Streaming engine determinism caveat

Per RESEARCH Pitfall #1: `streaming-monte-carlo-engine.ts:1106-1112` patches
`Math.random` globally, and the reservoir sampling at lines 225-240 uses
`Math.random()`. These make the streaming engine non-deterministic across test
runs even with `setRandomSeed`.

The Phoenix truth case mitigates this by:

1. Pinning `NODE_ENV=test` so `UnifiedMonteCarloService.streamingEnabled` is
   false (gates streaming on `NODE_ENV === 'production'` per
   `monte-carlo-service-unified.ts:502-507`).
2. The traditional engine uses a proper local PRNG instance
   (`monte-carlo-engine.ts:259-264`) which honors `randomSeed`
   deterministically.
3. The truth case includes a "byte-identical re-run" assertion that catches any
   future regression where Math.random leaks into the traditional path.

A future phase that wants to ship deterministic streaming-engine truth cases
will need to fix the Math.random patch first. This is OUT OF SCOPE for Phase 2.

## Soft migration boundary (D-07)

Old `backtest_results` records (created before this rewrite) carry
analytic-rescale values in their `scenarioComparison.simulatedPerformance` JSONB
blocks. New records (created after this rewrite) carry sample percentiles. The
two are NOT directly comparable.

**No automated backfill is planned.** A backfill would require replaying
historical simulations against the new code, which is expensive and
operator-impactful. If a future operator needs to render historical reports with
the corrected math, the path is to re-run the backtest manually for the affected
fund/window — the API surface and the input contract are unchanged, so this is a
single API call per affected report.

The frontend scenario comparison UI does NOT distinguish old-vs-new records — it
renders whatever values are in the `simulatedPerformance` block. Operators
viewing historical reports will see analytic-rescale values; operators viewing
reports created after this rewrite will see sample percentiles. This is an
acceptable tradeoff because (a) the difference is statistical, not categorical
(the values are still valid percentiles, just produced by a different method)
and (b) a backfill would silently rewrite historical artifacts that an operator
may have already cited externally.

## Verification gate counts (live, captured at phase close)
```

$ npm run phoenix:truth 2>&1 | tail -10 {paste actual output}

```

```

$ npm run validate:core 2>&1 | tail -20 {paste actual output}

```

Both gates exit 0. Phoenix truth-case count is at least 259 (was 258 pre-Phase 2). REQ-BCK-01's "truth case for at least one historical market regime passes" gate is closed.

## Files modified

- `server/services/monte-carlo-engine.ts` (Plan 02-02 — add `SimulationConfig.marketParameters?` and `applyMarketParametersOverride`)
- `server/services/streaming-monte-carlo-engine.ts` (Plan 02-02 — same override path with byte-identical translation)
- `server/services/monte-carlo-service-unified.ts` (Plan 02-02 — type chain inheritance, no behavioral change)
- `server/services/backtesting-service.ts` (Plan 02-03 — rewrite runScenarioComparisons, delete applyMarketAdjustment, add Pino events)
- `tests/unit/services/monte-carlo-engine-marketparams.test.ts` (new file, Plan 02-02 — override unit test)
- `tests/unit/services/backtesting-service.test.ts` (Plan 02-01 — new opt-in baseline-capture describe block)
- `tests/unit/truth-cases/backtesting-scenario.test.ts` (new file, Plan 02-05 — Phoenix truth case)
- `docs/backtesting-scenario.truth-cases.json` (new file, Plan 02-05 — snapshot-locked GFC truth case)
- `.a5c/processes/sensitivity-stress-panel.inputs.json` (Plan 02-04 — alphaFinding.severity reclassification)
- `.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/before-percentiles.json` (new file, Plan 02-01 — analytic rescale baseline)
- This file (Plan 02-06 — the plan doc itself)

## Commit references

| Plan | Commit SHA | Purpose |
| ---- | ---------- | ------- |
| 02-01 | {paste git log SHA} | Baseline capture (analytic-rescale numbers locked) |
| 02-02 | {paste git log SHA} | Engine marketParameters override |
| 02-03 | {paste git log SHA} | runScenarioComparisons rewrite + applyMarketAdjustment deletion |
| 02-04 | {paste git log SHA} | alphaFinding severity reclassification |
| 02-05 | {paste git log SHA} | Phoenix truth case for GFC scenario |
| 02-06 | (this commit) | Plan doc + verification gate close |

## Acceptance criteria (Phase 2 success criteria from ROADMAP)

1. [DONE] `runScenarioComparisons` injects scenario-specific market parameters into the simulation config and re-runs the Monte Carlo for each scenario (no `applyMarketAdjustment` post-hoc rescaling). Verified by Plan 02-03 `grep -c "applyMarketAdjustment" server/services/backtesting-service.ts` returning 0.
2. [DONE] The persisted `scenarioComparison.simulatedPerformance.{p5,p25,p50,p75,p95}` values are sample percentiles from the scenario-aware run. Verified by Plan 02-03 (`simulationResultToDistributionSummary` reads `result.irr.percentiles` directly) and Plan 02-05 (the truth case asserts the values are in the expected range for the GFC scenario).
3. [DONE] A new truth case under `tests/unit/truth-cases/` covers at least one historical market regime end-to-end and passes. Verified by Plan 02-05 (`tests/unit/truth-cases/backtesting-scenario.test.ts` exists, asserts on GFC, and `npm run phoenix:truth` count is at least 259).
4. [DONE] `alphaFinding` severity in `.a5c/processes/sensitivity-stress-panel.inputs.json` is reclassified to P1. Verified by Plan 02-04.
5. [DONE] This plan doc exists with before/after percentile comparisons and the explicit cross-reference phrase. `npm run phoenix:truth` and `npm run validate:core` are green at execution time (counts pasted above). Verified by Plan 02-06 (this plan).

## Related docs

- Source plan that flagged the bug: `docs/plans/2026-04-07-backtesting-scenario-comparison-correctness.md`
- Original 2026-01 P0 requirement: `docs/archive/plans/2026-01-04-monte-carlo-backtesting-integration.md` line 69
- Phase 2 CONTEXT (locked decisions): `.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-CONTEXT.md`
- Phase 2 RESEARCH (file:line verification): `.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-RESEARCH.md`
- DECISIONS § ADR-019: Pino-only logging standard (drove the `console.error` -> `backtestingLog.warn` change)

---

_Generated by gsd-planner Phase 2 Plan 02-06. No emoji per CLAUDE.md no-emoji policy. No fabricated numbers — every value in the before/after table is sourced from a committed JSON file._
```

### Step 5 — Replace ALL bracketed placeholders with real values

Go through the doc and replace EVERY `{...}` placeholder with the actual value:

- `{actual-iso-date}` -> the date you computed in Step 1
- `{a/b/c}` (failureRate translation) -> the option from 02-02-SUMMARY.md
- `{one-line rationale}` -> the rationale from 02-02-SUMMARY.md
- `{paste from ...}` cells in the before/after table -> the actual numbers from
  the two JSON files
- `{paste actual output}` for both verification gate blocks -> the actual stdout
  from Step 3
- `{paste git log SHA}` rows -> the actual SHAs from `git log --oneline -10`
  (the most recent commits)

Do NOT leave any `{...}` placeholders in the final file. Run
`grep -c '{' docs/plans/{date}-backtesting-scenario-comparison-rewrite.md` and
confirm the count is 0 (or only contains genuine non-placeholder curly braces
from JSON examples).

### Step 6 — Final verification

```bash
# No emoji in the file
node -e "const text = require('fs').readFileSync('docs/plans/{actual-date}-backtesting-scenario-comparison-rewrite.md', 'utf-8'); const emoji = text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu); if (emoji) { console.error('FAIL: emoji found:', emoji); process.exit(1); } console.log('OK: no emoji');"

# The exact cross-reference phrase
grep -c "satisfies the 2026-01 P0 requirement" docs/plans/{actual-date}-backtesting-scenario-comparison-rewrite.md

# The verification gates still exit 0 (re-run to confirm nothing has drifted between Step 3 and now)
npm run phoenix:truth && npm run validate:core
```

Expected:

- `OK: no emoji` from the node script
- `1` (or more) from the grep
- 0 exit on both gates

### Step 7 — Update Plan 02-04's actionRequired filename reference (if applicable)

If Plan 02-04 used the placeholder `2026-04-XX` in the alphaFinding
`actionRequired` string, update it now with the actual date you picked in
Step 1. Use the Edit tool on
`.a5c/processes/sensitivity-stress-panel.inputs.json`.

If Plan 02-04 used a real date already (e.g., it was committed AFTER Plan 02-06
picked a date), this step is a no-op.

### Step 8 — Commit

The commit message MUST follow the conventional-commit format and reference
Phase 2:

```
docs(02-backtesting-scenario-comparison-rewrite-p1): close phase with plan doc and verification gate counts
```

Do NOT use any emoji in the commit message. </action> <verify> <automated>node
-e "const fs = require('fs'); const path = require('path'); const dir =
'docs/plans'; const files = fs.readdirSync(dir).filter(f =>
f.endsWith('-backtesting-scenario-comparison-rewrite.md')); if (files.length
=== 0) { console.error('FAIL: plan doc not found in docs/plans/');
process.exit(1); } const file = path.join(dir, files[files.length - 1]); const
text = fs.readFileSync(file, 'utf-8'); if (!text.includes('satisfies the 2026-01
P0 requirement')) { console.error('FAIL: missing satisfies-2026-01-P0 phrase');
process.exit(1); } if (!/Before \/ After/.test(text)) { console.error('FAIL:
missing Before/After table heading'); process.exit(1); } if
(text.match(/\{[a-zA-Z0-9 \/.-]+\}/) ) { console.error('FAIL: unfilled
placeholder in plan doc'); process.exit(1); } const emoji =
text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu); if (emoji) {
console.error('FAIL: emoji found:', emoji); process.exit(1); } console.log('OK:
plan doc is well-formed at', file);" && npm run phoenix:truth && npm run
validate:core</automated> </verify> <acceptance_criteria> - File matching
`docs/plans/*-backtesting-scenario-comparison-rewrite.md` exists with a real ISO
date - The plan doc contains the exact phrase
`satisfies the 2026-01 P0 requirement` (verbatim per D-12) - The plan doc
contains a `Before / After` heading and a populated table with non-placeholder
values - The plan doc contains the failureRate translation option (a/b/c) and a
one-line rationale - The plan doc contains a "Streaming engine determinism
caveat" section - The plan doc contains a "Soft migration boundary (D-07)"
section - The plan doc contains pasted output from `npm run phoenix:truth` and
`npm run validate:core` at execution time - The plan doc contains a "Files
modified" section listing all files touched by Plans 02-01 through 02-06 - The
plan doc contains a "Commit references" table with at least 5 SHA rows (one per
prior plan) - No `{...}` placeholders remain in the final file (all replaced
with real values) - No emoji anywhere in the file (CLAUDE.md no-emoji policy —
verified by the node -e regex check) - `npm run phoenix:truth` exits 0 with at
least 259 truth cases at execution time - `npm run validate:core` exits 0 at
execution time -
`grep -c "satisfies the 2026-01 P0 requirement" docs/plans/*-backtesting-scenario-comparison-rewrite.md`
returns at least 1 - If Plan 02-04 used a placeholder date, it has been updated
to the real date in this same commit </acceptance_criteria> <done>The plan doc
exists with a real date in the filename, contains the verbatim "satisfies the
2026-01 P0 requirement" phrase, the populated before/after table, the
failureRate translation rationale, the streaming determinism caveat, the soft
migration boundary note, and live verification gate counts. Both
`npm run phoenix:truth` and `npm run validate:core` are green at execution time.
Phase 2 is closed.</done> </task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                      | Description                                                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| operator -> plan doc          | The plan doc is committed to the repo and read by operators (and auditors) as the institutional memory of the rewrite. Read-only after commit. |
| verification gate -> plan doc | The doc PASTES the live output of `npm run phoenix:truth` and `npm run validate:core`. If the gates exit non-zero, the plan refuses to close.  |

## STRIDE Threat Register

| Threat ID  | Category                   | Component                                                   | Disposition | Mitigation Plan                                                                                                                                                                                                                                             |
| ---------- | -------------------------- | ----------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-02-06-01 | Tampering                  | the plan doc's before/after table                           | mitigate    | The numbers are sourced from two committed JSON files (`_baselines/before-percentiles.json` and `docs/backtesting-scenario.truth-cases.json`). Tampering with the doc without updating the JSONs would create a visible drift caught by any future re-read. |
| T-02-06-02 | Information Disclosure     | n/a                                                         | accept      | The doc contains no PII, no secrets, no real fund data. The before/after numbers are deterministic outputs of the test fixtures.                                                                                                                            |
| T-02-06-03 | Repudiation                | who closed Phase 2                                          | accept      | The git commit history records the closer. The commit message follows the conventional-commit format with the phase prefix.                                                                                                                                 |
| T-02-06-04 | Phoenix gate false-green   | doc claims gates are green when they are not                | mitigate    | The verify automation re-runs `npm run phoenix:truth` and `npm run validate:core` AS PART OF THE TASK COMPLETION. If either fails, the task fails — the doc cannot be committed against a red gate.                                                         |
| T-02-06-05 | Placeholder leakage        | unfilled `{...}` placeholders ship to docs/plans            | mitigate    | The verify automation greps for `{...}` placeholders in the final file and refuses to complete if any are found.                                                                                                                                            |
| T-02-06-06 | Emoji leakage              | emoji ships to docs/plans                                   | mitigate    | The verify automation runs a Unicode regex check for emoji codepoints and refuses to complete if any are found. CLAUDE.md no-emoji policy enforced at the gate.                                                                                             |
| T-02-06-07 | Stale cross-reference date | actionRequired in 02-04 still references the placeholder XX | mitigate    | Step 7 of the action explicitly checks and updates the alphaFinding actionRequired field if it still contains the placeholder. The two-file commit is acceptable for this kind of cross-reference fix-up.                                                   |
| T-02-06-08 | Filename date drift        | doc filename date does not match commit date                | accept      | The planner picks the date when the plan executes, per CONTEXT.md "Claude's Discretion". Minor drift between filename date and commit date (<24h) is acceptable; the commit history is the source of truth.                                                 |

</threat_model>

<verification>
- The node -e script in the verify block confirms the doc exists, contains the satisfies-2026-01-P0 phrase verbatim, contains a Before/After table heading, contains no `{...}` placeholders, and contains no emoji
- `npm run phoenix:truth` exits 0 with at least 259 truth cases (re-run as part of the task verification, not just the manual capture in Step 3)
- `npm run validate:core` exits 0 (re-run as part of verification)
- The `Files modified` section lists all 11+ files touched by Plans 02-01 through 02-06
- The `Commit references` table has at least 5 SHA rows
- The plan SUMMARY.md (output from this plan) records the final phoenix:truth count and the doc filename
</verification>

<success_criteria>

- New plan doc exists at
  `docs/plans/{YYYY-MM-DD}-backtesting-scenario-comparison-rewrite.md` with a
  real ISO date
- The doc contains the verbatim phrase
  `satisfies the 2026-01 P0 requirement documented in docs/plans/2026-04-07-backtesting-scenario-comparison-correctness.md`
  (D-12 + ROADMAP success criterion 5)
- The doc contains a populated Before/After percentile comparison table for the
  GFC scenario sourced from the two committed JSON files
- The doc documents the failureRate translation option (a/b/c) chosen in Plan
  02-02 with rationale
- The doc documents the streaming engine determinism caveat (RESEARCH Pitfall
  #1)
- The doc documents the soft migration boundary (D-07): old records remain
  analytic-rescale, no auto-backfill
- The doc contains live captured output from `npm run phoenix:truth` and
  `npm run validate:core` at execution time
- Both `npm run phoenix:truth` (>= 259) and `npm run validate:core` exit 0 at
  task execution time
- No `{...}` placeholders remain in the final file
- No emoji in the file
- If Plan 02-04 used a placeholder date in the actionRequired field, it has been
  updated to the real date in this same commit
- REQ-BCK-03 is closed
- Phase 2 is closed

</success_criteria>

<output>
After completion, create `.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-06-SUMMARY.md` documenting:

- The full path of the new plan doc (with the resolved date)
- The final phoenix:truth count (target: >= 259)
- The final validate:core exit code (target: 0)
- The five upstream commit SHAs that the plan doc references
- Confirmation that the satisfies-2026-01-P0 phrase appears verbatim
- Confirmation that no placeholders or emoji remain in the doc
- Note that Phase 2 is now closed and STATE.md should be updated by the
  orchestrator to reflect the completion of REQ-BCK-01, REQ-BCK-02, and
  REQ-BCK-03 </output>
