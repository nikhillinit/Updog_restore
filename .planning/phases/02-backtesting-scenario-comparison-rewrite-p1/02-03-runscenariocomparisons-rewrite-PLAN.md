---
phase: 02-backtesting-scenario-comparison-rewrite-p1
plan: 03
type: execute
wave: 2
depends_on:
  - 01
  - 02
files_modified:
  - server/services/backtesting-service.ts
autonomous: true
requirements:
  - REQ-BCK-01
must_haves:
  truths:
    - 'runScenarioComparisons calls unifiedMonteCarloService.runSimulation ONCE
      PER SCENARIO with marketParameters:
      getScenarioMarketParameters(scenarioName) injected into the config'
    - 'applyMarketAdjustment is fully deleted from
      server/services/backtesting-service.ts (no callers, no definition)'
    - 'getDefaultMarketParameters is no longer imported in
      server/services/backtesting-service.ts (auto-stripped by linter hook after
      applyMarketAdjustment deletion)'
    - 'console.error at line 696 is replaced with a Pino structured log via the
      project logger using the backtesting.scenario_comparison.failed event'
    - 'New Pino structured logs emit backtesting.scenario_comparison.started
      before each scenario run and backtesting.scenario_comparison.completed
      after each successful run'
    - 'A new private helper simulationResultToDistributionSummary maps
      PerformanceDistribution to DistributionSummary and is called from BOTH the
      rewritten runScenarioComparisons AND the existing extractSimulationSummary
      (DRY refactor)'
    - 'failedScenarios array is preserved in the return shape; per-scenario
      errors are caught and the scenario name is appended'
    - 'simulatedPerformance values for each ScenarioComparison are SAMPLE
      percentiles from the scenario-aware run
      (result.irr.percentiles.{p5,p25,p50,p75,p95}) — no analytic 2-parameter
      approximation anywhere'
    - 'Existing unit tests in tests/unit/services/backtesting-service.test.ts
      continue to pass (assertions on marketParameters.failureRate, keyInsights,
      failedScenarios all survive per RESEARCH Q7)'
  artifacts:
    - path: 'server/services/backtesting-service.ts'
      provides:
        'Rewritten runScenarioComparisons + new logger import + new
        simulationResultToDistributionSummary helper + deleted
        applyMarketAdjustment'
      contains: 'backtesting.scenario_comparison.started'
  key_links:
    - from: 'runScenarioComparisons'
      to: 'unifiedMonteCarloService.runSimulation'
      via:
        'marketParameters: getScenarioMarketParameters(scenarioName) injected
        per scenario'
      pattern: 'marketParameters: marketParams'
    - from: 'runScenarioComparisons'
      to: 'simulationResultToDistributionSummary'
      via:
        'helper extracts result.irr.percentiles -> DistributionSummary mapping'
      pattern: 'simulationResultToDistributionSummary'
    - from: 'extractSimulationSummary'
      to: 'simulationResultToDistributionSummary'
      via:
        'DRY refactor — same helper used for both backtest summary and scenario
        comparison'
      pattern: 'simulationResultToDistributionSummary'
    - from: 'runScenarioComparisons error path'
      to: 'logger.warn'
      via: 'backtesting.scenario_comparison.failed event replaces console.error'
      pattern: 'backtesting.scenario_comparison.failed'
---

<objective>
Rewrite `BacktestingService.runScenarioComparisons` (server/services/backtesting-service.ts:645-702) to call `unifiedMonteCarloService.runSimulation` ONCE PER SCENARIO with the scenario-specific `marketParameters` injected (now possible after Plan 02-02), pull SAMPLE percentiles from `result.irr.percentiles`, and DELETE the analytic-rescale `applyMarketAdjustment` method (lines 704-738) entirely. This is the heart of Phase 2 — the change that satisfies REQ-BCK-01 and the original 2026-01 P0 requirement.

Implements decisions D-02 (per-scenario MC injection), D-03 (sample percentiles
from the scenario-aware run), D-04 (delete `applyMarketAdjustment`), D-05
(preserve failedScenarios + replace console.error with Pino), and D-11 (Pino
started/completed structured logs).

Purpose: replace the statistically-incorrect 2-parameter analytic rescale with
real sample percentiles from per-scenario MC runs. After this plan,
`scenarioComparison.simulatedPerformance.{p5,p25,p50,p75,p95}` are SAMPLE
percentiles from the scenario-specific run — exactly what success criterion 2 in
ROADMAP requires.

Output: one modified file (`server/services/backtesting-service.ts`) with:

