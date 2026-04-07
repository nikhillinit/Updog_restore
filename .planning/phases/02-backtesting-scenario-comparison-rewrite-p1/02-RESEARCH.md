# Phase 2: Backtesting Scenario Comparison Rewrite (P1) - Research

**Researched:** 2026-04-07 **Domain:** Monte Carlo scenario injection, sample
percentiles, deterministic truth-case harness **Confidence:** HIGH

## Summary

The Phase 2 rewrite is **mostly plumbing, not engine work**. Both Monte Carlo
engines (`MonteCarloEngine` and `StreamingMonteCarloEngine`) already accept
`randomSeed` (D-10 needs no new field) and already expose both sample
percentiles (`result.irr.percentiles`) and statistics (`result.irr.statistics`)
— the exact pair the rewrite needs. The new `runScenarioComparisons` body can
reuse the existing pattern at lines 288-307 of `backtesting-service.ts`
(`extractSimulationSummary`) verbatim. The `MarketParameters` slot on
`HistoricalScenario` (line 50 of `shared/types/backtesting.ts`) is **dead
plumbing** — neither `calibrateDistributions` method consumes it today, so D-01
must extend `UnifiedSimulationConfig` AND wire the override INTO at least one
engine's distribution calibration path. **This is the only real engine change in
the phase.**

`applyMarketAdjustment` is verified zero-caller (only line 682 inside
`runScenarioComparisons` itself), `getDefaultMarketParameters` becomes orphan
once `applyMarketAdjustment` is deleted, and `console.error` at line 696 is the
ONLY `console.*` in the file. The existing integration test
(`tests/integration/backtesting-api.test.ts`) mocks
`backtestingService.compareScenariosDetailed` entirely, so its hardcoded
percentile literals are mock fixtures — they will NOT break. The existing unit
test (`tests/unit/services/backtesting-service.test.ts`) asserts on
`marketParameters.failureRate` (input pass-through) and on `keyInsights` text
matching — both survive the rewrite.

**Primary recommendation:** scope this as 6 plans across 3 waves. Wave 0 =
baseline capture (run current code, save before-numbers + add the smoke
harness). Wave 1 = parallel engine plumbing (D-01 marketParameters wiring) and
rewrite scaffolding (delete `applyMarketAdjustment`, add Pino logger, rewrite
`runScenarioComparisons` body to call MC once per scenario with sample
percentiles and seeded determinism). Wave 2 = truth case + plan doc + severity
reclass + verification.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Extend `UnifiedSimulationConfig` with optional
  `marketParameters?: MarketParameters` field that overrides fund defaults for
  one run. Pass through to engines via `SimulationConfig` / `StreamingConfig`.
  Optional with fund-default fallback.
- **D-02:** `runScenarioComparisons` calls
  `unifiedMonteCarloService.runSimulation` ONCE PER SCENARIO with
  `marketParameters: getScenarioMarketParameters(scenarioName)` injected.
  Preserve
  `runsPerScenario = Math.max(1000, Math.floor(simulationRuns / scenarios.length))`.
- **D-03:** `DistributionSummary` for each scenario is built from SAMPLE
  percentiles of the scenario-specific run's IRR distribution
  (p5/p25/p50/p75/p95). Use the existing engine output surface.
- **D-04:** **Delete** `applyMarketAdjustment` (lines 704-738) entirely. Also
  delete `getDefaultMarketParameters` import from `historical-scenarios` if no
  other callers.
- **D-05:** Preserve the existing `failedScenarios` array. Catch errors
  per-scenario and continue. Replace `console.error` at line 696 with a Pino
  structured log via the project logger. Event name:
  `backtesting.scenario_comparison.failed`.
- **D-06:** NO breaking change to `/api/backtesting/*` response shape.
  `ScenarioComparison` TypeScript type stays identical — only VALUES change.
- **D-07:** NO change to `backtest_results` JSONB column shape. Old records
  remain analytic rescales (soft migration boundary noted in plan doc).
- **D-08:** Update `.a5c/processes/sensitivity-stress-panel.inputs.json` to
  reclassify `alphaFinding` severity from `informational` to `P1`.
- **D-09:** Add ONE new Phoenix truth case under `tests/unit/truth-cases/`
  covering 2008 GFC. Asserts: for fixed input fund + fixed seed, GFC scenario
  produces `simulatedPerformance.p5 < X`, `p95 < Y`,
  `mean < default-scenario mean`. Snapshot-locked on first green run.
- **D-10:** Use a fixed random seed in the truth case for deterministic output.
  If `UnifiedSimulationConfig` does not already accept seed, planner adds
  `seed?: number` in same rewrite.
- **D-11:** Add Pino structured logs at start
  (`backtesting.scenario_comparison.started`) and completion
  (`backtesting.scenario_comparison.completed`) of each scenario inside
  `runScenarioComparisons`.
- **D-12:** Create
  `docs/plans/2026-04-XX-backtesting-scenario-comparison-rewrite.md` with
  before/after percentile comparison table and explicit "satisfies the 2026-01
  P0 requirement" note.

### Claude's Discretion

- Exact config shape (top-level vs nested under `scenario?` block) — follow
  existing conventions.
- Engine path for the override — which of `StreamingConfig` / `SimulationConfig`
  / per-engine internals consumes `marketParameters`.
- Seed plumbing — whether to add `seed?: number` to `UnifiedSimulationConfig` or
  wire through existing randomness primitive.
- Truth case assertion tolerances — snapshot-locked on first green run.
- Plan doc filename date.
- Pino event log shape — `alert.backtesting.*` (Phase 1 style) or simpler
  `backtesting.scenario_comparison.*`.

