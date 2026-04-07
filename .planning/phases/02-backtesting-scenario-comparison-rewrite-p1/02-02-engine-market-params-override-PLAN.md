---
phase: 02-backtesting-scenario-comparison-rewrite-p1
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - server/services/monte-carlo-engine.ts
  - server/services/streaming-monte-carlo-engine.ts
  - server/services/monte-carlo-service-unified.ts
  - tests/unit/services/monte-carlo-engine-marketparams.test.ts
autonomous: true
requirements:
  - REQ-BCK-01
must_haves:
  truths:
    - 'SimulationConfig has an optional marketParameters field that flows up
      through StreamingConfig and UnifiedSimulationConfig via type extension (no
      new field needed at the unified layer)'
    - 'MonteCarloEngine.calibrateDistributions honors config.marketParameters
      when present, overriding multiple.mean, multiple.volatility,
      exitTiming.mean, and adjusting irr.mean for failureRate impact'
    - 'StreamingMonteCarloEngine.calibrateDistributions honors the same override
      path with the same translation rules so engine selection cannot silently
      change scenario semantics'
    - 'A new unit test asserts that running the same fund with two different
      MarketParameters and the same randomSeed produces two distinct
      distribution shapes (proves the override is wired and not silently
      ignored)'
    - 'Existing engine tests continue to pass (the override is opt-in via the
      new field; default behavior is unchanged when marketParameters is absent)'
  artifacts:
    - path: 'server/services/monte-carlo-engine.ts'
      provides:
        'SimulationConfig.marketParameters optional field + override logic
        inside calibrateDistributions for the traditional engine'
      contains: 'marketParameters?: MarketParameters'
    - path: 'server/services/streaming-monte-carlo-engine.ts'
      provides:
        'Same override logic inside the streaming engine calibrateDistributions
        so engine selection does not silently change scenario semantics'
      contains: 'config.marketParameters'
    - path: 'tests/unit/services/monte-carlo-engine-marketparams.test.ts'
      provides:
        'Unit test asserting marketParameters override actually changes
        distribution shape'
      contains: 'marketParameters'
  key_links:
    - from: 'SimulationConfig.marketParameters'
      to: 'MonteCarloEngine.calibrateDistributions'
      via:
        'config.marketParameters branch overrides multiple.mean and irr.mean
        before runs'
      pattern: 'config.marketParameters'
    - from: 'StreamingConfig (extends SimulationConfig)'
      to: 'StreamingMonteCarloEngine.calibrateDistributions'
      via:
        'inherited marketParameters field consumed via the same override branch'
      pattern: 'config.marketParameters'
---

<objective>
Wire `marketParameters` from `UnifiedSimulationConfig` -> `StreamingConfig` -> `SimulationConfig` -> `MarketEnvironment` consumption inside `calibrateDistributions` of BOTH the traditional and streaming Monte Carlo engines. This is the ONLY real engine work in Phase 2 — the researcher confirmed the existing `MarketEnvironment.marketParameters` slot at `monte-carlo-engine.ts:57-65` and `shared/types/backtesting.ts:50` is dead plumbing that no engine actually consumes today (per RESEARCH.md Q3-Q4).

This plan implements D-01 from CONTEXT.md: extend the config surface and make
BOTH engines respect the override. Without this plan, Plan 02-03's
`runScenarioComparisons` rewrite has nothing to inject — the per-scenario
`marketParameters: getScenarioMarketParameters(scenarioName)` call would be a
no-op pass-through.

Purpose: produce the engine seam that Plan 02-03 will exploit. After this plan
lands, calling
`unifiedMonteCarloService.runSimulation({ fundId, runs, marketParameters: gfcParams, randomSeed: 12345 })`
produces a measurably different distribution shape from the same call without
`marketParameters`.

Output:

- `SimulationConfig` extended with `marketParameters?: MarketParameters`
  (auto-inherited up through `StreamingConfig` and `UnifiedSimulationConfig`)