- New `import { logger } from '../lib/logger';` at the top
- Optional child logger: `const log = logger.child({ module: 'backtesting' });`
- New private helper `simulationResultToDistributionSummary(result, metric)`
  factored from the existing line 297-307 mapping
- `extractSimulationSummary` refactored to call the helper (DRY consolidation)
- `runScenarioComparisons` body entirely rewritten to inject `marketParameters`
  per scenario, pull sample percentiles, emit Pino events
- `applyMarketAdjustment` method DELETED (lines 704-738 gone)
- `getDefaultMarketParameters` import auto-stripped by the linter hook (verify)
- `console.error` at line 696 replaced with
  `log.warn({ event: 'backtesting.scenario_comparison.failed', ... })`
- All existing unit tests pass unchanged (per RESEARCH Q7 — they assert on input
  pass-through and keyInsights, not on the rescale math)

## Phoenix truth case impact (read before starting)

This plan touches CALC PATHS. Per CLAUDE.md and CONTEXT.md,
`npm run phoenix:truth` MUST be green at the end of this plan. Existing truth
cases do not exercise `runScenarioComparisons` directly (verified by RESEARCH
Q7-Q8), so the count should stay at 258 unless Plan 02-02 already added
intermediate cases. The new GFC truth case is added in Plan 02-05, NOT here.

## Pre-action discipline (MEMORY note "Planning Docs Drift From Main")

Before editing the file, run
`grep -n "applyMarketAdjustment" server/services/backtesting-service.ts` to
confirm the function is still at the documented line range. If the line numbers
have shifted (parallel session), update them in your edit but do not rely on the
literal line numbers from this plan.

Also confirm `grep -n "console\." server/services/backtesting-service.ts`
returns exactly ONE hit (line 696). If there are more `console.*` calls, do NOT
clean them up — that is scope creep. Only the line-696 call is in this plan's
scope. </objective>

<execution_context>
@C:/Users/nikhi/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/nikhi/.claude/get-shit-done/templates/summary.md </execution_context>

<context>
@.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-CONTEXT.md
@.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-RESEARCH.md
@.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-02-engine-market-params-override-PLAN.md
@CLAUDE.md

<interfaces>
<!-- Current state of every section that this plan rewrites. Researcher verified these line ranges 2026-04-07 — re-verify before editing per the pre-action discipline note above. -->

From server/services/backtesting-service.ts (lines 17-50, current imports):

```typescript
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { eq, desc, and, gte, lte } from 'drizzle-orm';
import { unifiedMonteCarloService } from './monte-carlo-service-unified';
import {
  getScenarioByName,
  getScenarioMarketParameters,
  getAvailableScenarios,
  getDefaultMarketParameters, // ← TO BE REMOVED (linter auto-strips after applyMarketAdjustment deletion)
} from '../data/historical-scenarios';
import {
  backtestResults,
  fundBaselines,
  varianceReports,
  fundStateSnapshots,
} from '@shared/schema';
import type {
  BacktestResultRecord,
  InsertBacktestResultRecord,
} from '@shared/schema';
import {
  safeDivide,
  calculateNormalizedError,
} from '@shared/validation/backtesting-schemas';
import type {
  // ... types ...
  MarketParameters, // ← STAYS — used by ScenarioComparison.marketParameters
  // ...
} from '@shared/types/backtesting';
```

From server/services/backtesting-service.ts (lines 284-318, the existing
extractSimulationSummary mapping that becomes the helper):

```typescript
private extractSimulationSummary(
  result: Awaited<ReturnType<typeof unifiedMonteCarloService.runSimulation>>,
  config: BacktestConfig
): SimulationSummary {
  const metrics: Partial<Record<BacktestMetric, DistributionSummary>> = {};

  for (const metric of config.comparisonMetrics) {
    const data = result[metric as keyof typeof result];
    if (data && typeof data === 'object' && 'statistics' in data && 'percentiles' in data) {
      const typedData = data as {
        statistics: { mean: number; standardDeviation: number; min: number; max: number };
        percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
      };
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
    }
  }
  // ...
}
```

From server/services/backtesting-service.ts (lines 645-702, the rewrite target):