### Deferred Ideas (OUT OF SCOPE)

- Multiple historical scenario truth cases (one GFC is enough).
- Breaking API response shape (full sample histogram, CIs, ESS).
- Auto-migration of old `backtest_results` records.
- Unified scenario-aware MC for non-backtesting paths (`runCalcRunCompletion`
  etc.).

## Phase Requirements

| ID         | Description                                                           | Research Support                                                                                                                |
| ---------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| REQ-BCK-01 | Inject scenario-specific market parameters and re-run MC per scenario | Q3-Q4: dead plumbing in `MarketEnvironment` confirms this is greenfield wiring; Q1: `randomSeed` already exists for determinism |
| REQ-BCK-02 | Reclassify `alphaFinding` severity from `informational` to P1         | Located at `.a5c/processes/sensitivity-stress-panel.inputs.json:150-155` — single-key edit                                      |
| REQ-BCK-03 | Document rewrite outcome in new plan doc with before/after table      | Q11: baseline capture only viable from a unit test harness with mocked DB (Wave 0 task)                                         |

## Research Findings

### Q1: Is there ALREADY a seed field in the MC config chain?

**YES — fully wired, no new field needed.**

- `SimulationConfig.randomSeed?: number` at
  `server/services/monte-carlo-engine.ts:54`
- `StreamingConfig extends SimulationConfig` at
  `server/services/streaming-monte-carlo-engine.ts:40` — inherits `randomSeed`
- `UnifiedSimulationConfig extends StreamingConfig` at
  `server/services/monte-carlo-service-unified.ts:28` — inherits `randomSeed`
- Traditional engine consumes via `this.prng.reset(config.randomSeed)` at
  `monte-carlo-engine.ts:288-290`
- Streaming engine consumes via `this.setRandomSeed(streamingConfig.randomSeed)`
  at `streaming-monte-carlo-engine.ts:375-377`
- Healthcheck even tests with `randomSeed: 12345` at
  `monte-carlo-service-unified.ts:296-297`
- `runBacktest` already passes through `config.randomSeed` at
  `backtesting-service.ts:278`

**Implication for D-10:** the planner does NOT need to add a new field. The
truth case (and the new `runScenarioComparisons` body) just needs to PASS
`randomSeed` through to `unifiedMonteCarloService.runSimulation`. **CAVEAT:**
the streaming engine's `setRandomSeed` patches `Math.random` globally
(`streaming-monte-carlo-engine.ts:1106-1112`), so concurrent simulations across
scenarios will share state. The truth case must run scenarios sequentially and
ideally pin `forceEngine: 'traditional'` to use the proper PRNG (line 263)
instead of the global Math.random patch — see Pitfalls section.

### Q2: Where is the IRR sample distribution exposed in SimulationResults?

**Both `result.irr.percentiles` AND `result.irr.statistics` — the existing
`extractSimulationSummary` at backtesting-service.ts:288-307 already maps the
exact `DistributionSummary` shape the rewrite needs.**

The `PerformanceDistribution` interface at `monte-carlo-engine.ts:109-128`
exposes:

```typescript
percentiles: { p5, p25, p50, p75, p95 }   // sample percentiles
statistics: { mean, standardDeviation, min, max }
scenarios: number[]                         // raw samples (empty in streaming for memory)
```

The mapping is already proven at `backtesting-service.ts:298-307`:

```typescript
metrics[metric] = {
  mean: typedData.statistics.mean,
  median: typedData.percentiles.p50,
  p5: typedData.percentiles.p5,
  p25: typedData.percentiles.p25,
  p75: typedData.percentiles.p75,
  p95: typedData.percentiles.p95,
  min: typedData.statistics.min,
  max: typedData.statistics.max,
  standardDeviation: typedData.statistics.standardDeviation,
};
```

**Recommendation:** extract this 10-line block into a private helper
`simulationResultToDistributionSummary(result, metric)` and call from BOTH
`extractSimulationSummary` and the new `runScenarioComparisons` body. Eliminates
duplication and gives the truth case a single seam to assert against.

### Q3: How does MarketEnvironment.marketParameters currently flow into the MC engines?

**It does NOT. `MarketEnvironment` is dead plumbing.**

- `MarketEnvironment` interface defined at `monte-carlo-engine.ts:57-65` with
  `scenario`, `exitMultipliers`, `failureRate`, `followOnProbability`.
- The `marketParameters?` slot on `HistoricalScenario`
  (`shared/types/backtesting.ts:50`) is a SEPARATE shape (`MarketParameters`)
  that is never consumed by the engines.
- `generatePerformanceForecasts(_config, _marketEnvironments)` at
  `monte-carlo-engine.ts:520-526` is **unimplemented**
  (`throw new Error('Method not implemented yet')`).
- `runMultiEnvironmentSimulation` at `monte-carlo-service-unified.ts:184-208`
  accepts `MarketEnvironment[]` but only uses it to switch `runs` per
  environment via `adjustRunsForEnvironment` (lines 479-490). It NEVER passes
  the environment INTO the engine config.
- `calibrateDistributions` at `monte-carlo-engine.ts:636-688` and
  `streaming-monte-carlo-engine.ts:921-973` take only `(fundId, baseline)` —
  they pull volatility from `varianceReports` and fall back to
  `getDefaultDistributions()` (lines 690-698 / 975-983) if fewer than 3 reports
  exist.

**Implication for D-01:** the planner must wire `marketParameters` into
`calibrateDistributions` (or equivalent) on at least the engine the backtesting
service actually hits. This is a real engine change, not a no-op pass-through.

### Q4: Do the engines accept market parameter overrides per-run?

**No. Both engines pull distributions exclusively from `(fundId, baseline)` via
`varianceReports` — neither has a per-run override hook today.**