- `MonteCarloEngine.calibrateDistributions` honors the override
- `StreamingMonteCarloEngine.calibrateDistributions` honors the same override
  with the same translation rules
- New unit test `tests/unit/services/monte-carlo-engine-marketparams.test.ts`
  proving the override changes the output

## Phoenix truth case impact (read before starting)

This plan touches CALC PATHS. Per CLAUDE.md and CONTEXT.md,
`npm run phoenix:truth` MUST be green at the end of this plan. The override is
OPT-IN — when `config.marketParameters` is absent, the calibrate path is
byte-identical to the current behavior, so the existing 258 truth cases should
continue to pass unchanged. Run `npm run phoenix:truth` at the end of this plan
and verify the count is at least 258 with all green. The new GFC truth case
(Plan 02-05) is NOT created in this plan — it depends on this plan landing
first.

## Open question routed to executor (per researcher Q2)

The `MarketParameters -> DistributionParameters` translation has a judgmental
piece for `failureRate`:

Options (researcher recommends option (a) as minimum viable, option (b) as most
defensible):

- (a) Scale `irr.mean` down by `(1 - failureRate)` — minimum viable, fully
  encapsulated inside `calibrateDistributions`
- (b) Inject a binomial gate inside `generateSingleScenario` that zeroes out a
  fraction of scenarios matching `failureRate` — most statistically defensible,
  deepest engine change
- (c) Leave `failureRate` consumed only by the existing
  `generateScenarioInsights` text generator — does not affect math

The executor should pick option (a) for this plan unless they have a strong
reason to go deeper. The truth case in 02-05 will lock whichever choice is made
on first green run. Document the choice in the plan SUMMARY.md so 02-06's plan
doc can call it out as a "the rewrite chose option X for failureRate
translation, which can be revisited in a future phase if statistical
defensibility becomes a P1 concern" note. </objective>

<execution_context>
@C:/Users/nikhi/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/nikhi/.claude/get-shit-done/templates/summary.md </execution_context>

<context>
@.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-CONTEXT.md
@.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-RESEARCH.md
@CLAUDE.md

<interfaces>
<!-- The current type chain that this plan extends. All file:line references verified by RESEARCH.md. -->

From server/services/monte-carlo-engine.ts:47-55 (current SimulationConfig):

```typescript
export interface SimulationConfig {
  fundId: number;
  runs: number; // 1000-10000 simulation runs
  timeHorizonYears: number;
  baselineId?: string;
  portfolioSize?: number;
  deploymentScheduleMonths?: number;
  randomSeed?: number; // For reproducible results
}
```

From server/services/monte-carlo-engine.ts:76-82 (DistributionParameters — the
override target):

```typescript
export interface DistributionParameters {
  irr: { mean: number; volatility: number };
  multiple: { mean: number; volatility: number };
  dpi: { mean: number; volatility: number };
  exitTiming: { mean: number; volatility: number }; // Years to exit
  followOnSize: { mean: number; volatility: number }; // As % of initial
}
```

From shared/types/backtesting.ts:34 (MarketParameters — the override source):

```typescript
export interface MarketParameters {
  exitMultiplierMean: number;
  exitMultiplierVolatility: number;
  failureRate: number;
  followOnProbability: number;
  holdPeriodYears: number;
}
```

From server/services/streaming-monte-carlo-engine.ts:40 (StreamingConfig extends
SimulationConfig):

```typescript
export interface StreamingConfig extends SimulationConfig {
  // streaming-specific fields ... — inherits all of SimulationConfig
}
```

From server/services/monte-carlo-service-unified.ts:28-33
(UnifiedSimulationConfig extends StreamingConfig):

```typescript
export interface UnifiedSimulationConfig extends StreamingConfig {
  forceEngine?: 'streaming' | 'traditional' | 'auto';
  performanceMode?: 'speed' | 'memory' | 'balanced';
  enableFallback?: boolean;
  timeHorizonYears: number;
}
```