```typescript
private async runScenarioComparisons(
  fundId: number,
  scenarios: HistoricalScenarioName[],
  simulationRuns: number
): Promise<{
  comparisons: ScenarioComparison[];
  failedScenarios: HistoricalScenarioName[];
}> {
  const comparisons: ScenarioComparison[] = [];
  const failedScenarios: HistoricalScenarioName[] = [];

  for (const scenarioName of scenarios) {
    if (scenarioName === 'custom') {
      failedScenarios.push(scenarioName);
      continue;
    }
    const scenario = getScenarioByName(scenarioName);
    if (!scenario) {
      failedScenarios.push(scenarioName);
      continue;
    }
    const marketParams = getScenarioMarketParameters(scenarioName);
    const runsPerScenario = Math.max(1000, Math.floor(simulationRuns / scenarios.length));
    try {
      const result = await unifiedMonteCarloService.runSimulation({
        fundId,
        runs: runsPerScenario,
        timeHorizonYears: 5,
        forceEngine: 'auto',
      });
      // ↓ THIS IS THE BUG — analytic rescale instead of injecting marketParams
      const adjustedPerformance = this.applyMarketAdjustment(result, marketParams);
      comparisons.push({
        scenario: scenarioName,
        simulatedPerformance: adjustedPerformance,
        description: scenario.description || `Scenario: ${scenarioName}`,
        keyInsights: this.generateScenarioInsights(scenarioName, adjustedPerformance, marketParams),
        marketParameters: marketParams,
      });
    } catch (error) {
      console.error(`Failed to run scenario comparison for ${scenarioName}:`, error);
      failedScenarios.push(scenarioName);
    }
  }
  return { comparisons, failedScenarios };
}
```

From server/services/backtesting-service.ts (lines 704-738, the method to
DELETE):

```typescript
private applyMarketAdjustment(
  result: Awaited<ReturnType<typeof unifiedMonteCarloService.runSimulation>>,
  marketParams: MarketParameters
): DistributionSummary {
  const defaultParams = getDefaultMarketParameters();
  // ... 30+ lines of analytic rescale math (statistically incorrect) ...
}
```

From server/services/monte-carlo-engine.ts:109-128 (PerformanceDistribution
shape — the helper input):

```typescript
export interface PerformanceDistribution {
  scenarios: number[];
  percentiles: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };
  statistics: {
    mean: number;
    standardDeviation: number;
    min: number;
    max: number;
  };
}
```

From server/lib/logger.ts (the Pino import pattern to mirror):

```typescript
import pino from 'pino';
const pinoOptions: pino.LoggerOptions = {
  level: process.env['LOG_LEVEL'] || 'info' /* ... */,
};
export const logger = pino(pinoOptions);
```

</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Rewrite runScenarioComparisons, delete applyMarketAdjustment, add Pino logger and structured events, factor simulationResultToDistributionSummary helper</name>
  <files>server/services/backtesting-service.ts</files>
  <read_first>
    - server/services/backtesting-service.ts (FULL file 1-967 — re-verify line ranges per the planning-doc-drift discipline; key sections: 17-50 imports, 235-258 compareScenariosDetailed/compareScenarios, 271-282 runSimulation, 284-318 extractSimulationSummary, 645-702 runScenarioComparisons, 704-738 applyMarketAdjustment, 740-779 generateScenarioInsights — UNCHANGED)
    - server/services/monte-carlo-service-unified.ts (lines 28-33 UnifiedSimulationConfig — confirm marketParameters field is now present after Plan 02-02; lines 92-130 runSimulation entry — confirm pass-through)
    - server/services/monte-carlo-engine.ts (lines 109-128 PerformanceDistribution — confirm shape used by helper)
    - server/lib/logger.ts (full file — confirm logger export)
    - server/services/monte-carlo-service-unified.ts (line 18 — confirm `import { logger } from '../lib/logger';` is the canonical pattern to mirror)
    - shared/types/backtesting.ts (line 34 area — MarketParameters shape; lines 140-160 area — DistributionSummary, ScenarioComparison)
    - server/data/historical-scenarios.ts (lines 196-220 — getScenarioMarketParameters and getDefaultMarketParameters)
    - tests/unit/services/backtesting-service.test.ts (lines 1-560 — confirm assertions that must survive: marketParameters.failureRate at lines 517-518, keyInsights.some at line 527, result.length === 2 at line 508, failedScenarios at line 541)
    - .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-CONTEXT.md (D-01 through D-12 — every decision references this rewrite)
    - .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-RESEARCH.md (Q5-Q10, Pitfalls 3, 5, 7, 8 — verifies every line number, the linter import strip, the spread pattern, the baseline check)
    - MEMORY note "exactOptionalPropertyTypes Spread Pattern" — REFL-021 (use spread for the marketParameters injection)
    - MEMORY note "Linter Edit Hook Import Ordering" — add new code BEFORE adding new imports OR the same edit, never separate edits
    - MEMORY note "Pre-Push Baseline vs Local tsc" — run `npm run baseline:check` before final commit
  </read_first>
  <action>
This task is one coordinated edit to a single file. There are FIVE coordinated changes; perform them in order so the linter hook does not strip imports prematurely (MEMORY note "Linter Edit Hook").