The override path D-01 requires must be added. The minimum viable change:

1. Extend `SimulationConfig` (or `StreamingConfig` — see D-01 discretion) with
   `marketParameters?: MarketParameters`.
2. Inside `calibrateDistributions`, when `config.marketParameters` is present,
   override the calibrated `irr.mean`, `irr.volatility`, `multiple.mean`,
   `multiple.volatility` (and possibly `exitTiming.mean`) using the market
   params.
3. Map `MarketParameters` → `DistributionParameters`:
   - `exitMultiplierMean → multiple.mean`
   - `exitMultiplierVolatility → multiple.volatility`
   - `holdPeriodYears → exitTiming.mean`
   - `failureRate` and `followOnProbability` need a translation step (not 1:1) —
     planner decides during plan authoring whether to scale `irr.mean` down by
     `failureRate` or to inject failures into the scenario generator at
     `streaming-monte-carlo-engine.ts:533-577` directly.

**Engine selection note:** `UnifiedMonteCarloService.selectEngine` defaults to
`traditional` for `runs < 5000` AND streaming is gated on
`process.env.NODE_ENV === 'production'` OR `ENABLE_STREAMING_MONTE_CARLO=1`
(`monte-carlo-service-unified.ts:502-507`). In test environments, **the
traditional engine is the one that runs**. Wiring the override into the
traditional engine first is the highest-leverage path.

### Q5: How many callers does applyMarketAdjustment have?

**One — and it is itself.** Verified live grep across all of `server/`:

```
$ grep -rn "applyMarketAdjustment" server/
server/services/backtesting-service.ts:682:    const adjustedPerformance = this.applyMarketAdjustment(result, marketParams);
server/services/backtesting-service.ts:704:  private applyMarketAdjustment(
```

Zero non-test, non-doc callers. The two hits are the call site (line 682) and
the definition (line 704). **D-04 verified.** There are also no test files
asserting on `applyMarketAdjustment` directly —
`tests/unit/services/backtesting-service.test.ts` mocks
`unifiedMonteCarloService.runSimulation` and asserts on the OUTPUT shape
(`marketParameters.failureRate`, `keyInsights`), not on the rescale math.

### Q6: How many callers does getDefaultMarketParameters have?

**One in `server/`, plus its own unit test.** Verified live grep:

```
$ grep -rn "getDefaultMarketParameters" server/
server/data/historical-scenarios.ts:217:export function getDefaultMarketParameters(): MarketParameters {
server/services/backtesting-service.ts:25:  getDefaultMarketParameters,
server/services/backtesting-service.ts:708:    const defaultParams = getDefaultMarketParameters();
```

The only `server/` consumer is line 708 INSIDE `applyMarketAdjustment`. Once
`applyMarketAdjustment` is deleted, the import at line 25 becomes orphan and
ESLint will strip it (per the linter hook MEMORY note). The unit test at
`tests/unit/data/historical-scenarios.test.ts:150-163` tests the function itself
and is unaffected — DO NOT delete `getDefaultMarketParameters` from
`historical-scenarios.ts`, only the import in `backtesting-service.ts`.

### Q7: Does tests/integration/backtesting-api.test.ts assert specific percentile values?

**Yes, but as MOCK FIXTURES — they will not break.** The integration test mocks
`backtestingService` entirely at lines 54-62:

```typescript
vi.mock('../../server/services/backtesting-service', () => ({
  backtestingService: {
    runBacktest: mockRunBacktest,
    ...
    compareScenariosDetailed: mockCompareScenariosDetailed,
    ...
  },
}));
```

The hardcoded percentile literals at lines 104-126 (`makeBacktestResult`) and
175-181 (`scenarioComparisons` fixture:
`p5: -0.12, p25: 0.02, p75: 0.19, p95: 0.28, mean: 0.11`) are MOCK return values
for the route layer to echo back. The route layer never calls the real
`runScenarioComparisons`. The assertions at lines 386-396
(`expect(mockRunBacktest).toHaveBeenCalledWith(validBacktestConfig, ...)`) and
lines 482-488
(`expect(response.body.result.scenarioComparisonSummary).toEqual({...})`) are
about route wiring, not numeric correctness.

**Implication:** the integration test file requires ZERO changes for Phase 2.
Add this to the plan doc as a positive verification.

The unit test file `tests/unit/services/backtesting-service.test.ts` also mocks
`unifiedMonteCarloService.runSimulation` at lines 40-98 and asserts on:

- `marketParameters.failureRate === 0.45` (line 517) — input pass-through,
  unaffected
- `marketParameters.exitMultiplierMean === 1.2` (line 518) — input pass-through,
  unaffected
- `keyInsights.some(i => i.includes('failure'))` (line 527) — driven by
  `marketParams.failureRate > 0.3`, not by the deleted rescale math, so it
  survives
- `result.length === 2` for `compareScenarios` (line 508) — survives if the new
  code path still runs both scenarios
- `result.length === 1` when one scenario is `'custom'` (line 533) — the
  existing skip path stays
- `result.failedScenarios === ['custom']` (line 541) — the existing skip path
  stays

**One caveat:** the existing mock at `mockSimulationResult` (lines 105-158)
returns `result.irr.percentiles.p5 = 0.05` and
`result.irr.percentiles.p95 = 0.35`. When the rewrite reads from
`result.irr.percentiles`, the unit tests will see those mocked sample
percentiles directly — currently there is NO unit test that asserts on
`simulatedPerformance.p5` or `.p95` specifically, so this is safe. The planner
should add ONE new assertion that the new sample-percentile path hits the mock's
`result.irr.percentiles.p5 === 0.05` to lock the wiring.