**Implication:** adding `marketParameters?: MarketParameters` to
`SimulationConfig` is sufficient — the field flows up through both intermediate
interfaces via the existing `extends` chain. No new fields needed at the
streaming or unified layers.

From server/services/monte-carlo-engine.ts:636-688 (calibrateDistributions
traditional — the override target):

```typescript
private async calibrateDistributions(
  fundId: number,
  baseline: FundBaseline | null
): Promise<DistributionParameters> {
  const reports = await db.query.varianceReports.findMany({ where: ... });
  if (reports.length < 3) {
    return this.getDefaultDistributions(); // lines 690-698
  }
  // ... computes mean/volatility from reports ...
  return { irr: { mean, volatility }, multiple: { ... }, ... };
}
```

From server/services/streaming-monte-carlo-engine.ts:921-973
(calibrateDistributions streaming — copy of traditional, same override target).

From server/services/monte-carlo-engine.ts:259-264 (PRNG seam used for
deterministic test):

```typescript
this.prng = new PRNG();
if (config.randomSeed != null) {
  this.prng.reset(config.randomSeed);
}
```

</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend SimulationConfig with marketParameters and wire override logic into MonteCarloEngine.calibrateDistributions and StreamingMonteCarloEngine.calibrateDistributions</name>
  <files>server/services/monte-carlo-engine.ts, server/services/streaming-monte-carlo-engine.ts, server/services/monte-carlo-service-unified.ts</files>
  <read_first>
    - server/services/monte-carlo-engine.ts (FULL file 1-1000 — focus on lines 47-55 SimulationConfig, 57-65 MarketEnvironment, 76-82 DistributionParameters, 109-128 PerformanceDistribution, 259-264 PRNG seam, 636-688 calibrateDistributions, 690-698 getDefaultDistributions)
    - server/services/streaming-monte-carlo-engine.ts (FULL file 1-1145 — focus on lines 1-50 imports + StreamingConfig, 921-973 calibrateDistributions, 975-983 getDefaultDistributions, 1106-1112 setRandomSeed Math.random patch)
    - server/services/monte-carlo-service-unified.ts (lines 1-130 — confirm UnifiedSimulationConfig extends StreamingConfig, no new field needed at this layer)
    - shared/types/backtesting.ts (line 34 area — MarketParameters interface; line 50 area — the dead plumbing on HistoricalScenario)
    - server/data/historical-scenarios.ts (line 196 — getScenarioMarketParameters function; line 217 — getDefaultMarketParameters function)
    - .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-RESEARCH.md (Q3-Q4 — confirms MarketEnvironment is dead plumbing; Pitfalls 1, 4 — Math.random patch and engine selection)
    - CLAUDE.md § Coding Conventions (NEVER use `any` type)
    - MEMORY note "exactOptionalPropertyTypes Spread Pattern" (callers must use spread pattern for the new optional field)
  </read_first>
  <behavior>
    Specification (TDD-driven). The unit test in Step 4 below is authored FIRST and expected to fail (RED), then the engine changes in Steps 1-3 make it green.

    - When `config.marketParameters` is absent (current default), `calibrateDistributions` returns IDENTICAL output to the pre-plan behavior — proven by running the existing test suite without modifications.
    - When `config.marketParameters` is present with `{ exitMultiplierMean: 2.5, exitMultiplierVolatility: 0.4, holdPeriodYears: 5, failureRate: 0.2, followOnProbability: 0.6 }`, the returned `DistributionParameters` has `multiple.mean === 2.5`, `multiple.volatility === 0.4`, `exitTiming.mean === 5`, and `irr.mean` is scaled by `(1 - 0.2) = 0.8` from the unmodified value.
    - When `config.marketParameters` is present with `{ exitMultiplierMean: 0.5, ... failureRate: 0.6, ... }`, the same fields shift in the opposite direction proving the override is symmetric.
    - Two simulations against the same fund + same `randomSeed` but different `marketParameters` produce two distributions with `result.irr.statistics.mean` values that differ by more than 1e-6 (proves the override actually flows through and is not silently dropped).
    - The streaming engine respects the same override path with the same translation rules. Run the test against `forceEngine: 'traditional'` to keep the test deterministic and avoid the Math.random patch caveat (RESEARCH Pitfall #1).

  </behavior>
  <action>
This task touches three engine files and adds one new test file. Steps:

### Step 1 — Author the failing unit test FIRST (RED)

Create `tests/unit/services/monte-carlo-engine-marketparams.test.ts` with the
following content. Run it BEFORE the engine changes to confirm it fails (the
override branch does not exist yet).

```typescript
/**
 * Unit test for SimulationConfig.marketParameters override (Phase 2 D-01).
 *
 * Proves that calibrateDistributions honors the override when present and is
 * a no-op when absent. Locked to the traditional engine via forceEngine to
 * avoid the streaming engine's Math.random global patch (RESEARCH Pitfall #1).
 *
 * Phase 2 plan 02-02 — REQ-BCK-01.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db at the top so the engines can be imported. Mock returns no variance
// reports so calibrateDistributions falls through to getDefaultDistributions
// (which is the override target — fewer than 3 reports = use defaults).
const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    query: {
      varianceReports: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      fundBaselines: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
  },
}));

vi.mock('../../../server/db', () => ({ db: mockDb }));

import { unifiedMonteCarloService } from '../../../server/services/monte-carlo-service-unified';
import type { MarketParameters } from '@shared/types/backtesting';

const baseConfig = {
  fundId: 1,
  runs: 1000,
  timeHorizonYears: 5,
  forceEngine: 'traditional' as const,
  randomSeed: 12345,
};

const bullParams: MarketParameters = {
  exitMultiplierMean: 3.0,
  exitMultiplierVolatility: 0.4,
  failureRate: 0.1,
  followOnProbability: 0.7,
  holdPeriodYears: 4,
};

const bearParams: MarketParameters = {
  exitMultiplierMean: 1.2,
  exitMultiplierVolatility: 0.6,
  failureRate: 0.5,
  followOnProbability: 0.3,
  holdPeriodYears: 7,
};

describe('SimulationConfig.marketParameters override (Phase 2 D-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.query.varianceReports.findMany.mockResolvedValue([]);
    mockDb.query.fundBaselines.findFirst.mockResolvedValue(null);
  });

  it('produces a measurably different irr distribution mean when bull vs bear marketParameters are injected with the same seed', async () => {
    const bullResult = await unifiedMonteCarloService.runSimulation({
      ...baseConfig,
      marketParameters: bullParams,
    });

    const bearResult = await unifiedMonteCarloService.runSimulation({
      ...baseConfig,
      marketParameters: bearParams,
    });

    // The bull and bear distributions must differ by more than 1e-6 to prove
    // the override actually flows through into the engine. If the override is
    // silently dropped, both calls return the same default distributions and
    // this assertion fails.
    const meanDelta = Math.abs(
      bullResult.irr.statistics.mean - bearResult.irr.statistics.mean
    );
    expect(meanDelta).toBeGreaterThan(1e-6);

    // Sanity: the bull distribution mean should be HIGHER than the bear
    // distribution mean. If they are equal or inverted, the translation
    // function is broken.
    expect(bullResult.irr.statistics.mean).toBeGreaterThan(
      bearResult.irr.statistics.mean
    );
  });

  it('returns default behavior when marketParameters is absent (no regression in existing call sites)', async () => {
    const defaultResult = await unifiedMonteCarloService.runSimulation({
      ...baseConfig,
      // no marketParameters
    });

    // We do not assert on specific numeric values here — getDefaultDistributions
    // is what every existing test depends on. The acceptance is "the test runs
    // successfully without throwing AND produces a sensible distribution
    // (mean is finite, p5 < p95)."
    expect(Number.isFinite(defaultResult.irr.statistics.mean)).toBe(true);
    expect(defaultResult.irr.percentiles.p5).toBeLessThan(
      defaultResult.irr.percentiles.p95
    );
  });
});
```

After creating the file, run `npm test -- monte-carlo-engine-marketparams` and
confirm the FIRST test fails (the meanDelta is 0 because the override branch
does not exist yet). The SECOND test should already pass because it does not
depend on the new behavior.

If the first test passes already (highly unlikely given the dead plumbing
confirmed in RESEARCH Q3-Q4), STOP — that means the override path already exists
and Plan 02-02 is a no-op. Investigate before proceeding.

### Step 2 — Add `marketParameters?: MarketParameters` to `SimulationConfig`

In `server/services/monte-carlo-engine.ts`, modify `SimulationConfig` (lines
47-55):

```typescript
import type { MarketParameters } from '@shared/types/backtesting';
// (add this import near the top of the file alongside the existing imports;
// the linter hook will keep it because the type is referenced in SimulationConfig)

export interface SimulationConfig {
  fundId: number;
  runs: number;
  timeHorizonYears: number;
  baselineId?: string;
  portfolioSize?: number;
  deploymentScheduleMonths?: number;
  randomSeed?: number;
  /**
   * Optional market parameter overrides for scenario-aware Monte Carlo runs.
   * When present, calibrateDistributions overrides multiple.{mean,volatility},
   * exitTiming.mean, and scales irr.mean by (1 - failureRate). When absent,
   * calibration falls through to varianceReports / getDefaultDistributions
   * (current default behavior — backward compatible).
   *
   * See .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-CONTEXT.md
   * D-01 (extend UnifiedSimulationConfig with optional marketParameters).
   */
  marketParameters?: MarketParameters;
}
```

The field auto-inherits up through `StreamingConfig` (which
`extends SimulationConfig`) and `UnifiedSimulationConfig` (which
`extends StreamingConfig`). No edits to `streaming-monte-carlo-engine.ts:40` or
`monte-carlo-service-unified.ts:28-33` needed for the type chain.

Verify with `npm run check`. If `MarketParameters` is not exported from
`@shared/types/backtesting`, fall back to importing it from the relative path or
adjust the export — but the researcher confirmed at line 34 of that file the
export exists.

### Step 3 — Add the override branch in `MonteCarloEngine.calibrateDistributions`

In `server/services/monte-carlo-engine.ts` lines 636-688, modify
`calibrateDistributions` to apply the override AFTER computing the base
distributions but BEFORE returning. Insert the override branch as the LAST step
inside the method:

```typescript
private async calibrateDistributions(
  fundId: number,
  baseline: FundBaseline | null,
  config?: SimulationConfig // ← add this optional parameter to thread the override
): Promise<DistributionParameters> {
  // ... existing variance-reports query and base distribution computation ...
  // ... at the END, BEFORE the existing return statement, insert: ...

  let distributions: DistributionParameters = /* the existing computed value */;

  if (config?.marketParameters) {
    distributions = this.applyMarketParametersOverride(distributions, config.marketParameters);
  }

  return distributions;
}

/**
 * Apply MarketParameters override to a base DistributionParameters object.
 * Translation rules (Phase 2 D-01, executor chose option (a) for failureRate
 * — see Plan 02-02 SUMMARY.md for the rationale):
 *
 * - exitMultiplierMean       -> multiple.mean
 * - exitMultiplierVolatility -> multiple.volatility
 * - holdPeriodYears          -> exitTiming.mean
 * - failureRate              -> scale irr.mean by (1 - failureRate)
 * - followOnProbability      -> followOnSize.mean stays unchanged for now
 *                                (no clean 1:1 mapping; deferred to a future phase)
 *
 * Returns a NEW DistributionParameters object — does not mutate the input.
 */
private applyMarketParametersOverride(
  base: DistributionParameters,
  params: MarketParameters
): DistributionParameters {
  const failureRateScale = Math.max(0, 1 - params.failureRate);
  return {
    irr: {
      mean: base.irr.mean * failureRateScale,
      volatility: base.irr.volatility,
    },
    multiple: {
      mean: params.exitMultiplierMean,
      volatility: params.exitMultiplierVolatility,
    },
    dpi: base.dpi,
    exitTiming: {
      mean: params.holdPeriodYears,
      volatility: base.exitTiming.volatility,
    },
    followOnSize: base.followOnSize,
  };
}
```

Then update the call site of `calibrateDistributions` inside the engine's
`runSimulation` (or wherever it is called — grep `calibrateDistributions(` in
the file) to pass the `config` argument through:

```typescript
const distributions = await this.calibrateDistributions(
  config.fundId,
  baseline,
  config
);
```

Note: the `config` parameter is OPTIONAL on `calibrateDistributions` to preserve
backward compatibility — any other internal caller that does not pass it gets
the unchanged default behavior.

### Step 4 — Mirror the same change in `StreamingMonteCarloEngine.calibrateDistributions`

In `server/services/streaming-monte-carlo-engine.ts` lines 921-973, apply the
IDENTICAL change:

1. Add the optional `config?: StreamingConfig` parameter (or `SimulationConfig`
   — whichever the existing signature accepts; since
   `StreamingConfig extends SimulationConfig` either type works, prefer the most
   specific available)
2. Add the same `applyMarketParametersOverride` private helper method
3. Add the override branch as the last step before return
4. Update the call site inside the streaming engine's `runSimulation` to pass
   `config` through

The translation function MUST be byte-identical between the two engines so
engine selection cannot silently change scenario semantics (RESEARCH Pitfall #4
— engine selection accidentally falls back to streaming on memory pressure).

Consider extracting `applyMarketParametersOverride` to a shared helper file
(e.g. `server/services/lib/distribution-overrides.ts`) to enforce the
byte-identical contract via DRY. Either inline-duplicated-but-identical OR
extracted-shared is acceptable — pick whichever fits the existing module
organization. If extracting, add a one-line import in both engines and a single
test for the helper itself in the same test file.

### Step 5 — Run the test (GREEN)

Run `npm test -- monte-carlo-engine-marketparams` and confirm both tests now
pass. If the first test still fails, check:

1. Did you actually thread `config` into both calibrateDistributions calls?
   (Easy to miss the call site update.)
2. Did you import `MarketParameters` in `monte-carlo-engine.ts`? (Check
   `npm run check`.)
3. Is `forceEngine: 'traditional'` actually selecting the traditional engine?
   (Add a temporary `console.log(result.performance.engineUsed)` and verify.)

### Step 6 — Run the full test gate

After GREEN, run:

```bash
npm run check && npm test -- monte-carlo && npm run phoenix:truth
```

All three MUST pass. The phoenix:truth count must be at least 258 (the pre-plan
baseline per RESEARCH Q8). If phoenix:truth count drops, STOP — the override
branch is leaking into a non-marketParameters call path and breaking truth-case
determinism. Trace the leak before proceeding.

### Step 7 — Document the failureRate translation choice in plan SUMMARY.md

After the implementation is GREEN, the plan SUMMARY.md MUST record which option
was chosen for the `failureRate` translation (a, b, or c) and a one-line
rationale. This record is consumed by Plan 02-06 to populate the plan doc's
"translation choice" section.

Do NOT modify any other behavior in either engine. Do NOT touch
`generateScenarioInsights` (that is Plan 02-03's scope). Do NOT touch
`applyMarketAdjustment` in `backtesting-service.ts` (that is also Plan 02-03's
scope — deletion). Do NOT touch the Math.random patch in
streaming-monte-carlo-engine.ts:1106-1112 (out of scope for this plan; the test
pins `forceEngine: 'traditional'` to avoid that pitfall). </action> <verify>
<automated>npm run check && npm test -- monte-carlo-engine-marketparams && npm
run phoenix:truth</automated> </verify> <acceptance_criteria> -
`grep -c "marketParameters?: MarketParameters" server/services/monte-carlo-engine.ts`
returns at least `1` -
`grep -c "applyMarketParametersOverride" server/services/monte-carlo-engine.ts`
returns at least `2` (definition + call) -
`grep -c "applyMarketParametersOverride" server/services/streaming-monte-carlo-engine.ts`
returns at least `2` OR (if extracted to a shared helper)
`grep -c "applyMarketParametersOverride" server/services/lib/distribution-overrides.ts`
returns at least `1` -
`grep -c "config.marketParameters" server/services/monte-carlo-engine.ts`
returns at least `1` -
`grep -c "config.marketParameters" server/services/streaming-monte-carlo-engine.ts`
returns at least `1` - File
`tests/unit/services/monte-carlo-engine-marketparams.test.ts` exists -
`grep -c "produces a measurably different irr distribution mean" tests/unit/services/monte-carlo-engine-marketparams.test.ts`
returns `1` - `npm run check` exits 0 -
`npm test -- monte-carlo-engine-marketparams` exits 0 with both tests passing -
`npm run phoenix:truth` exits 0 with at least 258 truth cases passing (pre-plan
baseline) - `git diff server/services/monte-carlo-engine.ts` shows additions to
SimulationConfig and calibrateDistributions only — no edits to existing
distribution computation logic -
`git diff server/services/streaming-monte-carlo-engine.ts` shows additions to
calibrateDistributions only — Math.random patch UNCHANGED - The plan SUMMARY.md
records which `failureRate` translation option (a/b/c) was chosen - No `any`
type usage anywhere in the new code (CLAUDE.md zero-tolerance policy)
</acceptance_criteria> <done>The marketParameters override flows from
SimulationConfig through both engines' calibrateDistributions, the new unit test
proves the override produces measurably different output for bull vs bear params
with the same seed, default behavior is unchanged when the field is absent,
phoenix:truth count is at or above 258, and the SUMMARY.md records the
failureRate translation choice for Plan 02-06's plan doc.</done> </task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                                  | Description                                                                                                                                                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| backtesting service -> Monte Carlo engine | The `marketParameters` override is injected by the trusted backtesting service (Plan 02-03), not by external API input. The field is OPTIONAL — when absent, the calibrate path is byte-identical to current behavior. |
| in-process engine call                    | Both engines run in the same Node process as the caller. No network or DB-write boundary added by this plan.                                                                                                           |

## STRIDE Threat Register

| Threat ID  | Category                      | Component                                | Disposition | Mitigation Plan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | ----------------------------- | ---------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-02-02-01 | Tampering                     | DistributionParameters override          | accept      | The override is internal — only callable from the same Node process. No external API exposes `marketParameters` injection. The Plan 02-03 caller validates `getScenarioMarketParameters(scenarioName)` against the named historical scenarios at `server/data/historical-scenarios.ts:196`, which is a closed enum (HistoricalScenarioName).                                                                                                                                                                      |
| T-02-02-02 | Information Disclosure        | n/a                                      | accept      | No new data exposed. The override only changes computed numeric values; nothing is logged or persisted at this layer.                                                                                                                                                                                                                                                                                                                                                                                             |
| T-02-02-03 | Denial of Service             | infinite loop or unbounded multiplier    | mitigate    | The translation function is straight arithmetic (multiply, subtract). `failureRateScale = Math.max(0, 1 - params.failureRate)` is guaranteed to be in `[0, 1]` — no division, no recursion, no unbounded growth. The `MarketParameters` interface bounds `failureRate` to `[0, 1]` by convention (enforced upstream by the historical-scenarios fixture). If a future caller passes `failureRate > 1`, the `Math.max(0, ...)` clamp returns 0 — IRR mean becomes 0, simulation still runs to completion, no DoS.  |
| T-02-02-04 | Engine semantic divergence    | streaming vs traditional engine override | mitigate    | The translation function is byte-identical between the two engines (extracted to a shared helper if practical, or inline-duplicated-but-identical with an explicit comment in both files). RESEARCH Pitfall #4 documented the engine selection memory-pressure fallback as a known surprise — if the override silently produced different output between engines, scenario comparisons would be non-deterministic across CI runners. The acceptance criteria require the helper's grep count match in BOTH files. |
| T-02-02-05 | Phoenix truth case regression | calibrateDistributions changes           | mitigate    | The override is OPT-IN. When `config.marketParameters` is absent, the calibrate path returns IDENTICAL output to the pre-plan code. The acceptance criteria require `npm run phoenix:truth` to be at or above the 258 baseline. If any truth case regresses, the cause is the override leaking into a non-marketParameters call path and the plan must fix the leak before completing.                                                                                                                            |

</threat_model>

<verification>
- `npm run check` exits 0 (type-clean override across all three engine files)
- `npm test -- monte-carlo-engine-marketparams` exits 0 (the new test asserts the override produces measurably different output)
- `npm run phoenix:truth` exits 0 with the count at or above the 258 baseline (no regression in existing truth cases — the override is opt-in)
- `git diff` shows additions only to SimulationConfig, calibrateDistributions in both engines, and the new test file — no edits to existing distribution logic, no edits to the Math.random patch
- The plan SUMMARY.md records the chosen failureRate translation option (a/b/c) so Plan 02-06's plan doc can reference it
</verification>

<success_criteria>

- `SimulationConfig` has an optional `marketParameters?: MarketParameters` field
  (auto-inherited up through `StreamingConfig` and `UnifiedSimulationConfig`)
- `MonteCarloEngine.calibrateDistributions` honors the override via a private
  `applyMarketParametersOverride` helper that translates `MarketParameters` ->
  `DistributionParameters` (multiple, exitTiming, irr.mean scale)
- `StreamingMonteCarloEngine.calibrateDistributions` honors the same override
  with byte-identical translation rules (either inline-duplicated or extracted
  to a shared helper)
- `tests/unit/services/monte-carlo-engine-marketparams.test.ts` exists and
  proves the override produces measurably different output for bull vs bear
  params with the same seed
- Default behavior (no `marketParameters` in config) is unchanged — existing
  engine tests and the 258-case Phoenix truth gate stay green
- The failureRate translation choice (a/b/c per RESEARCH Q2) is documented in
  the plan SUMMARY.md for Plan 02-06's plan doc consumption
- No `any` type usage in the new code

</success_criteria>

<output>
After completion, create `.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-02-SUMMARY.md` documenting:

- The exact line range where `marketParameters` was added to `SimulationConfig`
- The exact line range where `applyMarketParametersOverride` was added in each
  engine (and whether it was inline-duplicated or extracted to a shared helper)
- The chosen failureRate translation option (a/b/c per RESEARCH Q2) and one-line
  rationale
- The phoenix:truth count post-plan (target: 258 or higher; if higher, note
  where the new cases came from)
- The new test file path and the two test names
- Any deviation from the planned approach with rationale
- A note for Plan 02-03: "The marketParameters override is now wired. To inject
  scenario-specific params per scenario, pass
  `marketParameters: getScenarioMarketParameters(scenarioName)` to
  `unifiedMonteCarloService.runSimulation` inside `runScenarioComparisons`. Use
  the spread pattern
  `{ ...(marketParams && { marketParameters: marketParams }) }` to satisfy
  exactOptionalPropertyTypes (REFL-021)." </output>