### Step 1 — Pre-edit grep (planning-doc-drift discipline)

Run these greps and confirm the line numbers BEFORE editing. If any have shifted
from the values below, update the edit to use the current line ranges:

```bash
grep -n "applyMarketAdjustment" server/services/backtesting-service.ts
grep -n "getDefaultMarketParameters" server/services/backtesting-service.ts
grep -n "console\." server/services/backtesting-service.ts
grep -n "private async runScenarioComparisons" server/services/backtesting-service.ts
grep -n "private extractSimulationSummary" server/services/backtesting-service.ts
grep -n "logger" server/services/backtesting-service.ts
```

Expected:

- `applyMarketAdjustment`: 2 hits (call at ~682, definition at ~704)
- `getDefaultMarketParameters`: 2 hits (import at ~25, call at ~708)
- `console.`: 1 hit (line ~696)
- `runScenarioComparisons`: 1 hit (~645)
- `extractSimulationSummary`: 1 hit (~284)
- `logger`: 0 hits (NOT yet imported)

### Step 2 — Add the Pino logger import AND a usage in the same edit

The linter strips orphan imports. Make the import-add and the first usage land
in the SAME save by including BOTH the import line and the rewritten
`runScenarioComparisons` body in one edit (not separate edits).

Add to the imports block (insert after the existing
`import { unifiedMonteCarloService } from './monte-carlo-service-unified';` at
line 20):

```typescript
import { logger } from '../lib/logger';
```

Then near the top of the file, AFTER the imports block and BEFORE the `// =====`
separator (approximately line 51), add a child logger:

```typescript
const backtestingLog = logger.child({ module: 'backtesting' });
```

Use `backtestingLog` (not `log`) as the local name to avoid shadowing any
existing `log` variable in the file.

### Step 3 — Factor the new private helper `simulationResultToDistributionSummary`

Insert a new private method on `BacktestingService` IMMEDIATELY AFTER
`extractSimulationSummary` (around line 318-320). This is the DRY refactor — the
same 10-line block lives in two places after the rewrite, so we extract it once.

```typescript
/**
 * Map a Monte Carlo PerformanceDistribution to the public DistributionSummary
 * shape. Handles the (statistics, percentiles) -> (mean, p5, p25, p50, p75, p95)
 * translation that BOTH extractSimulationSummary AND runScenarioComparisons
 * need. Phase 2 D-03 requires sample percentiles from the scenario-aware run,
 * so this helper reads from result.irr.percentiles directly — never from a
 * post-hoc analytic rescale.
 *
 * Returns null if the metric is not present on the result (defensive — the
 * traditional and streaming engines both populate irr/multiple/dpi/tvpi/totalValue
 * but a future refactor could legitimately omit one).
 */
private simulationResultToDistributionSummary(
  result: Awaited<ReturnType<typeof unifiedMonteCarloService.runSimulation>>,
  metric: 'irr' | 'multiple' | 'dpi' | 'tvpi' | 'totalValue'
): DistributionSummary | null {
  const data = result[metric];
  if (!data || typeof data !== 'object' || !('statistics' in data) || !('percentiles' in data)) {
    return null;
  }
  const typedData = data as {
    statistics: { mean: number; standardDeviation: number; min: number; max: number };
    percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
  };
  return {
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
}
```

Then refactor `extractSimulationSummary` (lines 284-318) to call the helper.
Replace the inner `if/typedData/metrics[metric] = {...}` block with:

```typescript
for (const metric of config.comparisonMetrics) {
  const summary = this.simulationResultToDistributionSummary(
    result,
    metric as 'irr' | 'multiple' | 'dpi' | 'tvpi' | 'totalValue'
  );
  if (summary) {
    metrics[metric] = summary;
  }
}
```

The rest of `extractSimulationSummary` (the
`return { runs, metrics, engineUsed, ... }` part) stays unchanged.

### Step 4 — Rewrite `runScenarioComparisons` (lines 645-702)

Replace the entire body of `runScenarioComparisons` with:

```typescript
private async runScenarioComparisons(
  fundId: number,
  scenarios: HistoricalScenarioName[],
  simulationRuns: number,
  options?: { randomSeed?: number }
): Promise<{
  comparisons: ScenarioComparison[];
  failedScenarios: HistoricalScenarioName[];
}> {
  const comparisons: ScenarioComparison[] = [];
  const failedScenarios: HistoricalScenarioName[] = [];

  // Preserve the existing per-scenario allocation (D-02 — runsPerScenario floor at 1000).
  const runsPerScenario = Math.max(1000, Math.floor(simulationRuns / Math.max(1, scenarios.length)));

  for (const scenarioName of scenarios) {
    if (scenarioName === 'custom') {
      failedScenarios.push(scenarioName);
      continue;
    }
    const scenario = getScenarioByName(scenarioName);
    if (!scenario) {
      failedScenarios.push(scenarioName);
      continue;
    }
    const marketParams = getScenarioMarketParameters(scenarioName);

    backtestingLog.info(
      {
        event: 'backtesting.scenario_comparison.started',
        fundId,
        scenario: scenarioName,
        runs: runsPerScenario,
        marketParamsSummary: {
          exitMultiplierMean: marketParams.exitMultiplierMean,
          failureRate: marketParams.failureRate,
          holdPeriodYears: marketParams.holdPeriodYears,
        },
      },
      'Running scenario-aware Monte Carlo comparison'
    );

    try {
      // D-01 + D-02: inject scenario-specific market parameters AND honor a
      // randomSeed for deterministic truth-case runs. Use the spread pattern
      // for the optional fields per REFL-021 (exactOptionalPropertyTypes).
      const result = await unifiedMonteCarloService.runSimulation({
        fundId,
        runs: runsPerScenario,
        timeHorizonYears: 5,
        forceEngine: 'auto',
        marketParameters: marketParams,
        ...(options?.randomSeed !== undefined ? { randomSeed: options.randomSeed } : {}),
      });

      // D-03: pull SAMPLE percentiles from the scenario-aware run — no analytic
      // rescale, no post-hoc adjustment. The helper extracts the same shape
      // extractSimulationSummary used to compute inline.
      const sampledPerformance = this.simulationResultToDistributionSummary(result, 'irr');
      if (!sampledPerformance) {
        backtestingLog.warn(
          {
            event: 'backtesting.scenario_comparison.failed',
            fundId,
            scenario: scenarioName,
            reason: 'irr_distribution_missing',
          },
          'Scenario comparison run returned no irr distribution'
        );
        failedScenarios.push(scenarioName);
        continue;
      }

      comparisons.push({
        scenario: scenarioName,
        simulatedPerformance: sampledPerformance,
        description: scenario.description || `Scenario: ${scenarioName}`,
        keyInsights: this.generateScenarioInsights(
          scenarioName,
          sampledPerformance,
          marketParams
        ),
        marketParameters: marketParams,
      });

      backtestingLog.info(
        {
          event: 'backtesting.scenario_comparison.completed',
          fundId,
          scenario: scenarioName,
          runs: runsPerScenario,
          irrMean: sampledPerformance.mean,
          irrP5: sampledPerformance.p5,
          irrP95: sampledPerformance.p95,
        },
        'Scenario-aware Monte Carlo comparison completed'
      );
    } catch (error) {
      // D-05: replace console.error with Pino structured log; preserve
      // failedScenarios append behavior so callers see the same shape.
      backtestingLog.warn(
        {
          event: 'backtesting.scenario_comparison.failed',
          fundId,
          scenario: scenarioName,
          err: error instanceof Error ? error.message : String(error),
        },
        'Scenario comparison run failed'
      );
      failedScenarios.push(scenarioName);
    }
  }

  return { comparisons, failedScenarios };
}
```

Notes (do NOT alter):

- The `options?: { randomSeed?: number }` parameter is NEW. It is OPTIONAL so
  existing callers (`compareScenariosDetailed` at line 245, `compareScenarios`
  at line 256) work unchanged. Plan 02-05's truth case will pass
  `{ randomSeed: 12345 }` to lock determinism.
- `compareScenariosDetailed` and `compareScenarios` MUST be updated to plumb
  `options` through. Add a third parameter to both:

```typescript
async compareScenariosDetailed(
  fundId: number,
  scenarios: HistoricalScenarioName[],
  simulationRuns: number = 5000,
  options?: { randomSeed?: number }
): Promise<{ comparisons: ScenarioComparison[]; failedScenarios: HistoricalScenarioName[] }> {
  return this.runScenarioComparisons(fundId, scenarios, simulationRuns, options);
}

async compareScenarios(
  fundId: number,
  scenarios: HistoricalScenarioName[],
  simulationRuns: number = 5000,
  options?: { randomSeed?: number }
): Promise<ScenarioComparison[]> {
  const outcome = await this.compareScenariosDetailed(fundId, scenarios, simulationRuns, options);
  return outcome.comparisons;
}
```

This keeps the public method signatures backward-compatible (the new param is
optional) while enabling Plan 02-05's truth case to pass a seed.

- The `marketParameters: marketParams` field on the unified config call is the
  line that requires Plan 02-02 to have landed first. If Plan 02-02 is not
  merged, this line will fail TypeScript with "Object literal may only specify
  known properties". Verify with `npm run check`.