### Q8: What is the current Phoenix truth case count?

**258 truth-case tests passing across 5 test files (live count, 2026-04-07).**

Live verification:

```
$ npm run phoenix:truth 2>&1 | tail -10
 ✓ tests/unit/truth-cases/exit-recycling.test.ts (43 tests) 31ms
 ✓ tests/unit/truth-cases/xirr.test.ts (51 tests) 29ms
 ✓ tests/unit/truth-cases/runner.test.ts (118 tests) 70ms
 ✓ tests/unit/truth-cases/capital-allocation.test.ts (24 tests) 40ms

 Test Files  5 passed (5)
      Tests  258 passed (258)
   Start at  22:20:19
   Duration  2.39s
```

(One of the 5 files is `helpers.test.ts` — the helper unit tests — accounting
for the 22 tests not listed in the tail.)

**Phase 2 baseline:** 258 truth cases pre-rewrite. After Phase 2 the new GFC
truth case adds 1 (or more, depending on how the planner shapes it). Target
post-rewrite: **259+** with all green.

### Q9: What is the existing Pino logger import pattern in backtesting-service.ts?

**There is NO logger import in backtesting-service.ts today.** Verified:

```
$ grep -n "logger" server/services/backtesting-service.ts
(no matches)
```

The planner must:

1. Add `import { logger } from '../lib/logger';` at the top of
   `backtesting-service.ts` (mirrors `monte-carlo-service-unified.ts:18`).
2. Optionally create a child logger:
   `const log = logger.child({ module: 'backtesting' });` and use
   `log.info(...)` / `log.warn(...)` / `log.error(...)`.

The project logger is at `server/lib/logger.ts`:

```typescript
import pino from 'pino';
const pinoOptions: pino.LoggerOptions = {
  level: process.env['LOG_LEVEL'] || 'info',
  redact: ['req.headers.authorization', 'req.headers.cookie', ...],
};
if (process.env['NODE_ENV'] !== 'production' && process.env['NODE_ENV'] !== 'test') {
  pinoOptions.transport = { target: 'pino-pretty' };
}
export const logger = pino(pinoOptions);
```

It is NODE_ENV-aware — test runs use plain JSON output (no pino-pretty
transport), which means structured log assertions in the truth case can match
against `pino.info` calls if the planner wants to verify event names land. Phase
1's leader-election work used `alert.planner.leader.elected/demoted/renewed` —
D-11 leaves the choice between `alert.backtesting.*` and
`backtesting.scenario_comparison.*` to the planner.

### Q10: What is the console.error context at line 696?

**It is the ONLY `console.*` call in backtesting-service.ts.** Verified:

```
$ grep -n "console\." server/services/backtesting-service.ts
696:        console.error(`Failed to run scenario comparison for ${scenarioName}:`, error);
```

D-11 scope is exactly correct — replacing line 696 with a Pino structured log
via `logger.warn` (or `log.warn` if a child is created) leaves the file ADR-019
compliant in one edit. No other `console.*` calls to clean up.

### Q11: Can we run runScenarioComparisons against a fixed fund from a test harness for baseline capture?

**Yes — via the existing unit test harness at
`tests/unit/services/backtesting-service.test.ts`.** The harness:

1. Mocks `db` (lines 10-37) — no real DB needed.
2. Mocks `unifiedMonteCarloService.runSimulation` to return a fixed
   `mockSimulationResult` (lines 40-98) with deterministic
   `result.irr.statistics.mean = 0.18`.
3. Calls `service.compareScenarios(1, [...])` directly (line 503).

The "before" baseline numbers can be captured by:

1. Adding a NEW test in this file that calls
   `service.compareScenarios(1, ['financial_crisis_2008', 'covid_2020', 'dotcom_bust_2000', 'bull_market_2021', 'rate_hikes_2022'])`
   and `console.warn`s `result[i].simulatedPerformance` for each.
2. Running it once against `main` (current code) — capture stdout.
3. Pasting the captured table into the plan doc as the "before" column.
4. Re-running the same test after the rewrite — capture the "after" column.

**Critical:** because the unit test mocks the engine and returns a fixed
`mockSimulationResult`, the "before" numbers will be the analytic rescale of
`mean = 0.18` (the mocked value). The "after" numbers will be the SAMPLE
percentiles from the same mocked result
(`p5 = 0.05, p25 = 0.12, p50 = 0.18, p75 = 0.25, p95 = 0.35`) — pulled directly
from `mockSimulationResult.irr.percentiles`. This produces a clean
"before/after" table that demonstrates the difference WITHOUT requiring a real
DB or real fund.

**This is the canonical Wave 0 task:** add a
`describe('Phase 2 baseline capture')` block that runs current
`compareScenarios` against the 5 historical scenarios and dumps the resulting
`simulatedPerformance` blocks to a JSON file under
`.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/`.
Commit the baseline JSON. Reference it from D-12's plan doc.

### Q12: Phoenix truth case harness shape

**Pattern:** JSON truth-case files at `docs/*.truth-cases.json` are imported
into `tests/unit/truth-cases/runner.test.ts` (or a sibling file) which iterates
with `forEach` and asserts via `assertNumericField` from `helpers.ts`. Examples:

- `docs/xirr.truth-cases.json` (51 cases) → `runner.test.ts:107-165` (also
  `xirr.test.ts`)
- `docs/waterfall.truth-cases.json` (15 cases) → `runner.test.ts:185-256`
- `docs/waterfall-ledger.truth-cases.json` (14 cases) → `runner.test.ts:259-295`
- `docs/fees.truth-cases.json` (10 cases) → `runner.test.ts:298-345`
- `docs/exit-recycling.truth-cases.json` (20 cases) → `exit-recycling.test.ts`
  and `runner.test.ts:362-404`
- `docs/capital-allocation.truth-cases.json` (20 cases) → load-only verification
  at `runner.test.ts:349-359`

**File structure (from xirr.truth-cases.json):**

```json
{
  "id": "xirr-01-simple-positive-return",
  "scenario": "01-simple-positive-return",
  "tags": ["baseline", "basic"],
  "notes": "Canonical 2-cashflow case...",
  "input": { "cashflows": [...], "config": {...} },
  "expected": { "irr": 0.20103407784113647, "converged": true, ... },
  "category": "basic"
}
```

**Helper `assertNumericField(actual, expected, decimals)`** uses
`expect(actualNumber).toBeCloseTo(expected, decimals)`. Tolerances:

- waterfall: 2 decimals (excelRound parity)
- xirr: 6 decimals
- reserves/pacing: 4 decimals
- For backtesting MC sample percentiles: planner picks (recommend 4 decimals,
  snapshot-locked on first green run per D-09).

**Determinism mechanism:** there is NO existing fixed-seed primitive in the
truth-case harness — XIRR/waterfall/fees are inherently deterministic. Phase 2
is the FIRST truth case to depend on a randomized engine, so the `randomSeed`
field on `UnifiedSimulationConfig` (already exists per Q1) is the seam.

**Recommended new file shape:**

- `docs/backtesting-scenario.truth-cases.json` — single GFC entry with
  `seed: 12345`, `fundId: <fixture id>`, `simulationRuns: 2000`, expected
  `mean`, `p5`, `p25`, `p50`, `p75`, `p95` snapshot-locked on first green run.
- New test file `tests/unit/truth-cases/backtesting-scenario.test.ts` (parallel
  to `xirr.test.ts`) that imports the JSON, calls
  `service.compareScenarios(fundId, ['financial_crisis_2008'], simulationRuns)`
  with the seed, and asserts
  `assertNumericField(result[0].simulatedPerformance.mean, expected.mean, 4)`
  etc.
- Optional: register in `runner.test.ts` for the SUMMARY block at line 407.

**One subtlety:** the existing unit test harness mocks
`unifiedMonteCarloService.runSimulation`, which BYPASSES the real PRNG. The
truth case must NOT mock the unified service — it needs to call the real engine
to validate determinism. This means the truth case harness needs to mock `db`
(for `funds`/`fundBaselines`/`varianceReports` queries) but let the engine run.
See `tests/unit/services/backtesting-service.test.ts:294-307` for the baseline
mock shape — copy that, but DROP the `unifiedMonteCarloService` mock. The
traditional engine path (`forceEngine: 'traditional'`) is the one to exercise
because (a) it uses `PRNG` not the global `Math.random` patch, and (b) it is the
default for test environments per Q1.

## Pitfalls and Anti-Patterns to Avoid

### 1. The streaming engine's `setRandomSeed` patches Math.random globally

`streaming-monte-carlo-engine.ts:1106-1112` does `Math.random = () => { ... }`.
This is a process-wide side effect. If the truth case runs scenarios
sequentially via the streaming engine, each scenario's seed call resets
`Math.random` AND that reset persists outside the simulation. **Mitigation:**
the truth case should pin `forceEngine: 'traditional'` (which uses the proper
local `PRNG` instance at `monte-carlo-engine.ts:259-264`) and assert only
against the traditional engine's output. The streaming engine is gated to
production by default (`monte-carlo-service-unified.ts:502-507`) so test runs
hit the traditional path naturally — but explicit `forceEngine: 'traditional'`
makes the contract obvious.

### 2. The `addToReservoir` reservoir sampling at streaming-monte-carlo-engine.ts:225-240 uses Math.random()

Even with a seeded `setRandomSeed`, the reservoir sampling for percentiles
introduces a second source of nondeterminism in the streaming engine. Another
reason to pin `forceEngine: 'traditional'` for the truth case.

### 3. Do NOT reuse the analytic rescale pattern anywhere

The current `applyMarketAdjustment` pattern at lines 704-738 is what Phase 2 is
killing. Be vigilant during implementation: the deleted code is mathematically
wrong and any "let me port this helper" instinct is the wrong direction. The
replacement is "call the engine, read `result.irr.percentiles`, return as
`DistributionSummary`."

### 4. Engine selection accidentally falls back to streaming

`UnifiedMonteCarloService.selectEngine` at
`monte-carlo-service-unified.ts:394-419` will pick streaming when
`criteria.scenarioCount >= 5000`, `availableMemoryMB < 512`, OR
`systemLoad > 0.8`. CI runners are memory-constrained — the truth case must
explicitly pass `forceEngine: 'traditional'` AND keep `runs <= 2000` to stay
under the threshold AND avoid memory-pressure forcing.

### 5. ESLint linter-edit hook strips orphan imports immediately

MEMORY note: "The project has an ESLint auto-fix hook that runs after every file
edit. It strips unused imports immediately." When deleting
`applyMarketAdjustment`, the `getDefaultMarketParameters` import will auto-strip
on save. The planner should expect this, NOT add a manual delete-import step.
Same for `MarketParameters` import — verify what other code in
`backtesting-service.ts` still uses that type after the rewrite (the type is
still used by `ScenarioComparison.marketParameters` at line 50 of
`shared/types/backtesting.ts` and is RE-IMPORTED at line 47 of
`backtesting-service.ts`, so the import stays).

### 6. backtest_results JSONB column shape — the soft migration boundary

Per D-07, old records carry analytic-rescale values. The plan doc must call this
out. Do NOT attempt a backfill in Phase 2 — that is explicitly deferred.