- `forceEngine: 'auto'` stays as the default. The truth case in 02-05 will pass
  `forceEngine: 'traditional'` explicitly to avoid Pitfall #1 (Math.random
  patch).

- The `irr` metric is hardcoded for the per-scenario sampling because
  `ScenarioComparison.simulatedPerformance` is a single `DistributionSummary`
  representing IRR per the existing API contract (verified in
  shared/types/backtesting.ts:147 area). If a future phase wants per-scenario
  multiple/tvpi distributions, that is a new field on `ScenarioComparison` and a
  separate plan.

### Step 5 — DELETE `applyMarketAdjustment` (lines 704-738)

Remove the entire `private applyMarketAdjustment(...)` method including its
JSDoc and signature. The lines to delete are approximately 704-738, but use the
grep from Step 1 to confirm the live range.

After deletion, save the file. The linter hook will run automatically and SHOULD
strip the now-orphan `getDefaultMarketParameters` import at line 25 (RESEARCH
Pitfall #5 — MEMORY note "Linter Edit Hook"). Verify with:

```bash
grep -n "getDefaultMarketParameters" server/services/backtesting-service.ts
```

Expected: 0 hits. If the linter did NOT strip the import (some edge case in the
auto-fix hook), manually remove the line `getDefaultMarketParameters,` from the
import block at line 22-26.

Do NOT delete `getDefaultMarketParameters` from
`server/data/historical-scenarios.ts` itself — it has its own unit test at
`tests/unit/data/historical-scenarios.test.ts:150-163` that depends on the
export (RESEARCH Q6).

### Step 6 — Verify nothing else broke

```bash
npm run check && npm test -- backtesting-service && npm run phoenix:truth && npm run baseline:check
```

All four MUST pass:

- `npm run check`: 0 type errors. The new `marketParameters` field on the
  unified config requires Plan 02-02 to have landed.
- `npm test -- backtesting-service`: existing tests pass unchanged. RESEARCH Q7
  confirmed:
  - `marketParameters.failureRate === 0.45` (input pass-through, line 517)
  - `marketParameters.exitMultiplierMean === 1.2` (input pass-through, line 518)
  - `keyInsights.some(i => i.includes('failure'))` (line 527, depends on
    `marketParams.failureRate > 0.3`, not on the deleted rescale math)
  - `result.length === 2` (line 508, both scenarios should still produce
    comparisons)
  - `result.length === 1` when one scenario is `'custom'` (line 533, the
    existing skip path stays)
  - `result.failedScenarios === ['custom']` (line 541, the existing skip path
    stays) All survive the rewrite. The OPT-IN baseline-capture block from Plan
    02-01 also remains skipped (no env var set in normal runs).
- `npm run phoenix:truth`: at or above the 258 baseline. This plan does not add
  new truth cases.
- `npm run baseline:check` (pre-push hook): MEMORY note "Pre-Push Baseline vs
  Local tsc" — the pre-push hook compiles client/server/shared separately and
  catches TS4111. Run BEFORE committing to catch index-signature access errors
  that local `npm run check` misses.

### Step 7 — No console.error remains

Run:

```bash
grep -n "console\." server/services/backtesting-service.ts
```

Expected: 0 hits. If any remain, the rewrite missed the line — go back to Step 4
and verify the catch block uses `backtestingLog.warn` not `console.error`.

Do NOT modify `generateScenarioInsights` (lines 740-779). That method takes
`(scenarioName, performance, marketParams)` and the new `sampledPerformance` is
byte-compatible with the old `adjustedPerformance` (both are
`DistributionSummary`), so the call site change is mechanical — no insight
generation changes.

Do NOT touch any other method in the file. Do NOT bump versions. Do NOT clean up
unrelated `console.warn` calls in other files (RESEARCH § Pitfall §3 — scope
creep). </action> <verify> <automated>npm run check && npm test --
backtesting-service && npm run phoenix:truth</automated> </verify>
<acceptance_criteria> -
`grep -c "applyMarketAdjustment" server/services/backtesting-service.ts` returns
`0` -
`grep -c "getDefaultMarketParameters" server/services/backtesting-service.ts`
returns `0` - `grep -c "console\." server/services/backtesting-service.ts`
returns `0` -
`grep -c "import { logger } from '../lib/logger'" server/services/backtesting-service.ts`
returns `1` - `grep -c "backtestingLog" server/services/backtesting-service.ts`
returns at least `4` (declaration + start event + completed event + failed
event) -
`grep -c "backtesting.scenario_comparison.started" server/services/backtesting-service.ts`
returns `1` -
`grep -c "backtesting.scenario_comparison.completed" server/services/backtesting-service.ts`
returns `1` -
`grep -c "backtesting.scenario_comparison.failed" server/services/backtesting-service.ts`
returns at least `1` -
`grep -c "marketParameters: marketParams" server/services/backtesting-service.ts`
returns `1` -
`grep -c "simulationResultToDistributionSummary" server/services/backtesting-service.ts`
returns at least `3` (definition + 2 callers — extractSimulationSummary +
runScenarioComparisons) -
`grep -c "options?: { randomSeed?: number }" server/services/backtesting-service.ts`
returns at least `3` (compareScenariosDetailed, compareScenarios,
runScenarioComparisons signatures) - `npm run check` exits 0 -
`npm test -- backtesting-service` exits 0 (existing tests pass unchanged) -
`npm run phoenix:truth` exits 0 with at least 258 truth cases passing -
`npm run baseline:check` exits 0 (pre-push baseline check — catches TS4111 that
local check misses) - File `server/services/backtesting-service.ts` line count
DECREASED by approximately 25-35 lines (applyMarketAdjustment removed minus new
helper added — net negative) - No `any` type usage in the new code (CLAUDE.md
zero-tolerance policy) - `git diff server/services/backtesting-service.ts` shows
the rewrite targets the documented sections only (imports,
extractSimulationSummary, runScenarioComparisons, applyMarketAdjustment
deletion) — no edits to unrelated methods </acceptance_criteria>
<done>runScenarioComparisons calls runSimulation per scenario with
marketParameters injected, simulatedPerformance is built from sample
percentiles, applyMarketAdjustment is gone, getDefaultMarketParameters is no
longer imported in backtesting-service.ts, console.error is replaced with Pino
structured logs, all existing unit tests pass unchanged, phoenix:truth holds at
or above 258, and the new randomSeed plumbing through
compareScenariosDetailed/compareScenarios is ready for Plan 02-05's truth case
to consume.</done> </task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                                  | Description                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HTTP API -> backtesting service           | The `/api/backtesting/*` route layer calls `compareScenariosDetailed` with `fundId`, `scenarios`, `simulationRuns`. Inputs are validated by Zod schemas at the route layer (out of scope for this plan). The new optional `randomSeed` parameter is NOT exposed via the HTTP API in this plan — only the truth case in 02-05 passes it from server-side test code. |
| backtesting service -> Monte Carlo engine | Internal in-process call. The new `marketParameters` injection routes through Plan 02-02's typed override path.                                                                                                                                                                                                                                                    |
| backtesting service -> structured logger  | Pino logger writes to stdout. No PII in the logged events (`fundId` is an integer ID, `scenario` is an enum string, `marketParamsSummary` only includes the three numeric fields).                                                                                                                                                                                 |

## STRIDE Threat Register

| Threat ID  | Category                      | Component                                                 | Disposition | Mitigation Plan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | ----------------------------- | --------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-02-03-01 | Tampering                     | `marketParameters` injection per scenario                 | accept      | The injected params come from the closed-enum `getScenarioMarketParameters(scenarioName)` (server/data/historical-scenarios.ts:196). The scenario name is type-checked as `HistoricalScenarioName` at the function signature. No external input flows into `marketParameters`.                                                                                                                                                                                                                                                                                                                    |
| T-02-03-02 | Information Disclosure        | Pino structured logs                                      | mitigate    | The new log events include `fundId` (integer), `scenario` (enum), `runs` (integer), and a `marketParamsSummary` containing only three numeric fields (exitMultiplierMean, failureRate, holdPeriodYears). No PII, no secrets, no full fund data. The failed event includes `err.message` only — not the full stack — and the project's pino redact list (server/lib/logger.ts) covers `req.headers.authorization` and `req.headers.cookie` already.                                                                                                                                                |
| T-02-03-03 | Denial of Service             | per-scenario MC runs                                      | mitigate    | The existing `runsPerScenario = Math.max(1000, Math.floor(simulationRuns / scenarios.length))` cap is preserved (D-02). With 5 scenarios and the default `simulationRuns = 5000`, each scenario runs 1000 simulations — the same volume as the pre-rewrite single default run. Total CPU load is roughly 5x the pre-rewrite (5 runs of 1000 vs 1 run of 1000), but the unified service already gates streaming engine selection on memory pressure (RESEARCH Pitfall #4), so the worst case falls back to the traditional engine which is sequential within a single Node process — no fork bomb. |
| T-02-03-04 | Repudiation                   | failedScenarios silent failures                           | mitigate    | The previous behavior used `console.error` which is filtered out of structured log aggregators in production. The new `backtesting.scenario_comparison.failed` event is emitted at `warn` level (visible in production by default) AND includes `fundId`, `scenario`, and `err.message` so operators can trace which scenarios failed for which funds. The `failedScenarios` array in the return value also stays so the API consumer sees the failure list.                                                                                                                                      |
| T-02-03-05 | Phoenix truth case regression | rewrite of calc path                                      | mitigate    | RESEARCH Q7-Q8 verified: existing unit tests assert on input pass-through and keyInsights text, not on the rescale math. Existing truth cases (258) do not exercise `runScenarioComparisons`. The acceptance criteria require both `npm test -- backtesting-service` and `npm run phoenix:truth` to be green.                                                                                                                                                                                                                                                                                     |
| T-02-03-06 | Sample-percentile drift       | the simulationResultToDistributionSummary helper is wrong | mitigate    | The helper is byte-equivalent to the existing 10-line block at lines 297-307 of `extractSimulationSummary` which is already tested by the existing test suite via `runBacktest`. Extracting it into a method does not change the math — the existing assertions on `extractSimulationSummary` output validate the helper. The new `runScenarioComparisons` then reuses the same helper, so a regression in one regresses both — the test surface catches it either way.                                                                                                                           |

</threat_model>

<verification>
- `npm run check` exits 0 — type clean across all imports and the new field
- `npm test -- backtesting-service` exits 0 — RESEARCH Q7's verified survival list (failureRate input pass-through, keyInsights text, failedScenarios skip path) all hold
- `npm run phoenix:truth` exits 0 with the count at or above 258 baseline
- `npm run baseline:check` exits 0 — pre-push hook compiles client/server/shared separately
- `grep -c "applyMarketAdjustment" server/services/backtesting-service.ts` returns 0
- `grep -c "console\." server/services/backtesting-service.ts` returns 0
- `grep -c "backtesting.scenario_comparison" server/services/backtesting-service.ts` returns at least 3 (started + completed + failed)
- The file is shorter than before (applyMarketAdjustment deletion exceeds the new helper + Pino events additions)
</verification>

<success_criteria>

- `runScenarioComparisons` injects
  `marketParameters: getScenarioMarketParameters(scenarioName)` per scenario via
  the unified service config (D-02)
- `simulatedPerformance` for each `ScenarioComparison` is built from SAMPLE
  percentiles via `simulationResultToDistributionSummary(result, 'irr')` (D-03)
- `applyMarketAdjustment` is fully deleted (D-04)
- `getDefaultMarketParameters` import is no longer present in
  `backtesting-service.ts` (linter auto-strip verified)
- `console.error` at line 696 is replaced with
  `backtestingLog.warn({ event: 'backtesting.scenario_comparison.failed', ... })`
  (D-05)
- New `backtesting.scenario_comparison.started` and
  `backtesting.scenario_comparison.completed` Pino events emit per scenario
  (D-11)
- New private helper `simulationResultToDistributionSummary` is called from BOTH
  the rewritten `runScenarioComparisons` AND `extractSimulationSummary` (DRY
  refactor)
- `compareScenariosDetailed` and `compareScenarios` accept an optional
  `options?: { randomSeed?: number }` parameter, plumbed through to
  `runScenarioComparisons` (preparation for Plan 02-05's truth case)
- Existing unit tests pass unchanged (RESEARCH Q7 confirmed survival)
- `npm run phoenix:truth` count holds at or above 258
- No `any` type usage in the new code

</success_criteria>

<output>
After completion, create `.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-03-SUMMARY.md` documenting:

- The exact line counts before and after the rewrite (the file should shrink)
- Confirmation that the linter hook stripped `getDefaultMarketParameters`
  automatically (or note if it had to be removed manually)
- The exact event names emitted by the new Pino logs and the log levels
- The preserved unit test assertions and which line numbers they live at (so the
  next plan can read them at a glance)
- The new `options?: { randomSeed?: number }` plumbing in
  `compareScenariosDetailed` / `compareScenarios` — Plan 02-05 will consume this
- The phoenix:truth count post-plan (target: 258 or higher)
- A note for Plan 02-05: "compareScenarios now accepts an optional third options
  parameter; pass `{ randomSeed: 12345 }` to lock determinism for the GFC truth
  case. The traditional engine PRNG honors this seed (RESEARCH Q1)."
- A note for Plan 02-06: "The before/after percentile comparison can re-run the
  opt-in describe block from Plan 02-01 with CAPTURE_BASELINE=1 against the
  post-rewrite code to capture the 'after' numbers — but the file path and
  codePath label will collide with the 'before' file. Use a separate output path
  like `_baselines/after-percentiles.json` for the post-rewrite capture."
  </output>