### 7. exactOptionalPropertyTypes spread pattern

MEMORY note: when adding `marketParameters?: MarketParameters` to
`UnifiedSimulationConfig`, callers that conditionally pass it must use the
spread pattern: `{ ...(marketParams && { marketParameters: marketParams }) }`.
Direct assignment of `marketParameters: undefined` will fail TS strict mode. See
REFL-021. The current `runScenarioComparisons` body at lines 673-679 already
uses this pattern for `baselineId` (line 277) and `randomSeed` (line 278).

### 8. Pre-Push Baseline vs Local tsc

MEMORY note: `npx tsc --noEmit` may pass but `npm run baseline:check` (pre-push
hook) compiles client/server/shared separately. If the planner adds a new field
to a `shared/` type, expect TS4111 (index signature access) errors that local
`npm run check` misses. Run `npm run baseline:check` BEFORE the final commit.

### 9. Planning Docs Drift From Main

MEMORY note: this RESEARCH.md was written 2026-04-07. Before plan execution, the
planner should re-grep the live code for `applyMarketAdjustment`,
`getDefaultMarketParameters`, and the line numbers (645-738) — they may have
shifted from a parallel session.

### 10. Phoenix truth case count drift

MEMORY note: "always run `npm run phoenix:truth` for the live count." Live count
today is **258**. The planner's verification gate must run `phoenix:truth` LIVE
— do not trust a number in this RESEARCH.md older than a few hours.

## Recommended Task Breakdown for the Planner

Suggested **6 plans across 3 waves**, mirroring Phase 1's shape (each plan =
single coherent file scope, atomic commit, SUMMARY.md per plan):

### Wave 0 — Baseline capture (1 plan, blocks Wave 1)

**02-01-baseline-capture-PLAN.md**

- File scope: `tests/unit/services/backtesting-service.test.ts` (additive only —
  new `describe` block) plus
  `.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/before-percentiles.json`
  (new file).
- Adds a "Phase 2 baseline capture" describe block that calls
  `service.compareScenarios(1, ['financial_crisis_2008', 'covid_2020', 'dotcom_bust_2000', 'bull_market_2021', 'rate_hikes_2022'])`
  against the existing mocked engine and writes the resulting
  `simulatedPerformance` blocks to a JSON file via `fs.writeFileSync` (gated
  behind `process.env.CAPTURE_BASELINE === '1'` so it does not run in CI by
  default).
- Operator runs `CAPTURE_BASELINE=1 npm test -- backtesting-service` once on
  `main` to capture the file.
- Commits the JSON. Plan SUMMARY.md notes "before" numbers are now locked.
- **Blocks:** all subsequent waves (the plan doc D-12 needs these numbers).

### Wave 1 — Engine plumbing + rewrite + cleanup (3 plans, parallelizable)

**02-02-marketparameters-config-plumbing-PLAN.md**

- File scope: `server/services/monte-carlo-service-unified.ts`,
  `server/services/monte-carlo-engine.ts`,
  `server/services/streaming-monte-carlo-engine.ts` (and
  `shared/types/backtesting.ts` if the type re-export needs adjusting — verify
  during planning).
- Adds `marketParameters?: MarketParameters` to `SimulationConfig` (so it
  inherits up through `StreamingConfig` and `UnifiedSimulationConfig`).
- Implements the override logic inside both engines' `calibrateDistributions`
  methods (or a new helper that wraps them) — when `config.marketParameters` is
  present, override `multiple.mean`, `multiple.volatility`, `exitTiming.mean`
  (from `holdPeriodYears`), and adjust `irr.mean` for `failureRate` impact.
- Adds a unit test `tests/unit/services/monte-carlo-engine-marketparams.test.ts`
  that asserts the override actually changes the output distribution shape for
  the same fund + seed.
- **Depends on:** none from Phase 2 (can start in parallel with Plan 02-03).
- **Wave:** 1

**02-03-runscenariocomparisons-rewrite-PLAN.md**

- File scope: `server/services/backtesting-service.ts` (single file, multiple
  coordinated edits).
- Adds `import { logger } from '../lib/logger';` and creates a child logger
  `const log = logger.child({ module: 'backtesting' });`.
- Rewrites `runScenarioComparisons` (lines 645-702) to call
  `unifiedMonteCarloService.runSimulation` per scenario with `marketParameters`
  injected and `randomSeed` plumbed through.
- Extracts a new private helper
  `simulationResultToDistributionSummary(result, metric)` that encapsulates the
  existing line 298-307 mapping. Calls it from BOTH the rewritten
  `runScenarioComparisons` AND from `extractSimulationSummary` (DRY refactor).
- **Deletes** `applyMarketAdjustment` (lines 704-738) entirely — the linter hook
  will strip the now-orphan `getDefaultMarketParameters` import at line 25.
- Replaces `console.error` at line 696 with
  `log.warn({ event: 'backtesting.scenario_comparison.failed', fundId, scenario: scenarioName, error: errorMessage }, 'Scenario comparison run failed');`
- Adds the `started` and `completed` Pino events per D-11.
- Verifies existing unit tests still pass (assertions on
  `marketParameters.failureRate`, `keyInsights`, `failedScenarios` — all survive
  per Q7).
- **Depends on:** 02-02 (needs the config field to exist).
- **Wave:** 1

**02-04-severity-reclassify-PLAN.md**

- File scope: `.a5c/processes/sensitivity-stress-panel.inputs.json` (single key
  edit at line 153).
- Changes `"severity": "informational"` to `"severity": "P1"`.
- Optionally updates `actionRequired` text to reference the Phase 2 PR commit
  SHA.
- One-line change, dedicated plan because it is contractually visible
  (REQ-BCK-02).
- **Depends on:** none.
- **Wave:** 1

### Wave 2 — Truth case + plan doc + verification (2 plans)

**02-05-truth-case-and-harness-PLAN.md**

- File scope: `docs/backtesting-scenario.truth-cases.json` (new),
  `tests/unit/truth-cases/backtesting-scenario.test.ts` (new).
- Defines GFC truth case with fixed seed (e.g., `seed: 12345`), fixture fund
  baseline (mocked DB), `simulationRuns: 2000`, `forceEngine: 'traditional'`.
- Test file mocks `db` queries for `funds`/`fundBaselines`/`varianceReports`,
  calls `service.compareScenarios(...)` with the truth case input, asserts
  `assertNumericField(result[0].simulatedPerformance.mean, expected.mean, 4)`
  for mean/p5/p25/p50/p75/p95.
- First green run captures the actual numbers and the operator pastes them into
  the JSON file as the snapshot lock.
- Asserts `mean < default-scenario mean` (per D-09 — requires running default
  scenario in the same test for comparison).
- Updates `runner.test.ts` SUMMARY block at line 407 to include the new file's
  count if desired.
- **Depends on:** 02-02 and 02-03 (the engine override and the rewrite must be
  in place).
- **Wave:** 2

**02-06-plan-doc-and-verification-PLAN.md**

- File scope: `docs/plans/2026-04-XX-backtesting-scenario-comparison-rewrite.md`
  (new).
- Records before/after percentile comparison table (sourced from Wave 0 baseline
  JSON + post-rewrite re-run).
- Includes explicit "satisfies the 2026-01 P0 requirement documented in
  `docs/plans/2026-04-07-backtesting-scenario-comparison-correctness.md`" note.
- Links to commit SHAs from plans 02-01 through 02-05.
- Documents the soft migration boundary (D-07 — old records remain analytic).
- Documents the streaming engine determinism caveat (Pitfall #1).
- Runs `npm run validate:core` and `npm run phoenix:truth` and pastes the live
  counts (target: 259+ truth cases passing).
- **Depends on:** 02-01 through 02-05 all merged.
- **Wave:** 2

### Plan ordering summary

```
Wave 0:  02-01 (baseline capture)
            ↓
Wave 1:  02-02 (engine plumbing) ‖ 02-04 (severity reclass)
                    ↓
            02-03 (rewrite, depends on 02-02)
                    ↓
Wave 2:  02-05 (truth case)
                    ↓
            02-06 (plan doc + verification)
```

`02-04` is independent and can land in any wave; bundling it into Wave 1 keeps
the wave-merge cadence simple.

## Open Questions for the Planner

1. **Engine override path — traditional only or both?** D-01 says the override
   should flow through whichever engine is selected. The traditional engine is
   the default in tests; the streaming engine is the default in production. The
   planner can ship the traditional path in Phase 2 and defer the streaming path
   with a `TODO(phase-3)` note, OR implement both in 02-02. Recommendation:
   implement both, since the streaming engine's `calibrateDistributions` at line
   921 is a copy of the traditional one and the override translation is
   identical — diff cost is low.

2. **MarketParameters → DistributionParameters translation precision.** The
   mapping is partly mechanical (`exitMultiplierMean → multiple.mean`) and
   partly judgmental (`failureRate → ?`). Options: (a) scale `irr.mean` down by
   `(1 - failureRate)`, (b) inject a binomial gate inside
   `generateSingleScenario` that zeroes out a fraction of scenarios matching
   `failureRate`, (c) leave `failureRate` consumed only by the existing
   `generateScenarioInsights` text generator and not the math. Recommendation:
   option (b) is most statistically defensible but requires the deepest engine
   change. Option (a) is the minimum viable. The truth case will lock whichever
   choice is made on first green run.

3. **Truth case fixture: real fund or in-memory mock?** Phase 1's
   leader-election integration test used real Postgres. The Phase 2 truth case
   CAN run against real Postgres (slower, exercises more code) OR can mock the
   DB queries (faster, isolated). Recommendation: mock the DB — the truth case
   is testing the MC engine + scenario injection, not the DB layer. Use the same
   mock pattern as `tests/unit/services/backtesting-service.test.ts:10-37`.

4. **Pino event shape — `alert.backtesting.*` or
   `backtesting.scenario_comparison.*`?** D-11 leaves this open. Phase 1 used
   `alert.planner.*`. Recommendation: use `backtesting.scenario_comparison.*`
   because backtesting is not an alerting subsystem (variance is); the `alert.*`
   namespace was Phase 1's choice for operator-facing alerts that page humans.
   The backtesting service is operator-INVISIBLE except for the run-completion
   log; `backtesting.*` is the more honest namespace.

5. **simulationResultToDistributionSummary helper — public or private?** If it
   stays private to `BacktestingService`, the truth case harness cannot reuse it
   directly. If it is exported, the planner adds a small public surface.
   Recommendation: keep it private; the truth case asserts on
   `result[0].simulatedPerformance.{mean, p5, ...}` which is the public output
   anyway.

6. **runsPerScenario allocation — preserve existing or reduce for the seeded
   truth case?** The CONTEXT D-02 preserves the existing allocation
   (`Math.max(1000, Math.floor(simulationRuns / scenarios.length))`). But the
   truth case might want a smaller `runs` count for fast determinism (e.g.,
   `runs: 500` so the test completes in <1s). The truth case can pass
   `simulationRuns: 500` directly to `compareScenarios` — the allocation will
   still respect the floor of 1000 unless the planner adjusts
   `runScenarioComparisons` to honor smaller values when there is only one
   scenario. Recommendation: leave the floor at 1000 in production code; the
   truth case uses `simulationRuns: 5000` for one scenario which yields 5000
   runs (above the floor) — fast enough on traditional engine (~100ms
   estimated).

## Verified Live State

```
$ grep -n "applyMarketAdjustment" server/services/backtesting-service.ts
682:        const adjustedPerformance = this.applyMarketAdjustment(result, marketParams);
704:  private applyMarketAdjustment(

$ grep -rn "applyMarketAdjustment" server/
server/services/backtesting-service.ts:682:        const adjustedPerformance = this.applyMarketAdjustment(result, marketParams);
server/services/backtesting-service.ts:704:  private applyMarketAdjustment(
```

```
$ grep -rn "getDefaultMarketParameters" server/
server/data/historical-scenarios.ts:217:export function getDefaultMarketParameters(): MarketParameters {
server/services/backtesting-service.ts:25:  getDefaultMarketParameters,
server/services/backtesting-service.ts:708:    const defaultParams = getDefaultMarketParameters();
```

```
$ grep -n "console\." server/services/backtesting-service.ts
696:        console.error(`Failed to run scenario comparison for ${scenarioName}:`, error);
```

(count: 1)

```
$ grep -n "logger" server/services/backtesting-service.ts
(no matches — logger is NOT currently imported)
```

```
$ npm run phoenix:truth 2>&1 | tail -10
 ✓ tests/unit/truth-cases/exit-recycling.test.ts (43 tests) 31ms
 ✓ tests/unit/truth-cases/xirr.test.ts (51 tests) 29ms
 ✓ tests/unit/truth-cases/runner.test.ts (118 tests) 70ms
 ✓ tests/unit/truth-cases/capital-allocation.test.ts (24 tests) 40ms

 Test Files  5 passed (5)
      Tests  258 passed (258)
   Start at  22:20:19
   Duration  2.39s (transform 1.14s, setup 1.86s, collect 1.67s, tests 193ms, environment 1ms, prepare 784ms)
```

**Phase 2 baseline: 258 truth cases passing (5 test files). Target post-rewrite:
259+ with all green.**

## Project Constraints (from CLAUDE.md)

- TypeScript strict mode; NEVER use `any` type
  (`@typescript-eslint/no-explicit-any: 'error'`)
- All mutations must have idempotency
- All updates must use optimistic locking (NA — no DB writes added in this
  phase)
- All cursors must be validated (NA)
- All queue jobs must have timeouts (NA — not adding queue jobs)
- No emoji in code, docs, or logs
- Conventional commits (`docs(02-...)`, `feat(02-...)`, etc.)
- Run `/pre-commit-check` before commits — lint, type, tests must pass
- Pino-only logging per ADR-019 — no `console.*` in new code
- TZ=UTC required for all test runs
- Path aliases: `@/` → `client/src/`, `@shared/` → `shared/`
- Phoenix truth cases must pass before merging calculation changes — Phase 2 IS
  a calc-path change, so the new GFC truth case is on the critical path

## Sources

### Primary (HIGH confidence — direct code reads)

- `server/services/backtesting-service.ts` (lines 1-967 fully read)
- `server/services/monte-carlo-service-unified.ts` (lines 1-552 fully read)
- `server/services/monte-carlo-engine.ts` (lines 1-1000 read in chunks)
- `server/services/streaming-monte-carlo-engine.ts` (lines 1-1145 read in
  chunks)
- `server/data/historical-scenarios.ts` (lines 1-294 fully read)
- `shared/types/backtesting.ts` (lines 1-342 fully read)
- `tests/integration/backtesting-api.test.ts` (lines 1-692 fully read)
- `tests/unit/services/backtesting-service.test.ts` (lines 1-560 read)
- `tests/unit/truth-cases/runner.test.ts` (lines 1-484 fully read)
- `tests/unit/truth-cases/helpers.ts` (lines 1-101 fully read)
- `server/lib/logger.ts` (lines 1-12 fully read)
- `.a5c/processes/sensitivity-stress-panel.inputs.json` (lines 140-156 read)
- `.planning/config.json` (fully read — `nyquist_validation: false` confirmed)
- `.planning/phases/01-variance-automation-1c3-followons/` (file listing — Phase
  1 plan shape reference)

### Live verification commands (executed 2026-04-07)

- `grep -rn "applyMarketAdjustment" server/` → 2 hits, both in
  backtesting-service.ts
- `grep -rn "getDefaultMarketParameters" server/` → 3 hits in 2 files
- `grep -n "console\." server/services/backtesting-service.ts` → 1 hit
  (line 696)
- `grep -n "logger" server/services/backtesting-service.ts` → 0 hits
- `npm run phoenix:truth` → 258 passed / 258 total / 5 test files

## Metadata

**Confidence breakdown:**

- Standard stack (engines, types, helpers): HIGH — direct reads of all source
  files
- Architecture (config plumbing, override path): HIGH — verified `randomSeed`
  already exists; verified `MarketEnvironment` is dead plumbing; verified engine
  selection logic
- Pitfalls: HIGH — Math.random patch verified at line 1106-1112; reservoir
  sampling verified at line 225-240
- Truth case harness: HIGH — runner.test.ts and helpers.ts read end-to-end;
  xirr.truth-cases.json shape verified
- Test impact assessment: HIGH — both test files read in full, mocks identified,
  assertion shapes verified
- Plan task breakdown: MEDIUM — based on Phase 1 shape and the plan/wave
  structure documented in Phase 1's plan files

**Research date:** 2026-04-07 **Valid until:** 2026-04-21 (14 days — code is
stable, no parallel sessions expected on backtesting-service.ts per ROADMAP)
